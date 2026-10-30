const invalid = message => Object.assign(new Error(message), { status: 400, code: 'SCHEDULE_VALIDATION' });

export function scheduleId(value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw invalid('ID lịch học hoặc học viên không hợp lệ');
  return Number(value);
}

export function parseScheduleTime(value) {
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) return new Date(value);
    throw invalid('Thời gian lịch học không hợp lệ');
  }
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})?$/);
  if (!match) throw invalid('Thời gian lịch học không hợp lệ');
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = Number(match[6] || 0);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || hour > 23 || minute > 59 || second > 59) throw invalid('Thời gian lịch học không hợp lệ');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw invalid('Thời gian lịch học không hợp lệ');
  return date;
}

export function nextScheduleWeek(now = new Date()) {
  const monday = new Date(now);
  if (!Number.isFinite(monday.getTime())) throw invalid('Không xác định được tuần lịch học');
  const weekday = monday.getDay();
  monday.setDate(monday.getDate() + (weekday === 0 ? 1 : 8 - weekday));
  monday.setHours(0, 0, 0, 0);
  const endExclusive = new Date(monday);
  endExclusive.setDate(monday.getDate() + 7);
  return { monday, endExclusive };
}

export function validateScheduleInterval(startTime, endTime, { now = new Date(), requireNextWeek = true } = {}) {
  const start = parseScheduleTime(startTime);
  const end = parseScheduleTime(endTime);
  if (start >= end) throw invalid('Giờ bắt đầu phải nhỏ hơn giờ kết thúc');
  if (start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth() || start.getDate() !== end.getDate()) {
    throw invalid('Giờ bắt đầu và kết thúc phải trong cùng một ngày');
  }
  const dayTime = date => ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
  if (dayTime(start) < 8 * 3600000 || dayTime(start) >= 21 * 3600000 || dayTime(end) > 21 * 3600000) {
    throw invalid('Giờ học phải trong khoảng 8h-21h');
  }
  if (requireNextWeek) {
    const { monday, endExclusive } = nextScheduleWeek(now);
    if (start < monday || end >= endExclusive) throw invalid('Chỉ được đăng ký lịch cho tuần tiếp theo (từ thứ 2 đến chủ nhật)');
  }
  return { start, end, startTime: start.toISOString(), endTime: end.toISOString() };
}

export function normalizeMeetingLink(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid('Link meeting phải là địa chỉ http hoặc https');
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
      || /[\u0000-\u0020\u007f]/.test(text)) throw new Error();
    return text;
  } catch { throw invalid('Link meeting phải là địa chỉ http hoặc https'); }
}

export function normalizeScheduleMetadata(data, { requireTitle = false } = {}) {
  const result = { ...data };
  if (requireTitle || Object.hasOwn(result, 'title')) {
    if (typeof result.title !== 'string' || !result.title.trim()) throw invalid('Tiêu đề lịch học không được để trống');
    result.title = result.title.trim();
  }
  if (result.type !== undefined && !['online', 'offline'].includes(result.type)) throw invalid('Loại lịch học không hợp lệ');
  if (result.status !== undefined && !['scheduled', 'completed', 'cancelled', 'paused'].includes(result.status)) throw invalid('Trạng thái lịch học không hợp lệ');
  if (result.isExam !== undefined && typeof result.isExam !== 'boolean') throw invalid('Lịch thi phải là giá trị đúng/sai');
  for (const field of ['description', 'notes']) {
    if (result[field] !== undefined && result[field] !== null && typeof result[field] !== 'string') throw invalid('Nội dung lịch học không hợp lệ');
  }
  return result;
}

export function validatedScheduleUpdates(updates, existing, options = {}) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw invalid('Dữ liệu cập nhật lịch học không hợp lệ');
  let result = {};
  for (const field of ['title', 'description', 'startTime', 'endTime', 'status', 'type', 'meetingLink', 'isExam', 'notes']) {
    if (updates[field] !== undefined) result[field] = updates[field];
  }
  result = normalizeScheduleMetadata(result);
  if (Object.hasOwn(result, 'meetingLink')) result.meetingLink = normalizeMeetingLink(result.meetingLink);
  const hasTimes = Object.hasOwn(result, 'startTime') || Object.hasOwn(result, 'endTime');
  if (!hasTimes) return { updates: result, interval: null };
  const start = result.startTime !== undefined ? result.startTime : existing.start_time;
  const end = result.endTime !== undefined ? result.endTime : existing.end_time;
  const changed = parseScheduleTime(start).getTime() !== parseScheduleTime(existing.start_time).getTime()
    || parseScheduleTime(end).getTime() !== parseScheduleTime(existing.end_time).getTime();
  // A full edit form may echo historical times while only changing metadata.
  // Do not retroactively revalidate/rewrite those saved timestamps.
  if (!changed) {
    delete result.startTime; delete result.endTime;
    return { updates: result, interval: null };
  }
  const interval = validateScheduleInterval(start, end, { ...options, requireNextWeek: changed });
  result.startTime = interval.startTime;
  result.endTime = interval.endTime;
  return { updates: result, interval };
}
