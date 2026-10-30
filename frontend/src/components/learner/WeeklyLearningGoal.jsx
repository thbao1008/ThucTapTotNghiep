import { UiOption } from '../../i18n/UiLanguage.jsx';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import '../../styles/weekly-goal.css';

const focuses = { communication: 'Giao tiếp', interview: 'Phỏng vấn', exam: 'Luyện thi', grammar: 'Ngữ pháp', vocabulary: 'Từ vựng' };
const initialDraft = { target_days: 3, minutes_per_day: 10, focus: 'communication' };
function validGoal(goal) {
  return goal && Number.isInteger(goal.target_days) && goal.target_days >= 1 && goal.target_days <= 7
    && Number.isInteger(goal.minutes_per_day) && goal.minutes_per_day >= 5 && goal.minutes_per_day <= 30
    && Object.hasOwn(focuses, goal.focus) && Number.isInteger(goal.revision) && goal.revision > 0;
}

export default function WeeklyLearningGoal({ learnerId, client = api, onGoalSaved }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState(initialDraft);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [mustReload, setMustReload] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const active = useRef(null), operation = useRef(0), busy = useRef(false);

  async function load(message = '') {
    const token = ++operation.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    busy.current = false; setSaving(false); setLoading(true); setError(''); setNotice('');
    try {
      const { data: result } = await client.get(`/learners/${learnerId}/weekly-goal`, { signal: controller.signal, timeout: 12000 });
      if (token !== operation.current || controller.signal.aborted) return;
      if (!result || !/^\d{4}-\d{2}-\d{2}$/.test(result.week_start)
        || !Number.isInteger(result.practiced_days) || result.practiced_days < 0 || result.practiced_days > 7
        || result.goal !== null && !validGoal(result.goal)
        || !Array.isArray(result.next_steps) || !result.next_steps.every(item => typeof item === 'string')
        || !['/learn/practice','/learn/challenges'].includes(result.practice_path)) throw new Error('Invalid goal');
      setData(result);
      setDraft(result.goal ? { target_days: result.goal.target_days, minutes_per_day: result.goal.minutes_per_day, focus: result.goal.focus } : initialDraft);
      setMustReload(false); setNotice(message);
      return result;
    } catch (err) {
      if (token === operation.current && !controller.signal.aborted) {
        setData(null); setMustReload(true);
        setError(err.response?.data?.message || 'Không thể tải mục tiêu tuần. Vui lòng thử lại.');
      }
    } finally {
      if (token === operation.current && !controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    setData(null); setDraft(initialDraft); load();
    return () => { operation.current++; active.current?.abort(); };
  }, [learnerId, client]);

  async function save(event) {
    event.preventDefault();
    if (busy.current || !data || mustReload) return;
    busy.current = true; setSaving(true); setError(''); setNotice('');
    const token = ++operation.current;
    const controller = new AbortController(); active.current = controller;
    try {
      const { data: result } = await client.put(`/learners/${learnerId}/weekly-goal`, {
        ...draft, week_start: data.week_start, revision: data.goal?.revision ?? 0
      }, { signal: controller.signal, timeout: 15000 });
      if (token !== operation.current || controller.signal.aborted) return;
      if (result?.week_start !== data.week_start || !validGoal(result.goal)
        || result.goal.revision !== (data.goal?.revision ?? 0) + 1) throw new Error('Invalid save result');
      const confirmed = await load('Đã lưu mục tiêu tuần.');
      if (operation.current === token + 1 && !active.current?.signal.aborted
        && confirmed?.week_start === result.week_start && confirmed.goal?.revision >= result.goal.revision) {
        onGoalSaved?.(confirmed);
      }
    } catch (err) {
      if (token === operation.current && !controller.signal.aborted) {
        const status = err.response?.status;
        if (status !== 400) setMustReload(true);
        if ([401,403,404].includes(status)) setData(null);
        setError(err.response?.data?.message || 'Chưa xác nhận được kết quả lưu. Hãy tải lại để kiểm tra trước khi thử lại.');
      }
    } finally {
      if (token === operation.current) { busy.current = false; setSaving(false); }
    }
  }

  return <section className="weekly-goal" aria-labelledby="weekly-goal-title">
    <h2 id="weekly-goal-title"><UiText text={"Mục tiêu học tuần này"} /></h2>
    <p><UiText text={"Chọn nhịp học phù hợp. Thời hạn gói vẫn tính liên tục từ ngày mua đến ngày hết hạn."} /></p>
    {loading && <p role="status"><UiText text={"Đang tải mục tiêu..."} /></p>}
    {error && <p role="alert"><UiText>{error}</UiText></p>}
    {notice && <p role="status"><UiText>{notice}</UiText></p>}
    {!loading && data && <>
      <p><UiText text={"Tuần bắt đầu"} />{" "}<UiText>{data.week_start}</UiText>{" "}<UiText text={"· Giờ Việt Nam"} /></p>
      <p><strong><UiText>{data.practiced_days}</UiText>/<UiText>{data.goal?.target_days ?? '—'}</UiText>{" "}<UiText text={"ngày có hoạt động học"} /></strong></p>
      <p className="help-text"><UiText text={"Ghi nhận ngày có buổi luyện nói hoàn tất, phiên Scenario Studio đã kết thúc, bài nộp đã xử lý hoặc lượt Story đã lưu. Nhiều lượt cùng ngày tính một ngày; đây không phải điểm năng lực."} /></p>
      {data.target_reached && <p role="status"><UiText text={"Bạn đã đạt mục tiêu số ngày tuần này. Có thể tiếp tục luyện tập theo nhu cầu."} /></p>}
      <form onSubmit={save}><fieldset disabled={saving || mustReload}>
        <label><UiText text={"Số ngày học mỗi tuần"} />{" "}<input aria-label={englishText("Số ngày học mỗi tuần")} type="number" min="1" max="7" required value={draft.target_days} onChange={e => setDraft({ ...draft, target_days: Number(e.target.value) })} /></label>
        <label><UiText text={"Phút dự định mỗi ngày"} />{" "}<input aria-label={englishText("Phút dự định mỗi ngày")} type="number" min="5" max="30" required value={draft.minutes_per_day} onChange={e => setDraft({ ...draft, minutes_per_day: Number(e.target.value) })} /></label>
        <label><UiText text={"Trọng tâm"} />{" "}<select aria-label={englishText("Trọng tâm")} value={draft.focus} onChange={e => setDraft({ ...draft, focus: e.target.value })}>{Object.entries(focuses).map(([value,label]) => <UiOption key={value} value={value}>{label}</UiOption>)}</select></label>
        <button type="submit"><UiText>{saving ? 'Đang lưu...' : 'Lưu mục tiêu'}</UiText></button>
      </fieldset></form>
      <p className="help-text"><UiText text={"Số phút là kế hoạch tự chọn, không phải thời gian đã học được đo tự động. Mỗi tuần bạn có thể đặt mục tiêu mới."} /></p>
      {data.next_steps.length > 0 && <div><h3><UiText text={"Gợi ý cho lượt học tiếp theo"} /></h3>
        <p><UiText text={"Gợi ý theo mục tiêu bạn chọn, chưa phải kế hoạch AI cá nhân hóa từ lỗi bài nói."} /></p>
        <ol>{data.next_steps.map((step,i) => <li key={i}><UiText>{step}</UiText></li>)}</ol>
        <Link to={data.practice_path}><UiText text={"Bắt đầu luyện tập"} /></Link>
      </div>}
    </>}
    {!loading && <button type="button" disabled={saving} onClick={() => load()}><UiText text={"Tải lại mục tiêu"} /></button>}
  </section>;
}
