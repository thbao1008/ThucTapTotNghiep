import { UiText } from '../../i18n/UiLanguage.jsx';
// frontend/src/components/common/Calendar.jsx
import React, { useState, useEffect } from "react";
import api from "../../api";
import { loadCalendarSchedules, safeMeetingHref, scheduleDayRows } from '../../utils/calendar.js';
import { FiCalendar, FiClock, FiUser, FiVideo, FiMapPin, FiAlertCircle } from "react-icons/fi";
import "../../styles/common-calendar.css";

export default function Calendar({ learnerId, mentorId }) {
  return <CalendarView key={`${learnerId ?? ''}:${mentorId ?? ''}`} learnerId={learnerId} mentorId={mentorId} />;
}

function CalendarView({ learnerId, mentorId }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [hasMentor, setHasMentor] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController(); const { signal } = controller;
    setLoading(true); setError(null); setSchedules([]); setHasMentor(false); setSelectedSchedule(null);
    loadCalendarSchedules(api, { learnerId, mentorId, date: currentDate, signal }).then(result => {
      if (!signal.aborted) { setSchedules(result.schedules); setHasMentor(result.hasMentor); }
    }).catch(() => { if (!signal.aborted) setError('Không thể tải lịch học. Vui lòng thử lại.'); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [learnerId, mentorId, currentDate, loadAttempt]);

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Thêm các ngày trống ở đầu tháng
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Thêm các ngày trong tháng
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const getSchedulesForDate = (date) => {
    return date ? scheduleDayRows(schedules, date) : [];
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Kiểm tra schedule đã qua chưa
  const isSchedulePassed = (schedule) => {
    const now = new Date();
    const endTime = new Date(schedule.end_time);
    return now > endTime;
  };

  const getStatusColor = (schedule) => {
    // Lịch thi: màu đỏ
    if (schedule.is_exam) {
      return '#ef4444';
    }
    // Đã qua: màu xanh lá
    if (isSchedulePassed(schedule)) {
      return '#10b981';
    }
    // Sắp tới: màu xanh dương
    return '#3b82f6';
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'scheduled':
        return 'Đã lên lịch';
      case 'completed':
        return 'Đã hoàn thành';
      case 'in_progress':
        return 'Đang diễn ra';
      case 'cancelled':
        return 'Đã hủy';
      case 'paused':
        return 'Tạm ngưng';
      default:
        return status;
    }
  };

  const days = getDaysInMonth();
  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ];
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  if (loading) {
    return (
      <div className="calendar-container">
        <div className="loading-state"><UiText text={"Đang tải lịch học..."} /></div>
      </div>
    );
  }

  if (error) return <div className="calendar-container" role="alert"><UiText>{error}</UiText> <button onClick={() => setLoadAttempt(value => value + 1)}><UiText text={"Thử lại"} /></button></div>;

  if (learnerId && !mentorId && !hasMentor) {
    return (
      <div className="calendar-container">
        <div className="no-mentor-message">
          <FiUser style={{ fontSize: 48, color: "#999", marginBottom: 16 }} />
          <p><UiText text={"Bạn chưa được gán với mentor"} /></p>
          <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>{" "}<UiText text={"Vui lòng liên hệ admin để được gán mentor và xem lịch học"} />{" "}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <h3>
          <FiCalendar /> <UiText>{mentorId ? 'Lịch dạy' : 'Lịch học'}</UiText>
        </h3>
        <div className="calendar-nav">
          <button onClick={goToPreviousMonth} className="nav-btn">‹</button>
          <button onClick={goToToday} className="nav-btn today-btn">{" "}<UiText text={"Hôm nay"} />{" "}</button>
          <button onClick={goToNextMonth} className="nav-btn">›</button>
        </div>
      </div>

      <div className="calendar-month">
        <h4>
          <UiText>{monthNames[currentDate.getMonth()]}</UiText> <UiText>{currentDate.getFullYear()}</UiText>
        </h4>
      </div>

      <div className="calendar-grid">
        {/* Day names */}
        <div className="calendar-weekdays">
          {dayNames.map((day, idx) => (
            <div key={idx} className="calendar-weekday"><UiText>{day}</UiText></div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="calendar-days">
          {days.map((date, idx) => {
            const daySchedules = getSchedulesForDate(date);
            const isToday = date && 
              date.toDateString() === new Date().toDateString();
            
            return (
              <div
                key={idx}
                className={`calendar-day ${!date ? 'empty' : ''} ${isToday ? 'today' : ''}`}
              >
                {date && (
                  <>
                    <div className="day-number"><UiText>{date.getDate()}</UiText></div>
                    {daySchedules.length > 0 && (
                      <div className="day-schedules">
                        {daySchedules.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="schedule-block"
                            style={{ borderLeftColor: getStatusColor(schedule) }}
                            onClick={() => setSelectedSchedule(schedule)}
                          >
                            <div className="schedule-block-title">{schedule.title}</div>
                            <div className="schedule-block-time">
                              <FiClock /> <UiText>{formatTime(schedule.start_time)}</UiText> - <UiText>{formatTime(schedule.end_time)}</UiText>
                            </div>
                            <div className="schedule-block-type">
                              <UiText>{schedule.type === 'online' ? '🌐 Online' : '🏠 Offline'}</UiText>
                              {schedule.is_exam && <span className="exam-badge-inline"><UiText text={"Lịch thi"} /></span>}
                              {schedule.status === 'paused' && <span className="paused-badge-inline"><UiText text={"Tạm ngưng"} /></span>}
                            </div>
                            {schedule.type === 'online' && safeMeetingHref(schedule.meeting_link) && (
                              <div className="schedule-block-link">
                                <FiVideo />
                                <a 
                                  href={safeMeetingHref(schedule.meeting_link)}
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >{" "}<UiText text={"Link học"} />{" "}</a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule detail modal */}
      {selectedSchedule && (
        <div className="schedule-modal-overlay" onClick={() => setSelectedSchedule(null)}>
          <div className="schedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3>{selectedSchedule.title}</h3>
              <button
                className="close-btn"
                onClick={() => setSelectedSchedule(null)}
              >{" "}<UiText text={"×"} />{" "}</button>
            </div>
            <div className="schedule-modal-body">
              <div className="schedule-info-item">
                <FiCalendar /> <UiText>{formatDate(selectedSchedule.start_time)}</UiText>
              </div>
              <div className="schedule-info-item">
                <FiClock /> <UiText>{formatTime(selectedSchedule.start_time)}</UiText> - <UiText>{formatTime(selectedSchedule.end_time)}</UiText>
              </div>
              {selectedSchedule.is_exam && (
                <div className="schedule-info-item" style={{ color: '#ef4444', fontWeight: 600 }}>
                  <FiAlertCircle />{" "}<UiText text={"Lịch thi định kỳ"} />{" "}</div>
              )}
              <div className="schedule-info-item">
                <strong><UiText text={"Loại:"} /></strong> <UiText>{selectedSchedule.type === 'online' ? '🌐 Online' : '🏠 Offline'}</UiText>
              </div>
              {safeMeetingHref(selectedSchedule.meeting_link) && (
                <div className="schedule-info-item">
                  <FiVideo /> 
                  <a href={safeMeetingHref(selectedSchedule.meeting_link)} target="_blank" rel="noopener noreferrer">{" "}<UiText text={"Link meeting"} />{" "}</a>
                </div>
              )}
              {selectedSchedule.description && (
                <div className="schedule-description">
                  <strong><UiText text={"Mô tả:"} /></strong>
                  <p>{selectedSchedule.description}</p>
                </div>
              )}
              {selectedSchedule.notes && (
                <div className="schedule-notes">
                  <strong><UiText text={"Ghi chú:"} /></strong>
                  <p><UiText>{selectedSchedule.notes}</UiText></p>
                </div>
              )}
              <div className="schedule-status">
                <span
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(selectedSchedule) }}
                >
                  <UiText>{getStatusLabel(selectedSchedule.status)}</UiText>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

