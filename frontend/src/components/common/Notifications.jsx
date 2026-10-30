import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
// frontend/src/components/common/Notifications.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FiBell, FiX, FiCheck } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { getAuth } from '../../utils/auth';
import { useAuth } from '../../context/AuthContext';
import { createNotificationsController, initialNotificationsState } from '../../utils/notifications.js';
import { notificationDestination } from '../../utils/notificationDestination.js';
import { createNotificationPolling } from '../../utils/notificationPolling.js';
import '../../styles/notifications.css';

export default function Notifications() {
  const context = useAuth();
  let user = context?.user;
  if (!context) { try { user = getAuth()?.user; } catch { user = null; } }
  const userId = user?.id ?? user?._id ?? user?.user_id;
  const role = typeof user?.role === 'string' ? user.role.toLowerCase() : null;
  return <NotificationsPanel key={`${userId ?? 'anonymous'}:${role}`} enabled={/^[1-9]\d*$/.test(String(userId))} role={role} />;
}

function NotificationsPanel({ enabled, role }) {
  const navigate = useNavigate();
  const [state, setState] = useState(initialNotificationsState);
  const { notifications, unreadCount, isOpen, loading, busy, error, disabled } = state;
  const dropdownRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = createNotificationsController(api, setState);
    controllerRef.current = controller;
    const polling = createNotificationPolling(controller, { isVisible: () => document.visibilityState !== 'hidden' });
    polling.refresh();
    const resume = () => { polling.refresh(); };
    const expire = () => { polling.dispose(); controller.disable(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('session-expired', expire);
    return () => {
      polling.dispose();
      window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume);
      controller.dispose(); window.removeEventListener('session-expired', expire);
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [enabled]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        controllerRef.current?.close();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    const onKey = event => { if (event.key === 'Escape') controllerRef.current?.close(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('keydown', onKey); };
  }, []);

  function formatTime(dateString) {
    const date = new Date(dateString);
    if (!Number.isFinite(date.getTime())) return 'Không rõ thời gian';
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString('en-GB');
  }

  async function handleNotificationClick(notification) {
    const controller = controllerRef.current;
    const destination = notificationDestination(notification, role);
    if (!await controller?.markRead(notification.id)
      || controllerRef.current !== controller || controller.snapshot().disabled) return;
    controller.close();
    if (destination) navigate(destination);
  }

  return (
    <div className="notifications-container" ref={dropdownRef}>
      <button
        className="notifications-bell"
        type="button"
        disabled={!enabled || disabled || busy}
        aria-label={englishText(unreadCount === null ? 'Thông báo' : `Thông báo (${unreadCount} chưa đọc)`)}
        aria-expanded={isOpen}
        onClick={() => isOpen ? controllerRef.current?.close() : controllerRef.current?.open()}
        title={englishText("Thông báo")}
      >
        <FiBell />
        {unreadCount > 0 && (
          <span className="notifications-badge"><UiText>{unreadCount > 99 ? '99+' : unreadCount}</UiText></span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-dropdown">
          <div className="notifications-header">
            <h3><UiText text={"Thông báo"} /></h3>
            {unreadCount > 0 && (
              <button
                className="btn-mark-all-read"
                type="button"
                disabled={busy || loading}
                onClick={() => controllerRef.current?.markAll()}
                title={englishText("Đánh dấu tất cả đã đọc")}
              >
                <FiCheck />{" "}<UiText text={"Đánh dấu tất cả đã đọc"} />{" "}</button>
            )}
            <button
              className="btn-close-dropdown"
              type="button"
              aria-label={englishText("Đóng thông báo")}
              onClick={() => controllerRef.current?.close()}
            >
              <FiX />
            </button>
          </div>

          <div className="notifications-list">
            {error&&<div className="notifications-empty" role="alert"><UiText>{error}</UiText><button type="button" disabled={busy} onClick={()=>controllerRef.current?.refresh()}><UiText text="Thử tải lại"/></button></div>}
            {loading && notifications.length===0 ? (
              <div className="notifications-loading"><UiText text={"Đang tải..."} /></div>
            ) : notifications.length === 0 ? (
              !error&&<div className="notifications-empty"><UiText text={"Chưa có thông báo nào"} /></div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  aria-disabled={busy}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={event => {
                    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); handleNotificationClick(notification); }
                  }}
                >
                  <div className="notification-content">
                    <div className="notification-title"><UiText>{notification.title}</UiText></div>
                    <div className="notification-message"><UiText>{notification.message}</UiText></div>
                    <div className="notification-time"><UiText>{formatTime(notification.created_at)}</UiText></div>
                  </div>
                  {!notification.is_read && (
                    <div className="notification-unread-dot"></div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

