const base = '/mentors/classroom';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = value => {
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid chat identity');
  return String(value);
};
function message(row) {
  if (!row || typeof row !== 'object' || typeof row.body !== 'string' || !row.body.trim() || row.body.length > 3000
    || typeof row.client_id !== 'string' || !uuidPattern.test(row.client_id)
    || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
    || new Date(row.created_at).toISOString() !== row.created_at) throw new Error('Invalid message');
  return { ...row, id: id(row.id), sender_user_id: id(row.sender_user_id), client_id: row.client_id.toLowerCase() };
}
function page(data, { after, before } = {}) {
  if (!Array.isArray(data?.messages) || data.messages.length > 50 || typeof data.hasMore !== 'boolean') throw new Error('Invalid chat page');
  let previous = 0;
  const messages = data.messages.map(row => {
    const result = message(row), current = Number(result.id);
    if (current <= previous || (after && current <= Number(after)) || (before && current >= Number(before))) throw new Error('Invalid chat cursor');
    previous = current; return result;
  });
  return { messages, hasMore: data.hasMore };
}
function merge(old, added) {
  const rows = new Map(old.map(row => [row.id, row]));
  for (const row of added) {
    const previous = rows.get(row.id);
    if (previous && (previous.sender_user_id !== row.sender_user_id || previous.body !== row.body || previous.client_id !== row.client_id)) throw new Error('Message identity changed');
    const sameClient = [...rows.values()].find(item => item.sender_user_id === row.sender_user_id && item.client_id === row.client_id);
    if (sameClient && sameClient.id !== row.id) throw new Error('Duplicate message identity');
    rows.set(row.id, row);
  }
  return [...rows.values()].sort((a, b) => Number(a.id) - Number(b.id));
}
export function parseChatContacts(data) {
  if (!Array.isArray(data?.contacts)) throw new Error('Invalid chat contacts');
  const seen = new Set();
  return data.contacts.map(row => {
    const learner_id = id(row?.learner_id), user_id = id(row?.user_id);
    if (seen.has(learner_id) || (row.name !== null && (typeof row.name !== 'string' || row.name.length > 500))) throw new Error('Invalid chat contact');
    seen.add(learner_id);
    return { ...row, learner_id, user_id, name: row.name?.trim() || `Tài khoản ${user_id}` };
  });
}
export const initialMentorChatState = () => ({ messages: [], loading: true, error: '', sending: false, pending: false,
  denied: false, hasOlder: false, olderBusy: false, acknowledgedClientId: null });

// Each controller belongs to one mounted account/contact view. The polling
// cursor follows server reads, not a local send, so intervening replies survive.
export function createMentorChatController(api, { userId, learnerId, onChange, makeUuid = () => crypto.randomUUID(),
  schedule = setTimeout, cancel = clearTimeout }) {
  const actor = id(userId), peer = id(learnerId);
  let state = initialMentorChatState(), active = true, timer, reading, writing, older, after = null, pending = null;
  let readError = '', sendError = '', olderError = '';
  const snapshot = () => ({ ...state, messages: state.messages.map(row => ({ ...row })) });
  const publish = changes => { if (active) { state = { ...state, ...changes, error: sendError || olderError || readError }; onChange(snapshot()); } };
  const stop = () => { cancel(timer); reading?.abort(); writing?.abort(); older?.abort(); };
  const denied = status => [401, 403, 404].includes(status);
  const halt = () => {
    readError = ''; olderError = ''; sendError = 'Không còn quyền trò chuyện hoặc phiên đăng nhập đã hết hạn. Hãy làm mới danh bạ / đăng nhập lại.';
    publish({ messages: [], loading: false, denied: true, sending: false, pending: false, olderBusy: false });
    active = false; pending = null; stop();
  };
  const accepted = operation => state.messages.find(row => row.client_id === operation.clientId
    && row.sender_user_id === actor && row.body === operation.body);
  const acknowledge = () => {
    if (!pending || !accepted(pending)) return {};
    const clientId = pending.clientId; pending = null; sendError = '';
    return { pending: false, acknowledgedClientId: clientId };
  };
  async function refresh() {
    if (!active || reading) return false;
    cancel(timer); const controller = new AbortController(); reading = controller;
    try {
      const response = await api.get(`${base}/messages/${peer}${after ? `?after=${after}` : ''}`, { signal: controller.signal, timeout: 12000 });
      if (!active || controller.signal.aborted) return false;
      const data = page(response.data, { after });
      const messages = merge(state.messages, data.messages);
      // Validate the entire page before moving either the data or cursor.
      const initial = after === null;
      if (data.messages.length) after = data.messages.at(-1).id;
      state = { ...state, messages }; readError = '';
      publish({ loading: false, ...(initial ? { hasOlder: data.hasMore } : {}), ...acknowledge() }); return true;
    } catch (error) {
      if (active && !controller.signal.aborted) {
        if (denied(error.response?.status)) halt();
        else { readError = 'Không thể tải tin nhắn. Hệ thống sẽ thử lại; bạn có thể bấm Tải lại.'; publish({ loading: false }); }
      }
      return false;
    } finally {
      if (reading === controller) reading = null;
      controller.abort(); if (active) timer = schedule(refresh, 3000);
    }
  }
  async function send(body) {
    if (!active || writing) return false;
    if (typeof body !== 'string' || !body.trim() || body.trim().length > 3000) return false;
    body = body.trim();
    if (pending && pending.body !== body) return false;
    if (!pending) {
      const clientId = makeUuid(); if (!uuidPattern.test(clientId)) return false;
      pending = { clientId: clientId.toLowerCase(), body };
    }
    const operation = { ...pending }, controller = new AbortController(); writing = controller;
    sendError = ''; publish({ sending: true, pending: true });
    try {
      const response = await api.post(`${base}/messages/${peer}`, operation, { signal: controller.signal, timeout: 15000 });
      if (!active || controller.signal.aborted) return false;
      const row = message(response.data);
      if (row.sender_user_id !== actor || id(response.data.learner_id) !== peer || !id(response.data.mentor_id)
        || row.client_id !== operation.clientId || row.body !== operation.body) throw new Error('Unexpected send response');
      const messages = merge(state.messages, [row]);
      pending = null; sendError = ''; publish({ messages, pending: false, acknowledgedClientId: operation.clientId }); return true;
    } catch (error) {
      if (!active || controller.signal.aborted) return false;
      if (denied(error.response?.status)) { halt(); return false; }
      // An authoritative poll may already have confirmed a dropped/late POST.
      if (accepted(operation)) { pending = null; sendError = ''; publish({ pending: false, acknowledgedClientId: operation.clientId }); return true; }
      const status = error.response?.status;
      if (status >= 400 && status < 500 && status !== 408) {
        pending = null; sendError = 'Tin nhắn bị từ chối. Bạn có thể sửa nội dung và gửi lại.'; publish({ pending: false });
      } else {
        sendError = 'Chưa xác nhận tin đã gửi. Thử lại sẽ dùng cùng mã tin; không tạo tin trùng.'; publish({ pending: true });
      }
      return false;
    } finally { if (writing === controller) writing = null; controller.abort(); publish({ sending: false }); }
  }
  async function loadOlder() {
    if (!active || older || !state.hasOlder || !state.messages[0]) return false;
    const before = state.messages[0].id, controller = new AbortController(); older = controller;
    olderError = ''; publish({ olderBusy: true });
    try {
      const response = await api.get(`${base}/messages/${peer}?before=${before}`, { signal: controller.signal, timeout: 12000 });
      if (!active || controller.signal.aborted) return false;
      const data = page(response.data, { before });
      const messages = merge(state.messages, data.messages); olderError = '';
      publish({ messages, hasOlder: data.hasMore }); return true;
    } catch (error) {
      if (active && !controller.signal.aborted) {
        if (denied(error.response?.status)) halt();
        else { olderError = 'Không thể tải tin cũ. Hãy thử lại.'; publish({}); }
      }
      return false;
    } finally { if (older === controller) older = null; controller.abort(); publish({ olderBusy: false }); }
  }
  return { start: refresh, refresh, send, loadOlder, snapshot, disable: halt,
    dispose() { active = false; pending = null; stop(); } };
}
