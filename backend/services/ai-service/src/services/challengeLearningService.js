// AI Service - Challenge Learning Service
/**
 * Service để AI học từ:
 * 1. Challenges mà mentor tạo
 * 2. Submissions của learner
 * 3. Feedback của mentor về submissions
 */

import pool from "../config/db.js";

/**
 * Lưu challenge được tạo thành công để AI học
 */
export async function learnFromChallengeCreation(challengeId, mentorId) {
  try {
    // Lấy thông tin challenge
    const challengeRes = await pool.query(
      `SELECT c.id, c.title, c.level, c.type, c.created_at,
              t.mentor_id
       FROM challenges c
       JOIN topics t ON c.topic_id = t.id
       WHERE c.id = $1 AND t.mentor_id = $2`,
      [challengeId, mentorId]
    );

    if (challengeRes.rows.length === 0) {
      console.warn(`[challengeLearningService] Challenge ${challengeId} not found for mentor ${mentorId} - challengeLearningService.js:27`);
      return;
    }

    const challenge = challengeRes.rows[0];

    // Lưu vào training data
    await pool.query(
      `INSERT INTO challenge_creator_training 
       (training_type, input_data, expected_output, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (training_type, md5(input_data::text)) DO UPDATE
       SET expected_output = EXCLUDED.expected_output,
           updated_at = NOW()`,
      [
        'challenge_creation',
        JSON.stringify({
          mentor_id: mentorId,
          request_context: 'challenge_created_successfully'
        }),
        JSON.stringify({
          challenge_id: challenge.id,
          title: challenge.title, // AI học cả title
          description: challenge.description, // Và description
          level: challenge.level,
          type: challenge.type,
          created_at: challenge.created_at,
          mentor_id: mentorId
        })
      ]
    );

    console.log(`✅ [challengeLearningService] Learned from challenge creation: ${challengeId} - challengeLearningService.js:59`);
  } catch (err) {
    console.error(`❌ [challengeLearningService] learnFromChallengeCreation error: - challengeLearningService.js:61`, err);
  }
}

/**
 * Lưu submission của learner để AI học
 */
export async function learnFromLearnerSubmission(submissionId, challengeId, learnerId) {
  try {
    // Lấy thông tin submission và challenge
    const submissionRes = await pool.query(
      `SELECT s.id, s.audio_url, s.transcript, s.created_at,
              c.id AS challenge_id, c.title AS challenge_title, c.description AS challenge_description, c.level AS challenge_level,
              l.id AS learner_id
       FROM submissions s
       JOIN challenges c ON s.challenge_id = c.id
       JOIN learners l ON s.learner_id = l.id
       WHERE s.id = $1 AND s.challenge_id = $2 AND s.learner_id = $3`,
      [submissionId, challengeId, learnerId]
    );

    if (submissionRes.rows.length === 0) {
      console.warn(`[challengeLearningService] Submission ${submissionId} not found - challengeLearningService.js:83`);
      return;
    }

    const submission = submissionRes.rows[0];

    // Lưu vào training data
    await pool.query(
      `INSERT INTO challenge_creator_training 
       (training_type, input_data, expected_output, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (training_type, md5(input_data::text)) DO UPDATE
       SET expected_output = EXCLUDED.expected_output,
           updated_at = NOW()`,
      [
        'learner_submission',
        JSON.stringify({
          challenge_id: challengeId,
          challenge_title: submission.challenge_title,
          challenge_description: submission.challenge_description,
          challenge_level: submission.challenge_level
        }),
        JSON.stringify({
          submission_id: submission.id,
          learner_id: learnerId,
          transcript: submission.transcript || null,
          audio_url: submission.audio_url || null,
          created_at: submission.created_at
        })
      ]
    );

    console.log(`✅ [challengeLearningService] Learned from learner submission: ${submissionId} - challengeLearningService.js:115`);
  } catch (err) {
    console.error(`❌ [challengeLearningService] learnFromLearnerSubmission error: - challengeLearningService.js:117`, err);
  }
}

/**
 * Lưu feedback của mentor để AI học cách đánh giá và cải thiện challenge
 */
export async function learnFromMentorFeedback(
  submissionId,
  challengeId,
  learnerId,
  mentorId,
  scores,
  feedbackText,
  feedbackAudioUrl = null
) {
  try {
    // Lấy thông tin đầy đủ
    const fullDataRes = await pool.query(
      `SELECT 
        s.id AS submission_id, s.transcript AS learner_transcript, s.audio_url AS submission_audio,
        c.id AS challenge_id, c.title AS challenge_title, c.description AS challenge_description, 
        c.level AS challenge_level, c.type AS challenge_type,
        f.id AS feedback_id, f.content AS feedback_text, f.audio_url AS feedback_audio,
        f.final_score, f.pronunciation_score, f.fluency_score
       FROM submissions s
       JOIN challenges c ON s.challenge_id = c.id
       LEFT JOIN feedbacks f ON f.submission_id = s.id
       WHERE s.id = $1 AND s.challenge_id = $2 AND s.learner_id = $3`,
      [submissionId, challengeId, learnerId]
    );

    if (fullDataRes.rows.length === 0) {
      console.warn(`[challengeLearningService] Full data not found for submission ${submissionId} - challengeLearningService.js:150`);
      return;
    }

    const data = fullDataRes.rows[0];

    // Phân tích feedback để hiểu:
    // 1. Challenge có phù hợp không?
    // 2. Learner hiểu challenge như thế nào?
    // 3. Điểm nào cần cải thiện trong challenge?

    const trainingInput = {
      challenge_id: challengeId,
      challenge_title: data.challenge_title,
      challenge_description: data.challenge_description,
      challenge_level: data.challenge_level,
      challenge_type: data.challenge_type,
      learner_submission: {
        transcript: data.learner_transcript || null,
        audio_url: data.submission_audio || null
      }
    };

    const trainingOutput = {
      mentor_feedback: {
        text: feedbackText || data.feedback_text || null,
        audio_url: feedbackAudioUrl || data.feedback_audio || null
      },
      scores: {
        final_score: scores.final_score ?? data.final_score ?? null,
        pronunciation_score: scores.pronunciation_score ?? data.pronunciation_score ?? null,
        fluency_score: scores.fluency_score ?? data.fluency_score ?? null
      },
      analysis: {
        // AI sẽ phân tích:
        // - Challenge có rõ ràng không?
        // - Learner có hiểu yêu cầu không?
        // - Grammar requirements có phù hợp không?
        // - Difficulty có đúng level không?
        challenge_clarity: null, // Will be analyzed
        learner_understanding: null, // Will be analyzed
        grammar_requirements_met: null, // Will be analyzed
        difficulty_appropriate: null // Will be analyzed
      }
    };

    // Lưu vào training data
    await pool.query(
      `INSERT INTO challenge_creator_training 
       (training_type, input_data, expected_output, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (training_type, md5(input_data::text)) DO UPDATE
       SET expected_output = EXCLUDED.expected_output,
           updated_at = NOW()`,
      [
        'mentor_feedback',
        JSON.stringify(trainingInput),
        JSON.stringify(trainingOutput)
      ]
    );

    // Gọi AI để phân tích và học
    await analyzeAndLearnFromFeedback(trainingInput, trainingOutput);

    console.log(`✅ [challengeLearningService] Learned from mentor feedback: submission ${submissionId} - challengeLearningService.js:214`);
  } catch (err) {
    console.error(`❌ [challengeLearningService] learnFromMentorFeedback error: - challengeLearningService.js:216`, err);
  }
}

/**
 * Phân tích feedback và học cách cải thiện challenge
 */
async function analyzeAndLearnFromFeedback(trainingInput, trainingOutput) {
  try {
    const mentorAiService = await import("./mentorAiService.js");
    
    // Tạo prompt để AI phân tích
    const analysisPrompt = `Analyze this challenge evaluation:

Challenge:
Title: ${trainingInput.challenge_title}
Description: ${trainingInput.challenge_description}
Level: ${trainingInput.challenge_level}

Learner Submission:
${trainingInput.learner_submission.transcript || 'No transcript'}

Mentor Feedback:
${trainingOutput.mentor_feedback.text || 'No text feedback'}
Scores: Final=${trainingOutput.scores.final_score}, Pronunciation=${trainingOutput.scores.pronunciation_score}, Fluency=${trainingOutput.scores.fluency_score}

Please analyze:
1. Was the challenge clear? (challenge_clarity: true/false with reason)
2. Did the learner understand the requirements? (learner_understanding: true/false with reason)
3. Were grammar requirements met? (grammar_requirements_met: true/false with reason)
4. Was the difficulty appropriate? (difficulty_appropriate: true/false with reason)
5. What improvements could be made to the challenge?

Return JSON format.`;

    const analysis = await mentorAiService.chatWithAI(analysisPrompt, {
      challenge: trainingInput,
      feedback: trainingOutput
    });

    // Parse và lưu analysis
    try {
      const analysisData = JSON.parse(analysis);
      await pool.query(
        `UPDATE challenge_creator_training 
         SET expected_output = jsonb_set(
           expected_output::jsonb,
           '{analysis}',
           $1::jsonb
         )
         WHERE training_type = 'mentor_feedback'
         AND input_data->>'challenge_id' = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [JSON.stringify(analysisData), String(trainingInput.challenge_id)]
      );
    } catch (parseErr) {
      console.warn(`[challengeLearningService] Failed to parse analysis: - challengeLearningService.js:273`, parseErr);
    }
  } catch (err) {
    console.error(`[challengeLearningService] analyzeAndLearnFromFeedback error: - challengeLearningService.js:276`, err);
  }
}

/**
 * Lấy training data để cải thiện AI
 */
export async function getTrainingDataForChallengeCreator(limit = 50) {
  try {
    const res = await pool.query(
      `SELECT training_type, input_data, expected_output, created_at
       FROM challenge_creator_training
       WHERE training_type IN ('challenge_creation', 'learner_submission', 'mentor_feedback')
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.rows;
  } catch (err) {
    console.error(`[challengeLearningService] getTrainingDataForChallengeCreator error: - challengeLearningService.js:296`, err);
    return [];
  }
}

