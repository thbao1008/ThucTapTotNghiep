// Schedule Controller
import * as scheduleService from "../services/scheduleService.js";
import pool from "../config/db.js";
import { createScheduleMutationHandlers } from './scheduleMutationHandlers.js';

export async function getLearnerSchedules(req, res) {
  try {
    const { learnerId } = req.params;
    const { startDate, endDate, status } = req.query;
    
    const learnerCheck = await pool.query(
      `SELECT mentor_id FROM learners WHERE id = $1`,
      [learnerId]
    );
    
    if (!learnerCheck.rows[0]?.mentor_id) {
      return res.json([]);
    }
    
    const schedules = await scheduleService.getLearnerSchedules(learnerId, {
      startDate,
      endDate,
      status
    });
    
    res.json(schedules);
  } catch (err) {
    console.error("❌ Error in getLearnerSchedules:", err);
    res.status(500).json({ error: err.message || "Lỗi khi lấy lịch học" });
  }
}

export async function getMentorSchedules(req, res) {
  try {
    const { mentorId } = req.params;
    const { startDate, endDate, status } = req.query;
    
    const schedules = await scheduleService.getMentorSchedules(mentorId, {
      startDate,
      endDate,
      status
    });
    
    res.json(schedules);
  } catch (err) {
    console.error("❌ Error in getMentorSchedules:", err);
    res.status(500).json({ error: err.message || "Lỗi khi lấy lịch học" });
  }
}

export const { createSchedule, updateSchedule } = createScheduleMutationHandlers({ pool, scheduleService });

export async function deleteSchedule(req, res) {
  try {
    const { scheduleId } = req.params;
    
    await scheduleService.deleteSchedule(scheduleId);
    
    res.json({ message: "Đã xóa lịch học" });
  } catch (err) {
    console.error("❌ Error in deleteSchedule:", err);
    res.status(500).json({ error: err.message || "Lỗi khi xóa lịch học" });
  }
}

export async function getScheduleById(req, res) {
  try {
    const { scheduleId } = req.params;
    const schedule = await scheduleService.getScheduleById(scheduleId);
    
    if (!schedule) {
      return res.status(404).json({ error: "Không tìm thấy lịch học" });
    }
    
    res.json(schedule);
  } catch (err) {
    console.error("❌ Error in getScheduleById:", err);
    res.status(500).json({ error: err.message || "Lỗi khi lấy lịch học" });
  }
}
