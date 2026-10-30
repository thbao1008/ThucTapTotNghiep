import { UiOption } from '../../i18n/UiLanguage.jsx';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
// frontend/src/components/mentor/MentorSchedules.jsx
import React, { useState, useEffect, useRef } from "react";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import { FiCalendar, FiClock, FiUser, FiVideo, FiPlus, FiEdit, FiTrash2, FiX, FiPause, FiCheckCircle, FiAlertCircle, FiSend } from "react-icons/fi";
import "../../styles/mentor-schedules.css";
import { nextMonday as getNextMonday, nextSunday as getNextSunday, localDateKey, scheduleDayRows, validateScheduleDraft, loadMentorScheduleData } from '../../utils/calendar.js';
import { createScheduleBatch, summarizeScheduleBatch } from '../../utils/scheduleBatch.js';

// Helper: Kiểm tra xem tuần đã qua chưa
function isWeekPassed(weekStartDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekStartDate.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return today > weekEnd;
}

// Helper: Lấy thứ 2 của tuần chứa date
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function MentorSchedules() {
  const auth = getAuth();
  const userId = auth?.user?.id ?? auth?.user?._id ?? auth?.user?.user_id ?? null;
  return <MentorSchedulesView key={String(userId)} userId={userId} />;
}

function MentorSchedulesView({ userId }) {
  const [mentorId, setMentorId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(getNextMonday());
  const [draftSchedules, setDraftSchedules] = useState([]);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftOutcomes, setDraftOutcomes] = useState({});
  const mutationBusyRef = useRef(false);
  const mutationScopeRef = useRef(0);
  const mutationAbortRef = useRef(null);
  const createBatchRef = useRef(null);
  const updateBatchRef = useRef(null);

  useEffect(() => {
    mutationScopeRef.current++; mutationAbortRef.current = new AbortController();
    createBatchRef.current = createScheduleBatch((item, options) => api.post(item.url, item.payload, options));
    updateBatchRef.current = createScheduleBatch((item, options) => api.put(item.url, item.payload, options));
    mutationBusyRef.current = false; setSaving(false); setDraftSchedules([]); setDraftOutcomes({});
    setEditingSchedule(null); setShowEditModal(false); setSaveNotice('');
    return () => { mutationScopeRef.current++; mutationAbortRef.current?.abort(); };
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController(); const { signal } = controller;
    setMentorId(null); setLearners([]); setSchedules([]); setLoadError('');
    if (!userId) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    loadMentorScheduleData(api, { userId, week: currentWeek, signal }).then(result => {
      if (!signal.aborted) { setMentorId(result.mentorId); setLearners(result.learners); setSchedules(result.schedules); }
    }).catch(() => { if (!signal.aborted) setLoadError('Không thể tải lịch/học viên. Vui lòng thử lại.'); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, currentWeek, loadAttempt]);

  const addDraftSchedule = () => {
    if (mutationBusyRef.current) return;
    const nextMonday = getNextMonday();
    const newDraft = {
      id: crypto.randomUUID(), // Form identity only; never a database ID.
      title: "",
      date: localDateKey(nextMonday),
      startTime: "",
      endTime: "",
      type: "online",
      meetingLink: "",
      isExam: false
    };
    setDraftSchedules([...draftSchedules, newDraft]);
  };

  const updateDraftSchedule = (id, field, value) => {
    if (mutationBusyRef.current || createBatchRef.current?.locked(id)) return;
    setDraftSchedules(prev => prev.map(draft => 
      draft.id === id ? { ...draft, [field]: value } : draft
    ));
  };

  const removeDraftSchedule = (id) => {
    if (mutationBusyRef.current) return;
    setDraftSchedules(draftSchedules.filter(draft => draft.id !== id));
  };

  const validateDraftSchedule = (draft) => {
    return validateScheduleDraft(draft);
  };

  const handleSubmitAll = async () => {
    if (!mentorId || mutationBusyRef.current) return;
    
    // Validate all drafts
    const errors = [];
    draftSchedules.forEach((draft, index) => {
      const error = validateDraftSchedule(draft);
      if (error) {
        errors.push(`Lịch học ${index + 1}: ${error}`);
      }
    });
    
    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }
    
    if (draftSchedules.length === 0) {
      alert(englishText("Chưa có lịch học nào để gửi"));
      return;
    }
    
    if (learners.length === 0) {
      alert(englishText("Bạn chưa có học viên nào. Vui lòng liên hệ admin để được gán học viên."));
      return;
    }
    
    mutationBusyRef.current = true; setSaving(true); setSaveNotice('');
    const scope = mutationScopeRef.current;
    try {
      // Tạo lịch cho TẤT CẢ learners của mentor
      const items = [];
      
      draftSchedules.forEach(draft => {
        // Tạo date string với local time để tránh lỗi timezone
        const dateStr = draft.date; // YYYY-MM-DD
        const startDateTimeStr = `${dateStr}T${draft.startTime}:00`;
        const endDateTimeStr = `${dateStr}T${draft.endTime}:00`;
        
        // Tạo lịch cho mỗi learner
        learners.forEach(learner => {
          const payload = {
            learnerId: parseInt(learner.learner_id || learner.id),
            title: draft.title.trim(),
            description: "",
            startTime: startDateTimeStr,
            endTime: endDateTimeStr,
            type: draft.type,
            meetingLink: draft.type === "online" ? (draft.meetingLink || null) : null,
            isExam: draft.isExam,
            notes: ""
          };
          
          items.push({ key: `${draft.id}:${payload.learnerId}`, group: draft.id,
            url: `/mentors/${mentorId}/schedules`, payload,
            expectedLearnerId: payload.learnerId, expectedMentorId: mentorId });
        });
      });
      
      const outcomes = await createBatchRef.current.run(items, { signal: mutationAbortRef.current.signal });
      if (!outcomes || mutationScopeRef.current !== scope) return;
      const counts = summarizeScheduleBatch(outcomes);
      const perDraft = Object.fromEntries(draftSchedules.map(draft => [draft.id, summarizeScheduleBatch(outcomes.filter(row => row.group === draft.id))]));
      setDraftOutcomes(perDraft);
      setDraftSchedules(previous => previous.filter(draft => {
        const result = perDraft[draft.id];
        return !result || !result.saved || result.failed > 0 || result.unknown > 0 || result.pending > 0;
      }));
      setSaveNotice(`Đã lưu ${counts.saved} lịch; ${counts.failed} bị từ chối; ${counts.unknown} chưa xác nhận; ${counts.pending || 0} chưa gửi. Các lịch đã lưu/chưa xác nhận không được gửi lại. Hãy kiểm tra lịch trước khi tạo mới.`);
      setLoadAttempt(value => value + 1);
    } catch (err) {
      if (mutationScopeRef.current === scope) setSaveNotice('Chưa xác nhận được kết quả. Hãy kiểm tra lịch trước khi thử lại.');
    } finally { if (mutationScopeRef.current === scope) { mutationBusyRef.current = false; setSaving(false); } }
  };

  const handleEdit = (schedule) => {
    if (mutationBusyRef.current) return;
    updateBatchRef.current = createScheduleBatch((item, options) => api.put(item.url, item.payload, options));
    // Tìm tất cả lịch có cùng title, date, time để edit cùng lúc
    const scheduleDate = new Date(schedule.start_time);
    const dateStr = localDateKey(scheduleDate);
    const startTime = scheduleDate.toTimeString().slice(0, 5);
    const endTime = new Date(schedule.end_time).toTimeString().slice(0, 5);
    
    const matchingSchedules = schedules.filter(s => {
      const sDate = localDateKey(s.start_time);
      const sStartTime = new Date(s.start_time).toTimeString().slice(0, 5);
      const sEndTime = new Date(s.end_time).toTimeString().slice(0, 5);
      return s.title === schedule.title && 
             sDate === dateStr && 
             sStartTime === startTime && 
             sEndTime === endTime && s.type === schedule.type && s.meeting_link === schedule.meeting_link && s.is_exam === schedule.is_exam;
    });
    
    // Set thông tin để chỉnh sửa
    setEditingSchedule({
      scheduleIds: matchingSchedules.map(s => s.id),
      title: schedule.title,
      date: dateStr,
      startTime: startTime,
      endTime: endTime,
      type: schedule.type,
      meetingLink: schedule.meeting_link || "",
      isExam: schedule.is_exam || false
    });
    setShowEditModal(true);
  };

  const handleUpdateSchedule = async () => {
    if (!editingSchedule || !mentorId || mutationBusyRef.current) return;
    const validationError = validateScheduleDraft(editingSchedule);
    if (validationError) { alert(validationError); return; }
    mutationBusyRef.current = true; setSaving(true); setSaveNotice('');
    const scope = mutationScopeRef.current;
    try {
      // Cập nhật tất cả các lịch có cùng title/date/time
      const dateStr = editingSchedule.date;
      const startDateTimeStr = `${dateStr}T${editingSchedule.startTime}:00`;
      const endDateTimeStr = `${dateStr}T${editingSchedule.endTime}:00`;
      
      const items = editingSchedule.scheduleIds.map(scheduleId => {
        const payload = {
          title: editingSchedule.title.trim(),
          description: "",
          startTime: startDateTimeStr,
          endTime: endDateTimeStr,
          type: editingSchedule.type,
          meetingLink: editingSchedule.type === "online" ? (editingSchedule.meetingLink || null) : null,
          isExam: editingSchedule.isExam,
          notes: ""
        };
        
        return { key: String(scheduleId), group: 'update', url: `/mentors/schedules/${scheduleId}`, payload, expectedId: scheduleId };
      });
      
      const outcomes = await updateBatchRef.current.run(items, { signal: mutationAbortRef.current.signal });
      if (!outcomes || mutationScopeRef.current !== scope) return;
      const counts = summarizeScheduleBatch(outcomes);
      if (counts.saved === items.length) { setShowEditModal(false); setEditingSchedule(null); }
      setSaveNotice(`Cập nhật: ${counts.saved} đã lưu; ${counts.failed} bị từ chối; ${counts.unknown} chưa xác nhận; ${counts.pending || 0} chưa gửi. Hãy kiểm tra lịch trước khi thay đổi tiếp.`);
      setLoadAttempt(value => value + 1);
    } catch (err) {
      if (mutationScopeRef.current === scope) setSaveNotice('Chưa xác nhận được cập nhật. Hãy kiểm tra lịch trước khi thử lại.');
    } finally { if (mutationScopeRef.current === scope) { mutationBusyRef.current = false; setSaving(false); } }
  };

  const handlePause = async (scheduleId) => {
    if (mutationBusyRef.current) return;
    if (!confirm(englishText("Bạn có chắc muốn tạm ngưng lịch học này?"))) return;
    mutationBusyRef.current = true; setSaving(true); setSaveNotice('');
    const scope = mutationScopeRef.current;
    try {
      await api.put(`/mentors/schedules/${scheduleId}`, { status: "paused" }, { signal: mutationAbortRef.current.signal });
      if (mutationScopeRef.current !== scope) return;
      setSaveNotice('Đã tạm ngưng lịch đã chọn.'); setLoadAttempt(value => value + 1);
    } catch (err) {
      if (mutationScopeRef.current === scope) setSaveNotice('Chưa xác nhận được thao tác tạm ngưng. Hãy tải lại lịch để kiểm tra.');
    } finally { if (mutationScopeRef.current === scope) { mutationBusyRef.current = false; setSaving(false); } }
  };

  const handleDelete = async (scheduleId) => {
    if (mutationBusyRef.current) return;
    if (!confirm(englishText("Bạn có chắc muốn xóa lịch học này?"))) return;
    mutationBusyRef.current = true; setSaving(true); setSaveNotice('');
    const scope = mutationScopeRef.current;
    try {
      await api.delete(`/mentors/schedules/${scheduleId}`, { signal: mutationAbortRef.current.signal });
      if (mutationScopeRef.current !== scope) return;
      setSaveNotice('Đã xóa lịch đã chọn.'); setLoadAttempt(value => value + 1);
    } catch (err) {
      if (mutationScopeRef.current === scope) setSaveNotice('Chưa xác nhận được thao tác xóa. Hãy tải lại lịch để kiểm tra.');
    } finally { if (mutationScopeRef.current === scope) { mutationBusyRef.current = false; setSaving(false); } }
  };

  // Lấy lịch theo ngày trong tuần (group theo title/date/time để chỉ hiện 1 lịch)
  const getSchedulesByDate = (date) => {
    if (!date) return [];
    const schedulesForDate = scheduleDayRows(schedules, date);
    
    // Group theo title, date, start_time, end_time để chỉ hiện 1 lịch cho tất cả học viên
    const grouped = {};
    schedulesForDate.forEach(s => {
      const key = JSON.stringify([s.title, s.start_time, s.end_time, s.type, s.meeting_link, s.is_exam, s.status]);
      if (!grouped[key]) {
        grouped[key] = s; // Lấy lịch đầu tiên làm đại diện
      }
    });
    
    // Sắp xếp theo start_time: sớm hơn ở trên, muộn hơn ở dưới
    return Object.values(grouped).sort((a, b) => {
      const timeA = new Date(a.start_time).getTime();
      const timeB = new Date(b.start_time).getTime();
      return timeA - timeB;
    });
  };
  
  // Kiểm tra xem có thể chỉnh sửa/xóa lịch không
  // Logic: Chỉ có thể sửa/xóa khi tuần của lịch CHƯA ĐẾN (tuần tương lai)
  // Nếu tuần của lịch đã đến hoặc đã qua (tuần hiện tại hoặc tuần đã qua), thì không thể sửa/xóa, chỉ có thể tạm ngưng
  const canEditSchedule = (schedule) => {
    const scheduleDate = new Date(schedule.start_time);
    const scheduleWeekMonday = getMondayOfWeek(scheduleDate);
    
    // Lấy thứ 2 của tuần hiện tại (hôm nay)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekMonday = getMondayOfWeek(today);
    
    // So sánh tuần của schedule với tuần hiện tại
    // Nếu tuần của schedule < tuần hiện tại (đã qua) → không thể sửa/xóa
    // Nếu tuần của schedule = tuần hiện tại (đang trong tuần) → không thể sửa/xóa (đã đến tuần)
    // Nếu tuần của schedule > tuần hiện tại (tuần tương lai) → có thể sửa/xóa (chưa đến tuần)
    const scheduleWeekTime = scheduleWeekMonday.getTime();
    const currentWeekTime = currentWeekMonday.getTime();
    
    // Chỉ có thể sửa/xóa nếu tuần của schedule > tuần hiện tại (chưa đến tuần)
    return scheduleWeekTime > currentWeekTime;
  };

  // Kiểm tra schedule đã qua chưa
  const isSchedulePassed = (schedule) => {
    const now = new Date();
    const endTime = new Date(schedule.end_time);
    return now > endTime;
  };

  // Lấy màu cho schedule
  const getScheduleColor = (schedule) => {
    if (schedule.is_exam) return "#ef4444"; // Đỏ cho lịch thi
    if (isSchedulePassed(schedule)) return "#10b981"; // Xanh lá cho đã qua
    return "#3b82f6"; // Xanh dương cho sắp tới
  };

  // Lấy các ngày trong tuần
  const getWeekDays = () => {
    const days = [];
    const monday = new Date(currentWeek);
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const weekPassed = isWeekPassed(currentWeek);

  if (loading) {
    return (
      <div className="mentor-schedules">
        <div className="loading-state"><UiText text={"Đang tải..."} /></div>
      </div>
    );
  }

  if (loadError) return <div className="mentor-schedules"><p role="alert"><UiText>{loadError}</UiText></p>{saveNotice && <p role="status"><UiText>{saveNotice}</UiText></p>}<button onClick={() => setLoadAttempt(value => value + 1)}><UiText text={"Thử lại"} /></button></div>;

  if (!mentorId) {
    return (
      <div className="mentor-schedules">
        <div className="error-state"><UiText text={"Không tìm thấy thông tin mentor"} /></div>
      </div>
    );
  }

  return (
    <div className="mentor-schedules">
      {saveNotice && <p role="status"><UiText>{saveNotice}</UiText></p>}
      <div className="schedules-header">
        <h2>
          <FiCalendar />{" "}<UiText text={"Quản lý lịch học"} />{" "}</h2>
        <div className="header-actions">
          <button 
            className="btn-secondary" 
            disabled={saving}
            onClick={() => setShowCalendar(!showCalendar)}
          >
            <FiCalendar /> <UiText>{showCalendar ? "Ẩn lịch" : "Xem lịch dạy"}</UiText>
          </button>
        </div>
      </div>

      {learners.length === 0 ? (
        <div className="empty-state">
          <p><UiText text={"Bạn chưa có học viên nào. Vui lòng liên hệ admin để được gán học viên."} /></p>
        </div>
      ) : (
        <>
          {/* Inline Form Section - chỉ hiển thị khi không xem lịch */}
          {!weekPassed && !showCalendar && (
            <div className="inline-schedule-form">
              <div className="form-section-header">
                <div>
                  <h3><UiText text={"Tạo lịch học mới"} /></h3>
                  <p className="form-section-note">{" "}<UiText text={"Lịch học sẽ được tạo cho tất cả"} />{" "}<UiText>{learners.length}</UiText>{" "}<UiText text={"học viên được gán với bạn"} />{" "}</p>
                </div>
                <div className="form-section-actions">
                  <button className="btn-secondary" onClick={addDraftSchedule} disabled={saving}>
                    <FiPlus />{" "}<UiText text={"Thêm lịch học"} />{" "}</button>
                  {draftSchedules.length > 0 && (
                    <button className="btn-primary" onClick={handleSubmitAll} disabled={saving}>
                      <FiSend />{" "}<UiText text={"Gửi lịch ("} /><UiText>{draftSchedules.length}</UiText>)
                    </button>
                  )}
                </div>
              </div>

              {draftSchedules.length === 0 ? (
                <div className="empty-draft-message">
                  <p><UiText text={"Nhấn \"Thêm lịch học\" để bắt đầu tạo lịch học mới"} /></p>
                </div>
              ) : (
                <div className="draft-schedules-table">
                  <div className="table-header">
                    <div className="col-title"><UiText text={"Tiêu đề *"} /></div>
                    <div className="col-date"><UiText text={"Ngày *"} /></div>
                    <div className="col-time"><UiText text={"Giờ bắt đầu *"} /></div>
                    <div className="col-time"><UiText text={"Giờ kết thúc *"} /></div>
                    <div className="col-type"><UiText text={"Loại *"} /></div>
                    <div className="col-link"><UiText text={"Link (nếu online)"} /></div>
                    <div className="col-exam"><UiText text={"Lịch thi"} /></div>
                    <div className="col-actions"><UiText text={"Thao tác"} /></div>
                  </div>
                  {draftSchedules.map((draft) => (
                    <fieldset key={draft.id} className="table-row" disabled={saving || createBatchRef.current?.locked(draft.id)} style={{ border: 0, margin: 0, minWidth: 0 }}>
                      <div className="col-title">
                        <input
                          type="text"
                          value={draft.title}
                          onChange={(e) => updateDraftSchedule(draft.id, 'title', e.target.value)}
                          placeholder={englishText("Tiêu đề lịch học")}
                          className="form-input"
                        />
                      </div>
                      <div className="col-date">
                        <input
                          type="date"
                          value={draft.date}
                          onChange={(e) => updateDraftSchedule(draft.id, 'date', e.target.value)}
                          min={localDateKey(getNextMonday())}
                          max={localDateKey(getNextSunday())}
                          className="form-input"
                        />
                      </div>
                      <div className="col-time">
                        <input
                          type="time"
                          value={draft.startTime}
                          onChange={(e) => updateDraftSchedule(draft.id, 'startTime', e.target.value)}
                          min="08:00"
                          max="20:59"
                          className="form-input"
                        />
                      </div>
                      <div className="col-time">
                        <input
                          type="time"
                          value={draft.endTime}
                          onChange={(e) => updateDraftSchedule(draft.id, 'endTime', e.target.value)}
                          min="08:00"
                          max="21:00"
                          className="form-input"
                        />
                      </div>
                      <div className="col-type">
                        <select
                          value={draft.type}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setDraftSchedules(prev => prev.map(d => {
                              if (d.id === draft.id) {
                                return {
                                  ...d,
                                  type: newType,
                                  meetingLink: newType === 'offline' ? '' : d.meetingLink
                                };
                              }
                              return d;
                            }));
                          }}
                          className="form-input"
                        >
                          <UiOption value="online">{"Online"}</UiOption>
                          <UiOption value="offline">{"Offline"}</UiOption>
                        </select>
                      </div>
                      <div className="col-link">
                        {draft.type === "online" ? (
                          <input
                            type="url"
                            value={draft.meetingLink}
                            onChange={(e) => updateDraftSchedule(draft.id, 'meetingLink', e.target.value)}
                            placeholder={englishText("Có thể để trống, chỉnh sau...")}
                            className="form-input"
                          />
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </div>
                      <div className="col-exam">
                        <input
                          type="checkbox"
                          checked={draft.isExam}
                          onChange={(e) => updateDraftSchedule(draft.id, 'isExam', e.target.checked)}
                        />
                      </div>
                      <div className="col-actions">
                        <button
                          className="btn-icon-small btn-danger"
                          onClick={() => removeDraftSchedule(draft.id)}
                          title="Xóa"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                      {draftOutcomes[draft.id] && <small role="status" style={{ gridColumn: '1 / -1' }}>{" "}<UiText text={"Đã lưu"} />{" "}<UiText>{draftOutcomes[draft.id].saved}</UiText><UiText text={"; bị từ chối"} />{" "}<UiText>{draftOutcomes[draft.id].failed}</UiText><UiText text={"; chưa xác nhận"} />{" "}<UiText>{draftOutcomes[draft.id].unknown}</UiText><UiText text={"; chưa gửi"} />{" "}<UiText>{draftOutcomes[draft.id].pending || 0}</UiText><UiText text={". Không gửi lại phần đã lưu/chưa xác nhận; hãy kiểm tra lịch."} />{" "}</small>}
                    </fieldset>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Calendar View */}
          {showCalendar && (
            <div className="week-calendar">
              <div className="week-header">
                <button 
                  className="btn-nav"
                  disabled={saving}
                  onClick={() => {
                    const prevWeek = new Date(currentWeek);
                    prevWeek.setDate(prevWeek.getDate() - 7);
                    setCurrentWeek(prevWeek);
                  }}
                >{" "}<UiText text={"← Tuần trước"} />{" "}</button>
                <h3>{" "}<UiText text={"Tuần"} />{" "}<UiText>{currentWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })}</UiText> -
                  <UiText>{new Date(currentWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })}</UiText>
                </h3>
                <button 
                  className="btn-nav"
                  disabled={saving}
                  onClick={() => {
                    const nextWeek = new Date(currentWeek);
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    setCurrentWeek(nextWeek);
                  }}
                >{" "}<UiText text={"Tuần sau →"} />{" "}</button>
              </div>

              <div className="week-grid">
                {getWeekDays().map((day, idx) => {
                  const daySchedules = getSchedulesByDate(day);
                  // Lấy thứ thực tế của ngày (0 = CN, 1 = T2, ..., 6 = T7)
                  const dayOfWeek = day.getDay();
                  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                  const dayName = dayNames[dayOfWeek];
                  
                  return (
                    <div key={idx} className="week-day">
                      <div className="day-header">
                        <div className="day-name"><UiText>{dayName}</UiText></div>
                        <div className="day-number"><UiText>{day.getDate()}</UiText></div>
                      </div>
                      <div className="day-schedules">
                        {daySchedules.map((schedule) => {
                          const canEdit = canEditSchedule(schedule);
                          const isPaused = schedule.status === 'paused';
                          // Nếu đã tạm ngưng thì không thể sửa/xóa nữa (đã khóa)
                          const canModify = canEdit && !isPaused;
                          
                          return (
                            <div 
                              key={schedule.id} 
                              className="schedule-item"
                              style={{ borderLeftColor: getScheduleColor(schedule) }}
                            >
                              <div className="schedule-time">
                                <UiText>{formatTime(schedule.start_time)}</UiText> - <UiText>{formatTime(schedule.end_time)}</UiText>
                              </div>
                              <div className="schedule-title">{schedule.title}</div>
                              {schedule.is_exam && (
                                <div className="exam-badge">
                                  <FiAlertCircle />{" "}<UiText text={"Lịch thi"} />{" "}</div>
                              )}
                              {isPaused && (
                                <div className="exam-badge" style={{ backgroundColor: '#f59e0b', color: '#fff' }}>
                                  <FiPause />{" "}<UiText text={"Tạm ngưng"} />{" "}</div>
                              )}
                              <div className="schedule-type"><UiText>{schedule.type === 'online' ? '🌐 Online' : '🏠 Offline'}</UiText></div>
                              {canModify ? (
                                <div className="schedule-actions">
                                  <button 
                                    className="btn-icon-small"
                                    disabled={saving}
                                    onClick={() => handleEdit(schedule)}
                                    title={englishText("Chỉnh sửa")}
                                  >
                                    <FiEdit />
                                  </button>
                                  <button 
                                    className="btn-icon-small btn-danger"
                                    disabled={saving}
                                    onClick={() => handleDelete(schedule.id)}
                                    title="Xóa"
                                  >
                                    <FiTrash2 />
                                  </button>
                                </div>
                              ) : (
                                // Tuần đã qua hoặc đã tạm ngưng - chỉ hiển thị nút tạm ngưng (nếu chưa paused)
                                // Nếu đã paused rồi thì không hiển thị nút nữa (đã khóa)
                                !isPaused && (
                                  <button 
                                    className="btn-pause"
                                    disabled={saving}
                                    onClick={() => handlePause(schedule.id)}
                                    title={englishText("Tạm ngưng")}
                                  >
                                    <FiPause />{" "}<UiText text={"Tạm ngưng"} />{" "}</button>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Modal */}
      {showEditModal && editingSchedule && (
        <div className="modal-overlay" onClick={() => { if (!saving) { setShowEditModal(false); setEditingSchedule(null); } }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><UiText text={"Chỉnh sửa lịch học"} /></h3>
              <button className="btn-close" disabled={saving} onClick={() => { setShowEditModal(false); setEditingSchedule(null); }}>
                <FiX />
              </button>
            </div>

            <div className="schedule-form">
              <fieldset disabled={saving || updateBatchRef.current?.locked('update')} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className="form-group">
                <label><UiText text={"Tiêu đề *"} /></label>
                <input
                  type="text"
                  value={editingSchedule.title}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, title: e.target.value })}
                  required
                  placeholder={englishText("Tiêu đề lịch học")}
                />
              </div>

              <div className="form-group">
                <label><UiText text={"Ngày học *"} /></label>
                <input
                  type="date"
                  value={editingSchedule.date}
                  onChange={(e) => setEditingSchedule({ ...editingSchedule, date: e.target.value })}
                  required
                  min={localDateKey(getNextMonday())}
                  max={localDateKey(getNextSunday())}
                />
                <small><UiText text={"Chỉ được chọn ngày trong tuần tiếp theo"} /></small>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label><UiText text={"Giờ bắt đầu * (8h-21h)"} /></label>
                  <input
                    type="time"
                    value={editingSchedule.startTime}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, startTime: e.target.value })}
                    required
                    min="08:00"
                    max="20:59"
                  />
                </div>

                <div className="form-group">
                  <label><UiText text={"Giờ kết thúc * (8h-21h)"} /></label>
                  <input
                    type="time"
                    value={editingSchedule.endTime}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, endTime: e.target.value })}
                    required
                    min="08:00"
                    max="21:00"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label><UiText text={"Loại *"} /></label>
                  <select
                    value={editingSchedule.type}
                    onChange={(e) => {
                      setEditingSchedule({
                        ...editingSchedule,
                        type: e.target.value,
                        meetingLink: e.target.value === 'offline' ? '' : editingSchedule.meetingLink
                      });
                    }}
                    required
                  >
                    <UiOption value="online">{"Online"}</UiOption>
                    <UiOption value="offline">{"Offline"}</UiOption>
                  </select>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editingSchedule.isExam}
                      onChange={(e) => setEditingSchedule({ ...editingSchedule, isExam: e.target.checked })}
                    />
                    {" "}<UiText text={"Lịch thi định kỳ"} />{" "}</label>
                </div>
              </div>

              {editingSchedule.type === "online" && (
                <div className="form-group">
                  <label><UiText text={"Link meeting (có thể để trống, chỉnh sau)"} /></label>
                  <input
                    type="url"
                    value={editingSchedule.meetingLink}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, meetingLink: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              )}

              </fieldset>
              <div className="form-actions">
                <button type="button" className="btn-secondary" disabled={saving} onClick={() => { setShowEditModal(false); setEditingSchedule(null); }}>{" "}<UiText text={"Hủy"} />{" "}</button>
                <button type="button" className="btn-primary" disabled={saving} onClick={handleUpdateSchedule}>{" "}<UiText text={"Cập nhật"} />{" "}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
