const numericScalar = value => typeof value === 'number' || typeof value === 'string';
const positiveId = value => numericScalar(value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
function unreadCount(value) {
  if (!numericScalar(value) || !/^(?:0|[1-9]\d*)$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid unread count');
  return Number(value);
}
function rowsFrom(data) {
  if (!Array.isArray(data?.notifications) || data.notifications.length > 100) throw new Error('Invalid notifications');
  const seen = new Set();
  return data.notifications.map(row => {
    if (!row || !positiveId(row.id) || seen.has(String(row.id)) || typeof row.is_read !== 'boolean'
      || typeof row.title !== 'string' || typeof row.message !== 'string') throw new Error('Invalid notification');
    seen.add(String(row.id)); return { ...row };
  });
}

export const initialNotificationsState = () => ({ notifications: [], unreadCount: null, isOpen: false,
  loading: false, busy: false, error: '', disabled: false });

// Each instance belongs to one signed-in view. Server recount is authoritative:
// duplicate reads and newly arriving notifications must not blindly decrement it.
export function createNotificationsController(api, onChange) {
  let state = initialNotificationsState(), active = true, sequence = 0, readController, writeController;
  const publish = changes => { if (active) { state = { ...state, ...changes }; onChange({ ...state }); } };
  const invalidateReads = () => { sequence++; readController?.abort(); readController = null; };
  const current = (request, controller) => active && !state.disabled && sequence === request && !controller.signal.aborted;
  async function refresh({ includeList = state.isOpen, duringWrite = false } = {}) {
    if (!active || state.disabled || (state.busy && !duringWrite)) return false;
    invalidateReads(); const request = sequence;
    const controller = new AbortController(); readController = controller;
    publish({ loading: includeList, error: '' });
    try {
      const [countResponse, listResponse] = await Promise.all([
        api.get('/notifications/unread-count', { signal: controller.signal, timeout: 12000 }),
        includeList ? api.get('/notifications?limit=20', { signal: controller.signal, timeout: 12000 }) : null
      ]);
      if (!current(request, controller)) return false;
      const count = unreadCount(countResponse.data?.count);
      const notifications = includeList ? rowsFrom(listResponse.data) : state.notifications;
      publish({ unreadCount: count, notifications }); return true;
    } catch {
      if (current(request, controller)) publish({ error: 'Không thể tải thông báo mới. Đang giữ thông báo đã tải trước đó.' });
      return false;
    } finally {
      if (current(request, controller)) { publish({ loading: false }); readController = null; }
      controller.abort(); // Also stop the sibling request when one part failed.
    }
  }
  async function mutate(id = null) {
    if (!active || state.disabled || state.busy) return false;
    if (id !== null) {
      if (!positiveId(id)) return false;
      const notification = state.notifications.find(row => String(row.id) === String(id));
      if (!notification) return false;
      if (notification.is_read) return true;
    } else if (state.unreadCount === 0) return true;
    invalidateReads(); publish({ busy: true, loading: false, error: '' });
    const controller = new AbortController(); writeController = controller;
    try {
      const response = await api.patch(id === null ? '/notifications/mark-all-read' : `/notifications/${id}/read`, {}, { signal: controller.signal, timeout: 12000 });
      if (!active || state.disabled || controller.signal.aborted) return false;
      if (id === null) unreadCount(response.data?.count);
      else if (!positiveId(response.data?.notification?.id) || String(response.data.notification.id) !== String(id)
        || response.data.notification.is_read !== true) throw new Error('Notification identity mismatch');
      publish({ notifications: state.notifications.map(row => id === null || String(row.id) === String(id) ? { ...row, is_read: true } : row) });
      return await refresh({ includeList: state.isOpen, duringWrite: true });
    } catch {
      if (active && !state.disabled && !controller.signal.aborted) publish({ error: 'Chưa xác nhận được thao tác đã đọc. Hãy tải lại thông báo trước khi thử lại.' });
      return false;
    } finally {
      if (active) publish({ busy: false });
      if (writeController === controller) writeController = null;
      controller.abort();
    }
  }
  return {
    refresh, markRead: id => mutate(id), markAll: () => mutate(),
    // A background refresh must never cancel an interactive read or mutation.
    poll() { return !active || state.disabled || state.busy || readController
      ? Promise.resolve(false) : refresh({ includeList: state.isOpen }); },
    open() { if (!active || state.disabled || state.busy) return; publish({ isOpen: true }); return refresh({ includeList: true }); },
    close() {
      if (!state.isOpen) return;
      // A saved mutation still needs its authoritative unread recount, even if
      // the user hides the panel before that read finishes.
      if (!state.busy) invalidateReads();
      publish({ isOpen: false, loading: false });
    },
    disable() { invalidateReads(); writeController?.abort(); publish({ ...initialNotificationsState(), disabled: true }); },
    dispose() { active = false; invalidateReads(); writeController?.abort(); },
    snapshot: () => ({ ...state })
  };
}
