import { scheduleId, validateScheduleInterval, normalizeMeetingLink, normalizeScheduleMetadata, validatedScheduleUpdates, parseScheduleTime } from '../utils/scheduleValidation.js';
import { withScheduleTransaction, lockSchedulePair } from '../utils/scheduleTransaction.js';

const conflictSql = `SELECT id FROM schedules
  WHERE mentor_id = $1 AND learner_id = $2 AND status IS DISTINCT FROM 'cancelled'
    AND start_time < $4 AND end_time > $3`;

// Dependencies are injected so validation/ownership behavior is testable without
// importing db.js (which opens a connection at module load).
export function createScheduleMutationHandlers({ pool, scheduleService, now = () => new Date() }) {
  const fail = (res, error, message) => {
    if (error.status === 400) return res.status(400).json({ error: error.message, code: error.code });
    if (['55P03', '57014'].includes(error.code)) return res.status(503).json({ error: 'Lịch học đang được cập nhật. Vui lòng tải lại để kiểm tra.', code: 'SCHEDULE_BUSY' });
    console.error(message, error.code || error.name || 'UNKNOWN_ERROR');
    return res.status(500).json({ error: message });
  };
  const mentorIdentity = req => {
    try { return scheduleId(req.mentorId); } catch { return null; }
  };
  return {
    async createSchedule(req, res) {
      try {
        const mentorId = mentorIdentity(req);
        if (!mentorId) return res.status(403).json({ error: 'Mentor access required' });
        const data = normalizeScheduleMetadata(req.body || {}, { requireTitle: true });
        const learnerId = scheduleId(data.learnerId);
        const interval = validateScheduleInterval(data.startTime, data.endTime, { now: now() });
        const meetingLink = normalizeMeetingLink(data.meetingLink);
        const result = await withScheduleTransaction(pool, async client => {
          await lockSchedulePair(client, mentorId, learnerId);
          const assigned = await client.query('SELECT id FROM learners WHERE id = $1 AND mentor_id = $2 FOR SHARE', [learnerId, mentorId]);
          if (!assigned.rows[0]) return { status: 403, body: { error: 'Learner không thuộc mentor này' } };
          const conflict = await client.query(`${conflictSql} LIMIT 1`, [mentorId, learnerId, interval.startTime, interval.endTime]);
          if (conflict.rows.length) return { status: 400, body: { error: 'Khung giờ này bị trùng với lịch đã đăng ký trong cùng ngày', code: 'SCHEDULE_TIME_CONFLICT' } };
          const schedule = await scheduleService.createSchedule({
            learnerId, mentorId, title: data.title, description: data.description,
            startTime: interval.startTime, endTime: interval.endTime, type: data.type || 'online',
            meetingLink, isExam: data.isExam || false, notes: data.notes
          }, client);
          return { status: 201, body: schedule };
        });
        return res.status(result.status).json(result.body);
      } catch (error) { return fail(res, error, 'Lỗi khi tạo lịch học'); }
    },
    async updateSchedule(req, res) {
      try {
        const mentorId = mentorIdentity(req);
        if (!mentorId) return res.status(403).json({ error: 'Mentor access required' });
        const id = scheduleId(req.params?.scheduleId);
        const result = await withScheduleTransaction(pool, async client => {
          const existing = await scheduleService.getScheduleById(id, client, true);
          // Keep a second ownership check next to mutation, not client-provided IDs.
          if (!existing || Number(existing.id) !== id || Number(existing.mentor_id) !== mentorId) {
            return { status: 404, body: { error: 'Không tìm thấy lịch học' } };
          }
          const { updates, interval } = validatedScheduleUpdates(req.body, existing, { now: now() });
          if (!Object.keys(updates).length) return { status: 200, body: existing };
          // Cancelled rows no longer reserve a slot. Bringing one back must check
          // collisions even when a status-only form preserves its saved times.
          const restoringSlot = existing.status === 'cancelled' && updates.status !== undefined && updates.status !== 'cancelled';
          const conflictInterval = interval || (restoringSlot ? {
            startTime: parseScheduleTime(existing.start_time).toISOString(),
            endTime: parseScheduleTime(existing.end_time).toISOString()
          } : null);
          if (conflictInterval) {
            await lockSchedulePair(client, mentorId, scheduleId(existing.learner_id));
            const conflict = await client.query(`${conflictSql} AND id != $5 LIMIT 1`,
              [mentorId, existing.learner_id, conflictInterval.startTime, conflictInterval.endTime, id]);
            if (conflict.rows.length) return { status: 400, body: { error: 'Khung giờ này bị trùng với lịch đã đăng ký trong cùng ngày', code: 'SCHEDULE_TIME_CONFLICT' } };
          }
          const schedule = await scheduleService.updateSchedule(id, updates, mentorId, client);
          return schedule ? { status: 200, body: schedule } : { status: 404, body: { error: 'Không tìm thấy lịch học' } };
        });
        return res.status(result.status).json(result.body);
      } catch (error) { return fail(res, error, 'Lỗi khi cập nhật lịch học'); }
    }
  };
}
