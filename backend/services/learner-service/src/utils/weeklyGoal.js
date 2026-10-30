const DAY = 86400000;
export const goalFocus = ['communication', 'interview', 'exam', 'grammar', 'vocabulary'];

export function learningWeek(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const localMidnight = new Date(`${today}T00:00:00+07:00`);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = new Date(localMidnight.getTime() - ((weekday + 6) % 7) * DAY);
  const key = new Date(start.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  return { key, start, end: new Date(start.getTime() + 7 * DAY), now };
}

export function validateGoal(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['target_days','minutes_per_day','focus','revision','week_start'].includes(key))
    || !Number.isInteger(body.target_days) || body.target_days < 1 || body.target_days > 7
    || !Number.isInteger(body.minutes_per_day) || body.minutes_per_day < 5 || body.minutes_per_day > 30
    || !goalFocus.includes(body.focus)
    || !Number.isInteger(body.revision) || body.revision < 0 || body.revision >= 2147483647
    || typeof body.week_start !== 'string') return false;
  return true;
}

const tasks = {
  communication: ['Chọn một chủ đề giao tiếp quen thuộc và luyện trả lời cùng AI.', 'Xem phản hồi của bài vừa luyện, chọn một câu để diễn đạt lại rõ hơn.'],
  interview: ['Luyện giới thiệu bản thân và trả lời một câu hỏi phỏng vấn bằng tiếng Anh.', 'Dựa vào phản hồi đã có, sửa một câu rồi thử trả lời lại.'],
  exam: ['Chọn một challenge luyện thi phù hợp với trình độ hiện tại.', 'Đọc yêu cầu, luyện câu trả lời và xem phản hồi trước khi thử lại.'],
  grammar: ['Mở phản hồi bài gần nhất và chọn một góp ý ngữ pháp nếu có.', 'Viết lại câu đã chọn rồi dùng cấu trúc đó trong một câu trả lời mới.'],
  vocabulary: ['Chọn ba từ theo chủ đề đang học và kiểm tra nghĩa trong từ điển.', 'Dùng các từ vừa chọn trong một bài nói ngắn, rồi xem phản hồi.']
};

export function presentWeeklyGoal(goal, days, week) {
  return {
    week_start: week.key, time_zone: 'Asia/Ho_Chi_Minh', goal: goal ?? null,
    practiced_days: days, target_reached: Boolean(goal && days >= goal.target_days),
    plan_source: 'rule_based',
    next_steps: !goal ? [] : tasks[goal.focus],
    practice_path: goal?.focus === 'exam' ? '/learn/challenges' : '/learn/practice'
  };
}

export const weeklyActivityQuery = `
  WITH activities AS (
    SELECT completed_at AS occurred_at FROM speaking_practice_sessions
      WHERE learner_id=$1 AND status='completed' AND completed_at >= $2 AND completed_at < $3 AND completed_at <= $4
    UNION ALL
    SELECT submitted_at FROM submissions WHERE learner_id=$1 AND status IN ('completed','reviewed')
      AND submitted_at >= $2 AND submitted_at < $3 AND submitted_at <= $4
    UNION ALL
    SELECT c.created_at FROM story_conversations c JOIN story_sessions s ON s.id=c.session_id
      WHERE s.learner_id=$1 AND c.message_type='user' AND length(trim(COALESCE(c.text_content,''))) > 0
      AND c.created_at >= $2 AND c.created_at < $3 AND c.created_at <= $4
    UNION ALL
    SELECT day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' FROM story_session_lifetimes t
      CROSS JOIN unnest(t.activity_days) AS day WHERE t.learner_id=$1 AND t.cleaned_at IS NOT NULL
      AND (day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $2
      AND (day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') < $3
      AND (day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') <= $4
    UNION ALL
    SELECT updated_at FROM public.scenario_world_sessions
      WHERE learner_id=$1 AND status='completed' AND revision>0
      AND updated_at >= $2 AND updated_at < $3 AND updated_at <= $4
  ) SELECT COUNT(DISTINCT (occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::integer AS days FROM activities
`;
