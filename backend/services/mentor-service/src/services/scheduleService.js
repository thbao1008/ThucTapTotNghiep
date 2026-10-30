// Schedule Service
import pool from "../config/db.js";

export async function getLearnerSchedules(learnerId, options = {}) {
  try {
    const { startDate, endDate, status } = options;
    
    let query = `
      SELECT s.*
      FROM schedules s
      WHERE s.learner_id = $1
    `;
    
    const params = [learnerId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND s.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND s.end_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY s.start_time ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error("❌ Error getting learner schedules:", err);
    throw err;
  }
}

export async function getScheduleById(scheduleId, queryable = pool, forUpdate = false) {
  try {
    const result = await queryable.query(
      `SELECT s.*
      FROM schedules s
      WHERE s.id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [scheduleId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error("❌ Error getting schedule by ID:", err);
    throw err;
  }
}

export async function createSchedule(scheduleData, queryable = pool) {
  try {
    const { learnerId, mentorId, title, description, startTime, endTime, type, meetingLink, isExam, notes } = scheduleData;
    
    const result = await queryable.query(
      `INSERT INTO schedules 
       (learner_id, mentor_id, title, description, start_time, end_time, type, meeting_link, is_exam, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [learnerId, mentorId, title, description, startTime, endTime, type || 'online', meetingLink, isExam || false, notes]
    );
    
    return result.rows[0];
  } catch (err) {
    console.error("❌ Error creating schedule:", err);
    throw err;
  }
}

export async function updateSchedule(scheduleId, updates, mentorId = null, queryable = pool) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.startTime !== undefined) {
      fields.push(`start_time = $${paramIndex++}`);
      values.push(updates.startTime);
    }
    if (updates.endTime !== undefined) {
      fields.push(`end_time = $${paramIndex++}`);
      values.push(updates.endTime);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }
    if (updates.meetingLink !== undefined) {
      fields.push(`meeting_link = $${paramIndex++}`);
      values.push(updates.meetingLink);
    }
    if (updates.isExam !== undefined) {
      fields.push(`is_exam = $${paramIndex++}`);
      values.push(updates.isExam);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }
    
    if (fields.length === 0) {
      return await getScheduleById(scheduleId, queryable);
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(scheduleId);
    let ownerClause = '';
    if (mentorId !== null) {
      values.push(mentorId);
      ownerClause = ` AND mentor_id = $${paramIndex + 1}`;
    }
    
    const result = await queryable.query(
      `UPDATE schedules 
       SET ${fields.join(", ")}
       WHERE id = $${paramIndex}${ownerClause}
       RETURNING *`,
      values
    );
    
    return result.rows[0];
  } catch (err) {
    console.error("❌ Error updating schedule:", err);
    throw err;
  }
}

export async function getMentorSchedules(mentorId, options = {}) {
  try {
    const { startDate, endDate, status } = options;
    
    let query = `
      SELECT s.*
      FROM schedules s
      WHERE s.mentor_id = $1
    `;
    
    const params = [mentorId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND s.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND s.end_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY s.start_time ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error("❌ Error getting mentor schedules:", err);
    throw err;
  }
}

export async function deleteSchedule(scheduleId) {
  try {
    await pool.query(`DELETE FROM schedules WHERE id = $1`, [scheduleId]);
    return true;
  } catch (err) {
    console.error("❌ Error deleting schedule:", err);
    throw err;
  }
}

