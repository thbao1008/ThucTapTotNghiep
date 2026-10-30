const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const readable = (value,max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
  && !/[\u0000-\u001f\u007f]/.test(value);
export const validScenarioArchiveCursor = value => typeof value === 'string' && /^[a-z0-9_-]{1,256}$/i.test(value);
const invalid = () => { throw new Error('Danh sách phiên Scenario chưa hợp lệ.'); };

export function presentScenarioArchive(value, cursor = null) {
  if (!value || !Array.isArray(value.sessions) || value.sessions.length > 10 || typeof value.transient !== 'boolean'
    || value.next_cursor !== null && !validScenarioArchiveCursor(value.next_cursor)
    || value.next_cursor !== null && (value.sessions.length !== 10 || value.next_cursor === cursor)
    || value.transient && (value.sessions.length !== 0 || value.next_cursor !== null)) return invalid();
  const ids = new Set();
  const sessions = value.sessions.map(item => {
    if (!uuid(item?.scene_id) || ids.has(item.scene_id.toLowerCase()) || !readable(item.title,120)
      || !['A1','A2','B1','B2'].includes(item.level) || !['ordering','making-friends','solving-problems'].includes(item.topic_id)
      || ![null,'cafe-order-v1'].includes(item.mission_id) || item.mission_id && (item.level !== 'A2' || item.topic_id !== 'ordering')
      || !['ready','completed'].includes(item.status) || !Number.isSafeInteger(item.revision) || item.revision < 0 || item.revision > 12
      || item.status === 'completed' && item.revision === 0
      || typeof item.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(item.created_at)
      || !Number.isFinite(Date.parse(item.created_at)) || new Date(item.created_at).toISOString().slice(0,10) !== item.created_at.slice(0,10)) return invalid();
    ids.add(item.scene_id.toLowerCase());
    return {scene_id:item.scene_id.toLowerCase(),title:item.title.trim(),level:item.level,topic_id:item.topic_id,
      mission_id:item.mission_id,status:item.status,revision:item.revision,created_at:item.created_at};
  });
  return {sessions,next_cursor:value.next_cursor,transient:value.transient};
}

// Listing is read-only. A late reply from an older page/account cannot replace
// current state, even if the transport ignores AbortSignal.
export function createScenarioArchiveReader({client,onState = () => {}}) {
  let generation = 0, active = null, disposed = false;
  const emit = value => { if (!disposed) onState(value); };
  function cancel() { generation++; active?.abort(); active = null; }
  async function load(cursor = null) {
    if (disposed) return;
    if (cursor !== null && !validScenarioArchiveCursor(cursor)) return invalid();
    cancel(); const token = generation, controller = new AbortController(); active = controller;
    emit({status:'loading',page:null,error:'',denied:false});
    try {
      const response = await client.get('/learners/scenario-world/sessions',{
        signal:controller.signal,timeout:15000,...(cursor === null ? {} : {params:{cursor}})
      });
      if (disposed || token !== generation || controller.signal.aborted) return;
      const page = presentScenarioArchive(response.data,cursor);
      emit({status:'ready',page,error:'',denied:false});
      return page;
    } catch (error) {
      if (disposed || token !== generation || controller.signal.aborted) return;
      const denied = [401,403].includes(error.response?.status);
      emit({status:'error',page:null,denied,error:denied
        ? 'Bạn chưa có quyền xem các phiên này. Hãy kiểm tra lại đăng nhập.'
        : 'Chưa tải được các phiên Scenario. Hãy thử lại.'});
    } finally { if (token === generation) active = null; }
  }
  return {load,cancel,open(){cancel();disposed = false;},dispose(){cancel();disposed = true;}};
}
