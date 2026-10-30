import { UI_COPY } from './uiCopy.js';

const preferenceKey = 'aesp.ui.showVietnamese';
const normalized = value => value.normalize('NFC').replace(/\s+/g, ' ').trim();
const englishToVietnamese = new Map();
for (const [vi, en] of Object.entries(UI_COPY)) if (!englishToVietnamese.has(en)) englishToVietnamese.set(en, vi);
const shortVietnamese = {
  'Dashboard': 'Bảng điều khiển',
  'Community': 'Cộng đồng',
  'Chat': 'Trò chuyện',
  'Online classes': 'Lớp trực tuyến',
  'Challenges': 'Thử thách',
  'Make English part of your day.': 'Đưa tiếng Anh vào mỗi ngày của bạn.',
  'Welcome back': 'Chào mừng trở lại',
  'Get started': 'Bắt đầu',
  'Learning packages': 'Gói học',
  'Scenario Studio': 'Tình huống hội thoại',
  'Request access': 'Yêu cầu cấp tài khoản',
  'Unavailable': 'Không khả dụng',
  'Active': 'Đang có hiệu lực',
  'Resolved': 'Đã xử lý',
  'Completed sessions and saved responses count once per active day. Activity is not a skill score.': 'Buổi luyện và phản hồi đã lưu được tính một lần mỗi ngày; đây không phải điểm kỹ năng.',
  'Saved Story responses and completed guided scenarios reflect participation, not skill scores.': 'Lượt Story và Scenario ghi nhận hoạt động, không phải điểm kỹ năng.',
  'Follow-ups based on activity, processing status and package expiry.': 'Theo dõi hoạt động, trạng thái xử lý bài và hạn gói để hỗ trợ.',
  'Planned minutes are a personal target, not measured study time.': 'Số phút là mục tiêu tự chọn, không phải thời gian đã học được đo.',
  'Your goals, practice and upcoming classes, in one place.': 'Mục tiêu, bài luyện và lớp học của bạn.',
  'Keep up with your learners and help where it matters.': 'Theo dõi và hỗ trợ học viên của bạn.',
  'Review your learners\' results or continue a conversation.': 'Xem kết quả hoặc tiếp tục hỗ trợ học viên.',
  'Choose a way to practice. Start small and keep going.': 'Chọn cách luyện phù hợp với bạn.',
  'Choose a scene and find your next conversation.': 'Chọn một khung cảnh và bắt đầu trò chuyện.',
  'Your story, at your own pace. Tap the microphone to begin.': 'Kể chuyện theo nhịp của bạn. Nhấn mic để bắt đầu.',
  'Make a little room for practice this week.': 'Dành chút thời gian luyện tập trong tuần.'
};
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(UI_COPY).filter(([vi]) => /\{\d+\}/.test(vi)).map(([vi,en]) => {
  const slots=[];
  const source=vi.split(/(\{\d+\})/).map(part=>{
    if(/^\{\d+\}$/.test(part)){slots.push(Number(part.slice(1,-1)));return '(.+?)';}
    return escape(part);
  }).join('');
  return {regex:new RegExp(`^${source}$`),slots,en,vi};
});

export function resolveUiCopy(value) {
  if (typeof value !== 'string') return { en: '', vi: '' };
  const key = normalized(value);
  if (key === 'AESP') return { en: key, vi: '' };
  if (Object.hasOwn(UI_COPY, key)) return { en: UI_COPY[key], vi: shortVietnamese[UI_COPY[key]] ?? key };
  if (englishToVietnamese.has(key)) return { en: key, vi: shortVietnamese[key] ?? englishToVietnamese.get(key) };
  for(const pattern of patterns) {
    const match=pattern.regex.exec(key);if(!match)continue;
    const values=new Map(pattern.slots.map((slot,index)=>[slot,match[index+1]]));
    const fill=text=>text.replace(/\{(\d+)\}/g,(_,slot)=>values.get(Number(slot)) ?? `{${slot}}`);
    return {en:fill(pattern.en),vi:fill(pattern.vi)};
  }
  return { en: value, vi: '' };
}

export function englishText(value) { return typeof value === 'string' ? resolveUiCopy(value).en : value; }

export function readTranslationPreference(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(preferenceKey) === 'true'; }
  catch { return false; }
}

export function writeTranslationPreference(value, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem(preferenceKey, value === true ? 'true' : 'false'); }
  catch { /* A blocked preference store never blocks navigation or sign-in. */ }
}



export function selectUiCopy(value, locale = 'en') {
  const { en, vi } = resolveUiCopy(value);
  if (locale === 'vi' && vi) return { text: vi, lang: 'vi' };
  return { text: en, lang: /[đĐăĂâÂêÊôÔơƠưƯạ-ỹ]/.test(en) ? 'vi' : 'en' };
}
