// Mentor Dashboard Service
import pool from "../config/db.js";
export async function getMentorDashboardStats(mentorId) {
  try {
    const learnersResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM learners
       WHERE mentor_id = $1`,
      [mentorId]
    );
    const totalLearners = parseInt(learnersResult.rows[0].count) || 0;

    const challengesResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM challenges
       WHERE mentor_id = $1`,
      [mentorId]
    );
    const totalChallenges = parseInt(challengesResult.rows[0].count) || 0;

    const pendingSubmissionsResult = await pool.query(
      `SELECT COUNT(DISTINCT s.id) as count
       FROM submissions s
       JOIN learners l ON s.learner_id = l.id
       WHERE l.mentor_id = $1
         AND s.status = 'submitted'
         AND NOT EXISTS (
           SELECT 1 FROM feedbacks f
           WHERE f.submission_id = s.id
         )`,
      [mentorId]
    );
    const pendingSubmissions = parseInt(pendingSubmissionsResult.rows[0].count) || 0;

    const ratingResult = await pool.query(
      `SELECT rating
       FROM mentors
       WHERE id = $1`,
      [mentorId]
    );
    const rating = parseFloat(ratingResult.rows[0]?.rating) || 0;

    const lessonsResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM mentor_resources
       WHERE mentor_id = $1`,
      [mentorId]
    );
    const totalLessons = parseInt(lessonsResult.rows[0].count) || 0;

    return {
      totalLearners,
      totalChallenges,
      pendingSubmissions,
      rating,
      totalLessons
    };
  } catch (err) {
    console.error("Error getMentorDashboardStats:", err);
    throw err;
  }
}

export async function getPendingSubmissions(mentorId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT s.id, s.created_at, s.status, s.audio_url,
              s.challenge_id,
              lc.id AS learner_challenge_id,
              lc.status AS challenge_status, lc.attempts,
              f.final_score, f.pronunciation_score, f.fluency_score,
              f.content AS feedback,
              f.audio_url AS feedback_audio_url,
              c.title, c.level,
              l.id AS learner_id, u.name AS learner_name, u.email AS learner_email
       FROM submissions s
       JOIN challenges c ON s.challenge_id = c.id
       JOIN learners l ON s.learner_id = l.id
       JOIN users u ON l.user_id = u.id
       LEFT JOIN learner_challenges lc
         ON lc.challenge_id = s.challenge_id
        AND lc.learner_id = l.id
       LEFT JOIN feedbacks f ON f.submission_id = s.id
       WHERE l.mentor_id = $1
         AND f.id IS NULL
       ORDER BY s.created_at DESC
       LIMIT $2`,
      [mentorId, limit]
    );
    return result.rows;
  } catch (err) {
    console.error("Error getPendingSubmissions:", err);
    throw err;
  }
}

export async function getMentorSchedules(mentorId, startDate, endDate) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (title, start_time, end_time, type, meeting_link, is_exam)
        id,
        title,
        description,
        start_time,
        end_time,
        type,
        meeting_link,
        status,
        is_exam,
        notes,
        created_at
       FROM schedules
       WHERE mentor_id = $1
         AND start_time >= $2
         AND start_time <= $3
       ORDER BY title, start_time, end_time, type, meeting_link, is_exam, id ASC`,
      [mentorId, startDate, endDate]
    );
    return result.rows;
  } catch (err) {
    console.error("Error getMentorSchedules:", err);
    throw err;
  }
}
