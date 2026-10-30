import { UiText } from '../../i18n/UiLanguage.jsx';
// frontend/src/components/learner/ProgressAnalytics.jsx
import React, { useState, useEffect } from "react";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import { 
  FiTrendingUp, 
  FiTrendingDown, 
  FiActivity, 
  FiAward, 
  FiTarget,
  FiCheckCircle,
  FiAlertCircle,
  FiMessageSquare
} from "react-icons/fi";
import "../../styles/progress-analytics.css";
import { loadProgressAnalytics, presentProgressRecommendations, presentProgressActivity } from "../../utils/progressAnalytics.js";

export default function ProgressAnalytics({ analytics: propsAnalytics = null, hideRecommendations = false }) {
  const auth = getAuth();
  const userId = auth?.user?.id ?? auth?.user?._id ?? auth?.user?.user_id ?? null;
  const [analytics, setAnalytics] = useState(propsAnalytics);
  const [loading, setLoading] = useState(!propsAnalytics);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setError(null);
    // Nếu có propsAnalytics, dùng luôn
    if (propsAnalytics) {
      setAnalytics(propsAnalytics);
      setLoading(false);
      return () => controller.abort();
    }

    setAnalytics(null);
    if (!userId) {
      setLoading(false);
      return () => controller.abort();
    }

    async function load() {
      try {
        setLoading(true);
        const data = await loadProgressAnalytics(api, userId, { signal });
        if (!signal.aborted) setAnalytics(data);
      } catch (err) {
        if (!signal.aborted) setError(err?.response?.data?.message || "Lỗi khi tải dữ liệu phân tích. Vui lòng thử lại.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [userId, propsAnalytics]);

  if (loading) {
    return (
      <div className="progress-analytics-page">
        <div className="loading-state">
          <p><UiText text={"Đang tải dữ liệu phân tích..."} /></p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="progress-analytics-page">
        <div className="error-state">
          <p><UiText>{error}</UiText></p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="progress-analytics-page">
        <div className="empty-state">
          <p><UiText text={"Chưa có dữ liệu phân tích. Hãy bắt đầu luyện tập!"} /></p>
        </div>
      </div>
    );
  }

  const { speaking_practice, challenges, overall } = analytics;
  const recommendations = presentProgressRecommendations(analytics.recommendations);
  const activity = presentProgressActivity(analytics);

  return (
    <div className="progress-analytics-page">
      {/* Header đã được xử lý ở dashboard, không cần hiển thị lại */}

      {/* Overall Progress */}
      <div className="analytics-section overall-section">
        <h3>
          <FiTarget />{" "}<UiText text={"Tổng Quan"} />{" "}</h3>
        <div className="overall-stats">
          <div className="stat-card primary">
            <div className="stat-value"><UiText>{overall.overall_score == null ? "—" : Math.round(overall.overall_score)}</UiText></div>
            <div className="stat-label"><UiText>{overall.overall_score == null ? "Không có điểm tổng hợp tương thích" : "Điểm tổng hợp"}</UiText></div>
            {overall.overall_score_rate != null && <div className="stat-progress">
              <div 
                className="stat-progress-bar" 
                style={{ width: `${overall.overall_score_rate * 100}%` }}
              />
            </div>}
          </div>
          
          <div className="stat-card">
            <div className="stat-value"><UiText>{activity.total ?? "—"}</UiText></div>
            <div className="stat-label"><UiText text={"Lượt học đã ghi nhận"} /></div>
          </div>
          
          <div className="stat-card">
            <div className="stat-value"><UiText>{activity.speaking ?? "—"}</UiText></div>
            <div className="stat-label"><UiText text={"Lần Luyện Nói"} /></div>
          </div>
          
          <div className="stat-card">
            <div className="stat-value"><UiText>{activity.challenges ?? "—"}</UiText></div>
            <div className="stat-label"><UiText text={"Challenges Đã Hoàn Thành"} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-value"><UiText>{activity.story ?? "—"}</UiText></div>
            <div className="stat-label"><UiText text={"Phiên Story có lượt trả lời"} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-value"><UiText>{activity.scenario_world ?? "—"}</UiText></div>
            <div className="stat-label"><UiText text={"Scenario Studio hoàn tất"} /></div>
          </div>
        </div>
        <p className="progress-activity-note"><UiText text={"Story tính mỗi phiên có ít nhất một lượt trả lời đã lưu. Scenario Studio ghi nhận phiên hoàn tất qua lựa chọn có hướng dẫn. Các số lượt thể hiện hoạt động học, không phải điểm năng lực."} /></p>
      </div>

      {/* Speaking Practice Stats */}
      <div className="analytics-section">
        <h3>
          <FiActivity />{" "}<UiText text={"Thống Kê Luyện Nói"} />{" "}</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Tổng số lần luyện"} /></div>
            <div className="stat-value"><UiText>{speaking_practice.total_sessions}</UiText></div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Đã hoàn thành"} /></div>
            <div className="stat-value"><UiText>{speaking_practice.completed_sessions}</UiText></div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Điểm trung bình"} /></div>
            <div className="stat-value highlight">
              <UiText>{speaking_practice.average_score == null ? "—" : `${speaking_practice.average_score.toFixed(1)}/100`}</UiText>
            </div>
            <div className="stat-rate">
              <UiText>{speaking_practice.score_rate == null ? "Chưa có dữ liệu" : `Tỷ lệ: ${(speaking_practice.score_rate * 100).toFixed(1)}%`}</UiText>
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Xu hướng (7 ngày gần nhất)"} /></div>
            <div className={`stat-value ${speaking_practice.improvement_trend.is_improving ? 'trend-up' : 'trend-down'}`}>
              {speaking_practice.improvement_trend.is_improving ? (
                speaking_practice.improvement_trend.improvement == null ? <UiText text={"Chưa có dữ liệu"} /> : <><FiTrendingUp /> +{speaking_practice.improvement_trend.improvement.toFixed(2)}</>
              ) : (
                speaking_practice.improvement_trend.improvement == null ? <UiText text={"Chưa có dữ liệu"} /> : <><FiTrendingDown /> {speaking_practice.improvement_trend.improvement.toFixed(2)}</>
              )}
            </div>
          </div>
        </div>

        {/* Score by Level */}
        {speaking_practice.score_by_level && speaking_practice.score_by_level.length > 0 && (
          <div className="level-stats">
            <h4><UiText text={"Điểm theo Level"} /></h4>
            <div className="level-list">
              {speaking_practice.score_by_level.map((level, idx) => (
                <div key={idx} className="level-item">
                  <span className="level-name"><UiText text={"Level"} />{" "}<UiText>{level.level}</UiText></span>
                  <span className="level-score"><UiText>{level.average_score == null ? "—" : `${level.average_score.toFixed(1)}/100`}</UiText></span>
                  <span className="level-count">(<UiText>{level.count}</UiText>{" "}<UiText text={"lần)"} /></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Challenge Stats */}
      <div className="analytics-section">
        <h3>
          <FiAward />{" "}<UiText text={"Thống Kê Challenges"} />{" "}</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Challenges đã lưu hoặc tham gia"} /></div>
            <div className="stat-value"><UiText>{challenges.total_challenges}</UiText></div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Đã hoàn thành"} /></div>
            <div className="stat-value"><UiText>{challenges.completed_challenges ?? 0}</UiText></div>
          </div>

          <div className="stat-item">
            <div className="stat-label"><UiText text={"Lượt có nhận xét Mentor"} /></div>
            <div className="stat-value"><UiText>{challenges.graded_challenges}</UiText></div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Điểm trung bình (chưa xác minh)"} /></div>
            <div className="stat-value highlight">
              <UiText>{challenges.average_final_score == null ? "—" : `${challenges.average_final_score.toFixed(1)}/100`}</UiText>
            </div>
            <div className="stat-rate">
              <UiText>{challenges.score_rate == null ? "Chưa có dữ liệu" : `Tỷ lệ: ${(challenges.score_rate * 100).toFixed(1)}%`}</UiText>
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Phát âm (Mentor)"} /></div>
            <div className="stat-value"><UiText>{challenges.average_pronunciation == null ? "Chưa đánh giá" : `${challenges.average_pronunciation.toFixed(1)}/100`}</UiText></div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Độ trôi chảy"} /></div>
            <div className="stat-value"><UiText>{challenges.average_fluency == null ? "Chưa đánh giá" : `${challenges.average_fluency.toFixed(1)}/100`}</UiText></div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label"><UiText text={"Xu hướng (7 ngày gần nhất)"} /></div>
            <div className={`stat-value ${challenges.improvement_trend.is_improving ? 'trend-up' : 'trend-down'}`}>
              {challenges.improvement_trend.is_improving ? (
                challenges.improvement_trend.improvement == null ? <UiText text={"Chưa có dữ liệu"} /> : <><FiTrendingUp /> +{challenges.improvement_trend.improvement.toFixed(2)}</>
              ) : (
                challenges.improvement_trend.improvement == null ? <UiText text={"Chưa có dữ liệu"} /> : <><FiTrendingDown /> {challenges.improvement_trend.improvement.toFixed(2)}</>
              )}
            </div>
          </div>
        </div>

        {/* Recent Challenges */}
        {challenges.recent_challenges && challenges.recent_challenges.length > 0 && (
          <div className="recent-challenges">
            <h4><UiText text={"Challenges Gần Đây"} /></h4>
            <div className="challenges-list">
              {challenges.recent_challenges.map((challenge, idx) => (
                <div key={idx} className="challenge-item">
                  <div className="challenge-title">{challenge.title}</div>
                  <div className="challenge-scores">
                    <span><UiText text={"Điểm Mentor:"} />{" "}<UiText>{challenge.final_score == null ? "—" : `${challenge.final_score.toFixed(1)}/100`}</UiText></span>
                    <span><UiText text={"Phát âm:"} />{" "}<UiText>{challenge.pronunciation_score == null ? "Chưa đánh giá" : `${challenge.pronunciation_score.toFixed(1)}/100`}</UiText></span>
                    <span><UiText text={"Trôi chảy:"} />{" "}<UiText>{challenge.fluency_score == null ? "Chưa đánh giá" : `${challenge.fluency_score.toFixed(1)}/100`}</UiText></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Recommendations - Chỉ hiển thị nếu không hideRecommendations */}
      {!hideRecommendations && (
        <div className="analytics-section recommendations-section">
          <h3>
            <FiMessageSquare /> <UiText>{recommendations.heading}</UiText>
          </h3>
          {recommendations.notice && (
            <p className="help-text" role="status"><UiText>{recommendations.notice}</UiText></p>
          )}
          
          {recommendations.overall_assessment && (
            <div className="assessment-box">
              <p><UiText>{recommendations.overall_assessment}</UiText></p>
            </div>
          )}

          {recommendations.strengths && recommendations.strengths.length > 0 && (
            <div className="recommendations-group">
              <h4>
                <FiCheckCircle className="icon-success" />{" "}<UiText text={"Điểm Mạnh"} />{" "}</h4>
              <ul className="recommendations-list">
                {recommendations.strengths.map((strength, idx) => (
                  <li key={idx}><UiText>{strength}</UiText></li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.improvements_needed && recommendations.improvements_needed.length > 0 && (
            <div className="recommendations-group">
              <h4>
                <FiAlertCircle className="icon-warning" />{" "}<UiText text={"Cần Cải Thiện"} />{" "}</h4>
              <ul className="recommendations-list">
                {recommendations.improvements_needed.map((improvement, idx) => (
                  <li key={idx}><UiText>{improvement}</UiText></li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.recommendations && recommendations.recommendations.length > 0 && (
            <div className="recommendations-group">
              <h4>
                <FiTarget className="icon-primary" />{" "}<UiText text={"Gợi Ý Cải Thiện"} />{" "}</h4>
              <ul className="recommendations-list">
                {recommendations.recommendations.map((rec, idx) => (
                  <li key={idx}><UiText>{rec}</UiText></li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.priority_areas && recommendations.priority_areas.length > 0 && (
            <div className="recommendations-group">
              <h4>
                <FiTarget className="icon-primary" />{" "}<UiText text={"Lĩnh Vực Ưu Tiên"} />{" "}</h4>
              <ul className="recommendations-list">
                {recommendations.priority_areas.map((area, idx) => (
                  <li key={idx}><UiText>{area}</UiText></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
