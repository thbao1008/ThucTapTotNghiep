import express from 'express';
import { createLearnerAccessGuards } from '../middleware/learnerAccess.js';
import { learningWeek, validateGoal, presentWeeklyGoal, weeklyActivityQuery } from '../utils/weeklyGoal.js';

export function createWeeklyGoalRouter({ pool, now = () => new Date() }) {
  const router = express.Router();
  const { selfLearner } = createLearnerAccessGuards({ pool });
  const access = selfLearner({ learnerParam: 'learnerId' });
  router.get('/:learnerId/weekly-goal', access, async (req, res) => {
    try {
      const week = learningWeek(now());
      const { rows } = await pool.query(`SELECT target_days,minutes_per_day,focus,revision
        FROM weekly_learning_goals g JOIN learners l ON l.id=g.learner_id
        WHERE g.learner_id=$1 AND g.week_start=$2 AND l.user_id=$3`, [req.learnerId, week.key, req.user.id]);
      const activity = await pool.query(weeklyActivityQuery, [req.learnerId, week.start, week.end, week.now]);
      return res.json(presentWeeklyGoal(rows[0], Number(activity.rows[0]?.days ?? 0), week));
    } catch {
      return res.status(503).json({ message: 'Không thể tải mục tiêu tuần. Vui lòng thử lại.' });
    }
  });
  router.put('/:learnerId/weekly-goal', access, async (req, res) => {
    const week = learningWeek(now());
    if (!validateGoal(req.body)) return res.status(400).json({ message: 'Mục tiêu cần 1–7 ngày, 5–30 phút/ngày và chủ đề hợp lệ.' });
    if (req.body.week_start !== week.key) return res.status(409).json({ message: 'Đã sang tuần mới. Hãy tải lại mục tiêu trước khi lưu.' });
    const { target_days, minutes_per_day, focus, revision } = req.body;
    try {
      const result = await pool.query(`
        INSERT INTO weekly_learning_goals AS g (learner_id,week_start,target_days,minutes_per_day,focus)
        SELECT id,$2,$3,$4,$5 FROM learners WHERE id=$1 AND user_id=$7
          AND ($6=0 OR EXISTS (SELECT 1 FROM weekly_learning_goals old WHERE old.learner_id=$1 AND old.week_start=$2))
        ON CONFLICT (learner_id,week_start) DO UPDATE SET
          target_days=EXCLUDED.target_days, minutes_per_day=EXCLUDED.minutes_per_day,
          focus=EXCLUDED.focus, revision=g.revision+1, updated_at=now()
        WHERE g.revision=$6
        RETURNING target_days,minutes_per_day,focus,revision
      `, [req.learnerId, week.key, target_days, minutes_per_day, focus, revision, req.user.id]);
      if (!result.rows.length) return res.status(409).json({ message: 'Mục tiêu đã thay đổi. Hãy tải lại trước khi lưu để giữ thay đổi ở tab khác.' });
      return res.json({ week_start: week.key, goal: result.rows[0] });
    } catch {
      return res.status(503).json({ message: 'Chưa xác nhận được mục tiêu đã lưu. Hãy tải lại để kiểm tra trước khi thử lại.' });
    }
  });
  return router;
}
