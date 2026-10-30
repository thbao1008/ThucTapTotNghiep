import { resolveMentorId } from './mentorSubmission.js';

const positiveId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
const active = signal => { if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError'); };

export function localDateKey(value) {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextMonday(now = new Date()) {
  const date = new Date(now); date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + (date.getDay() === 0 ? 1 : 8 - date.getDay()));
  return date;
}

export function nextSunday(now = new Date()) {
  const date = nextMonday(now); date.setDate(date.getDate() + 6); date.setHours(23, 59, 59, 999); return date;
}

export function isInNextWeek(value, now = new Date()) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const date = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
  if (dateOnly && localDateKey(date) !== value) return false;
  return Number.isFinite(date.getTime()) && date >= nextMonday(now) && date <= nextSunday(now);
}

export function safeMeetingHref(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020]/.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function scheduleDayRows(rows, date) {
  const key = localDateKey(date);
  return rows.filter(row => key && localDateKey(row.start_time) === key)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

export function validateScheduleDraft(draft, now = new Date()) {
  if (typeof draft.title !== 'string' || !draft.title.trim()) return 'Chưa nhập tiêu đề';
  if (!draft.date || !isInNextWeek(draft.date, now)) return 'Ngày phải trong tuần tiếp theo';
  if (!/^\d{2}:\d{2}$/.test(draft.startTime) || !/^\d{2}:\d{2}$/.test(draft.endTime)) return 'Chưa chọn giờ hợp lệ';
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(draft.startTime), end = minutes(draft.endTime);
  if (Number(draft.startTime.slice(3)) > 59 || Number(draft.endTime.slice(3)) > 59
      || start < 480 || start >= 1260 || end <= 480 || end > 1260) return 'Giờ học phải trong khoảng 8h-21h';
  if (start >= end) return 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc';
  if (draft.type === 'online' && draft.meetingLink?.trim() && !safeMeetingHref(draft.meetingLink)) return 'Link meeting phải dùng http hoặc https hợp lệ';
  return null;
}

function checkedSchedules(rows) {
  const validTime = value => (typeof value === 'string' && value.trim() !== '' || value instanceof Date)
    && Number.isFinite(new Date(value).getTime());
  if (!Array.isArray(rows) || rows.some(row => !row || !positiveId(row.id)
    || !validTime(row.start_time) || !validTime(row.end_time)
    || new Date(row.end_time) <= new Date(row.start_time))) throw new Error('Dữ liệu lịch học không hợp lệ.');
  return rows;
}

export async function loadCalendarSchedules(api, { learnerId, mentorId, date, signal }) {
  active(signal);
  if (!learnerId && !mentorId) return { schedules: [], hasMentor: false };
  if (!positiveId(mentorId || learnerId)) throw new Error('Thông tin lịch học không hợp lệ.');
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  const params = { startDate: start.toISOString(), endDate: end.toISOString() };
  if (!mentorId) {
    const { data } = await api.get(`/learners/${learnerId}/mentor`, { signal }); active(signal);
    if (data?.mentor_id === null) return { schedules: [], hasMentor: false };
    if (!positiveId(data.mentor_id)) throw new Error('Thông tin mentor không hợp lệ.');
  }
  const { data } = await api.get(mentorId ? `/mentors/${mentorId}/dashboard/schedules` : `/learners/${learnerId}/schedules`, { params, signal });
  active(signal);
  return { schedules: checkedSchedules(mentorId ? data?.schedules : data), hasMentor: true };
}

export async function loadMentorScheduleData(api, { userId, week, signal }) {
  const mentorId = await resolveMentorId(api, userId, { signal }); active(signal);
  const start = new Date(week); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  const [learnerRes, scheduleRes] = await Promise.all([
    api.get(`/mentors/${mentorId}/learners`, { signal }),
    api.get(`/mentors/${mentorId}/schedules`, { signal, params: { startDate: start.toISOString(), endDate: end.toISOString() } })
  ]);
  active(signal);
  const learners = learnerRes.data?.learners ?? learnerRes.data;
  if (!Array.isArray(learners) || learners.some(row => !positiveId(row?.learner_id ?? row?.id))) throw new Error('Danh sách học viên không hợp lệ.');
  return { mentorId, learners: learners.map(row => ({ ...row, id: row.learner_id ?? row.id, full_name: row.learner_name || row.name || row.full_name })), schedules: checkedSchedules(scheduleRes.data) };
}
