import { PURCHASE_EXPIRY } from "../../../shared/purchaseLedger.js";
import { getAdditionalLearningActivity } from '../utils/learningActivity.js';
import { learningWeek, presentWeeklyGoal } from '../utils/weeklyGoal.js';
// Progress Analytics Service - Learner progress tracking and AI recommendations
import pool from "../config/db.js";
import { getAIServiceAuthHeaders } from '../utils/aiServiceAuth.js';
import { createAssessmentContract } from "../utils/assessmentContract.js";
import { createProgressOverview } from "../utils/progressAssessment.js";
import { getChallengeActivity } from "../utils/challengeActivity.js";
import { createStaticProgressRecommendations, requestProgressRecommendations } from "../utils/recommendationProvenance.js";

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Lấy progress analytics cho learner
 * Bao gồm: speaking practice stats, challenge stats, AI recommendations
 * @param {number} learnerId - ID của learner
 * @param {string} [authToken] - Authorization token để forward cho AI Service
 */
export async function getProgressAnalytics(learnerId, authToken = null) {
  try {
    // 1. Speaking Practice Statistics
    const speakingStats = await getSpeakingPracticeStats(learnerId);
    
    // 2. Challenge Statistics
    const challengeStats = await getChallengeStats(learnerId);
    
    // 3. Overall Progress
    const additional=await getAdditionalLearningActivity(pool,learnerId);
    const week=learningWeek();
    const {rows:[goal]}=await pool.query('SELECT target_days,minutes_per_day,focus,revision FROM weekly_learning_goals WHERE learner_id=$1 AND week_start=$2',[learnerId,week.key]);
    const learningGoal=presentWeeklyGoal(goal,0,week);
    const overallProgress = createProgressOverview(speakingStats, challengeStats, additional);
    
    // 4. AI Recommendations (sử dụng AI Service để đánh giá và đưa ra gợi ý)
    const {rows:[entitlement]}=await pool.query(`SELECT EXISTS(SELECT 1 FROM purchases p JOIN packages pkg ON pkg.id=p.package_id WHERE p.learner_id=$1 AND p.status='active' AND (${PURCHASE_EXPIRY})>NOW()) AS active`,[learnerId]);
    const aiRecommendations = entitlement.active ? await generateAIRecommendations(
      learnerId,
      speakingStats,
      challengeStats,
      overallProgress,
      authToken,
      additional,
      learningGoal
    ) : createStaticProgressRecommendations(generateDefaultRecommendations(speakingStats,challengeStats,overallProgress,learningGoal));
    
    return {
      speaking_practice: speakingStats,
      challenges: challengeStats,
      ...additional,
      overall: overallProgress,
      recommendations: aiRecommendations,
      generated_at: new Date().toISOString()
    };
  } catch (err) {
    console.error("❌ getProgressAnalytics error:", err);
    throw err;
  }
}

/**
 * Lấy thống kê speaking practice
 */
async function getSpeakingPracticeStats(learnerId) {
  // Tổng số lần luyện nói
  const totalSessions = await pool.query(`
    SELECT COUNT(*) as count,
           COUNT(*) FILTER (WHERE status = 'completed') as completed_count
     FROM speaking_practice_sessions
     WHERE learner_id = $1`,
    [learnerId]
  );
  
  // Keep activity counts, but do not reinterpret legacy score rows without provenance.
  const scoreByLevel = await pool.query(`
    SELECT 
       level,
       COUNT(*) as count
     FROM practice_history
     WHERE learner_id = $1 
       AND practice_type = 'speaking_practice'
       AND average_score IS NOT NULL
     GROUP BY level
     ORDER BY level`,
    [learnerId]
  );
  
  const totalCount = parseInt(totalSessions.rows[0]?.count || 0);
  const completedCount = parseInt(totalSessions.rows[0]?.completed_count || 0);
  
  return {
    assessment_contract: createAssessmentContract({
      type: "content_matching",
      source: "legacy_practice_history",
      method: "score_provenance_unavailable",
      scale: "unknown",
      status: "not_assessed",
      metrics: { average_content_match: null }
    }),
    total_sessions: totalCount,
    completed_sessions: completedCount,
    average_score: null,
    total_score: null,
    score_rate: null,
    score_by_level: scoreByLevel.rows.map(row => ({
      level: row.level,
      average_score: null,
      count: parseInt(row.count || 0)
    })),
    improvement_trend: {
      recent_7_days: null,
      previous_7_days: null,
      improvement: null,
      is_improving: false
    }
  };
}

/**
 * Lấy thống kê challenges
 */
async function getChallengeStats(learnerId) {
  // Tổng số challenges đã làm
  const activity = await getChallengeActivity(pool, learnerId);
  
  // List reviewed challenges without exposing unverified legacy scores.
  const scoreByChallenge = await pool.query(`
    SELECT 
       c.id as challenge_id,
       c.title,
       f.updated_at
     FROM learner_challenges lc
     JOIN challenges c ON lc.challenge_id = c.id
     INNER JOIN feedbacks f ON f.id = lc.feedback_id
     WHERE lc.learner_id = $1
     ORDER BY f.updated_at DESC
     LIMIT 10`,
    [learnerId]
  );
  
  // Count feedback activity; score trends are unavailable without verified scales.
  const improvementTrend = await pool.query(`
    WITH recent_period AS (
       SELECT COUNT(f.id) as review_count
       FROM learner_challenges lc
       INNER JOIN feedbacks f ON f.id = lc.feedback_id
       WHERE lc.learner_id = $1 
         AND f.updated_at >= CURRENT_DATE - INTERVAL '7 days'
     ),
     previous_period AS (
       SELECT COUNT(f.id) as review_count
       FROM learner_challenges lc
       INNER JOIN feedbacks f ON f.id = lc.feedback_id
       WHERE lc.learner_id = $1 
         AND f.updated_at >= CURRENT_DATE - INTERVAL '14 days'
         AND f.updated_at < CURRENT_DATE - INTERVAL '7 days'
     )
     SELECT 
       r.review_count as recent_review_count,
       p.review_count as previous_review_count
     FROM recent_period r
     CROSS JOIN previous_period p`,
    [learnerId]
  );
  
  const trend = improvementTrend.rows[0];
  
  return {
    assessment_contract: createAssessmentContract({
      type: "mentor_review",
      source: "mentor",
      method: "legacy_scale_unverified",
      scale: "unknown",
      status: "not_assessed",
      metrics: {
        final_score: null,
        pronunciation: null,
        fluency: null
      }
    }),
    ...activity,
    average_final_score: null,
    average_pronunciation: null,
    average_fluency: null,
    total_score: null,
    score_rate: null,
    recent_challenges: scoreByChallenge.rows.map(row => ({
      challenge_id: row.challenge_id,
      title: row.title,
      final_score: null,
      pronunciation_score: null,
      fluency_score: null,
      completed_at: row.updated_at
    })),
    improvement_trend: {
      recent_7_days: trend?.recent_review_count ?? 0,
      previous_7_days: trend?.previous_review_count ?? 0,
      improvement: null,
      is_improving: false
    }
  };
}

/**
 * Generate AI recommendations sử dụng AI Service
 * @param {number} learnerId - ID của learner
 * @param {object} speakingStats - Thống kê speaking practice
 * @param {object} challengeStats - Thống kê challenges
 * @param {object} overallProgress - Tổng quan tiến độ
 * @param {string} [authToken] - Authorization token để forward cho AI Service
 */
async function generateAIRecommendations(learnerId, speakingStats, challengeStats, overallProgress, authToken = null, additional = {}, learningGoal = null) {
  try {
    const formatScore = value => value == null ? "Chưa có dữ liệu" : Number(value).toFixed(2);
    const formatRate = value => value == null ? "Chưa có dữ liệu" : `${(value * 100).toFixed(1)}%`;
    // Tạo prompt cho AI để đánh giá và đưa ra gợi ý
    const analysisPrompt = `Bạn là trợ lý học tiếng Anh. Hãy phân tích hoạt động học tập đã được cung cấp và đưa ra nhiệm vụ luyện tập tiếp theo.
Không suy ra tiến bộ, trình độ, lỗi phát âm, độ trôi chảy hoặc điểm yếu từ số lượt luyện tập hay số nhận xét Mentor.
Chỉ kết luận về kỹ năng khi có điểm và bằng chứng tương thích đã xác minh; nếu thiếu thì nêu rõ chưa đủ dữ liệu.
Learner học chính với AI; nhận xét Mentor là hỗ trợ tùy nhu cầu, không phải điều kiện hoàn thành bài.

THỐNG KÊ LUYỆN NÓI:
- Tổng số lần luyện: ${speakingStats.total_sessions}
- Số lần hoàn thành: ${speakingStats.completed_sessions}
- Điểm trung bình: ${formatScore(speakingStats.average_score)}/100
- Tỷ lệ điểm: ${formatRate(speakingStats.score_rate)}
- Xu hướng: ${formatScore(speakingStats.improvement_trend.improvement)} điểm

THỐNG KÊ CHALLENGES:
- Tổng số challenges: ${challengeStats.total_challenges}
- Số challenges đã hoàn thành: ${challengeStats.completed_challenges}
- Số lượt có nhận xét của Mentor: ${challengeStats.graded_challenges}
- Điểm tổng của Mentor: chưa tổng hợp do thiếu provenance/thang điểm đã xác minh.
- Phát âm và độ trôi chảy: chưa tổng hợp do thiếu provenance/thang điểm đã xác minh.
- Tỷ lệ điểm: ${formatRate(challengeStats.score_rate)}
- Xu hướng: ${formatScore(challengeStats.improvement_trend.improvement)} điểm

STORY VÀ SCENARIO (chỉ thống kê hoạt động, không phải điểm kỹ năng):
- Story đã có lời người học: ${additional.story?.practiced_sessions ?? 0} phiên, ${additional.story?.user_turns ?? 0} lượt nói có nội dung.
- Scenario có lựa chọn đã hoàn tất: ${additional.scenario_world?.completed_sessions ?? 0} phiên; không suy ra kỹ năng tự diễn đạt từ lựa chọn.
MỤC TIÊU TUẦN ĐÃ CHỌN:
${learningGoal?.goal ? JSON.stringify({focus:learningGoal.goal.focus,target_days:learningGoal.goal.target_days,minutes_per_day:learningGoal.goal.minutes_per_day}) : 'Chưa đặt mục tiêu; không tự gán mục tiêu cho học viên.'}
Ưu tiên nhiệm vụ luyện phù hợp mục tiêu đã chọn và thời gian mỗi ngày. Số lượt không chứng minh năng lực hoặc tiến bộ.

TỔNG QUAN:
- Điểm tổng thể: Chưa tính vì các loại đánh giá có phương pháp và nguồn khác nhau.
- Tổng số lần luyện tập: ${overallProgress.total_practice_count}

Hãy đưa ra:
1. Tóm tắt hoạt động có bằng chứng (2-3 câu)
2. Điểm mạnh có bằng chứng; dùng mảng rỗng nếu chưa đủ dữ liệu
3. Điểm cần cải thiện có bằng chứng; dùng mảng rỗng nếu chưa đủ dữ liệu
4. Gợi ý hành động cụ thể, vừa sức để Learner chọn, không yêu cầu chờ Mentor chấm

Trả về JSON:
{
  "overall_assessment": "string",
  "strengths": ["string"],
  "improvements_needed": ["string"],
  "recommendations": ["string"],
  "priority_areas": ["string"] // Các lĩnh vực cần ưu tiên
}`;

    return await requestProgressRecommendations({
      url: `${process.env.API_GATEWAY_URL || `http://localhost:${process.env.API_GATEWAY_PORT || 4000}`}/api/ai/internal/assistant/conversation`,
      headers: { 'Content-Type': 'application/json', ...getAIServiceAuthHeaders() },
      message: analysisPrompt,
      fallbackRecommendations: generateDefaultRecommendations(speakingStats, challengeStats, overallProgress, learningGoal)
    });
  } catch (err) {
    console.error("❌ generateAIRecommendations error:", err);
    // Fallback to default recommendations
    return createStaticProgressRecommendations(
      generateDefaultRecommendations(speakingStats, challengeStats, overallProgress, learningGoal)
    );
  }
}

/**
 * Generate default recommendations dựa trên data
 */
function generateDefaultRecommendations(speakingStats, challengeStats, overallProgress, learningGoal) {
  const recommendations = [...(learningGoal?.next_steps || [])];
  
  // Recommendations dựa trên speaking practice
  if (speakingStats.average_score != null && speakingStats.average_score < 70) {
    recommendations.push("Tăng cường luyện nói để cải thiện điểm số. Mục tiêu: đạt 70/100 trở lên.");
  }
  
  if (speakingStats.completed_sessions < 10) {
    recommendations.push(`Bạn đã hoàn thành ${speakingStats.completed_sessions} bài luyện nói. Hãy luyện tập thêm để cải thiện kỹ năng.`);
  }
  
  // Recommendations dựa trên challenges
  if (challengeStats.average_final_score != null && challengeStats.average_final_score < 70) {
    recommendations.push("Tập trung vào challenges để cải thiện điểm số. Mentor sẽ đánh giá chi tiết hơn.");
  }
  
  if (
    challengeStats.average_pronunciation != null &&
    challengeStats.average_fluency != null &&
    challengeStats.average_pronunciation < challengeStats.average_fluency
  ) {
    recommendations.push("Cần cải thiện phát âm. Hãy luyện tập phát âm các từ khó thường xuyên hơn.");
  } else if (
    challengeStats.average_fluency != null &&
    challengeStats.average_pronunciation != null &&
    challengeStats.average_fluency < challengeStats.average_pronunciation
  ) {
    recommendations.push("Cần cải thiện độ trôi chảy. Hãy luyện tập nói liên tục và tự nhiên hơn.");
  }
  
  if (
    speakingStats.improvement_trend.improvement != null &&
    challengeStats.improvement_trend.improvement != null &&
    speakingStats.improvement_trend.improvement <= 0 &&
    challengeStats.improvement_trend.improvement <= 0
  ) {
    recommendations.push("Tiến độ chưa cải thiện. Hãy xem lại các lỗi và tập trung vào các điểm yếu.");
  }
  
  return recommendations.length ? recommendations : ["Chọn một bài luyện phù hợp, xem phản hồi và thử diễn đạt lại một câu."];
}
