import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, {useEffect,useMemo,useRef,useState} from 'react';
import {createScenarioArchiveReader} from '../../utils/scenarioSessionArchive.js';
import '../../styles/scenario-session-archive.css';

const emptyState = {status:'idle',page:null,error:'',denied:false};
const dateFormat = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

export default function ScenarioSessionArchive({client,currentSceneId = null,disabled = false,onSelect,onAccessDenied}) {
  const [trail,setTrail] = useState([null]), [pageIndex,setPageIndex] = useState(0), [reload,setReload] = useState(0);
  const [state,setState] = useState(emptyState), [selecting,setSelecting] = useState(null), [selectError,setSelectError] = useState('');
  const selection = useRef(null), selectionGeneration = useRef(0);
  const accessDenied = useRef(onAccessDenied);accessDenied.current=onAccessDenied;
  const reader = useMemo(() => {
    let instance;
    instance = createScenarioArchiveReader({client,onState:value => {
      setState({...value,owner:instance});
      if(value.denied)accessDenied.current?.();
    }});
    return instance;
  },[client]);
  const cursor = trail[pageIndex] ?? null;
  const view = state.owner === reader ? state : emptyState;
  const loading = view.status === 'loading';
  const blocked = disabled || loading || Boolean(selecting);
  useEffect(() => {
    reader.open();setState(emptyState);setTrail([null]);setPageIndex(0);setSelectError('');setSelecting(null);selection.current = null;
    return () => {selectionGeneration.current++;reader.dispose();};
  },[reader]);
  useEffect(() => {
    if (!disabled) reader.load(cursor);
    return () => reader.cancel();
  },[reader,cursor,reload,disabled]);

  async function select(item) {
    if (blocked || view.denied || selection.current || item.scene_id === currentSceneId || typeof onSelect !== 'function') return;
    const token = selectionGeneration.current;
    selection.current = item.scene_id;setSelecting(item.scene_id);setSelectError('');
    try { await onSelect(item.scene_id); }
    catch { if (token === selectionGeneration.current) setSelectError('Chưa mở được phiên đã chọn. Hãy thử lại.'); }
    finally { if (token === selectionGeneration.current) {selection.current = null;setSelecting(null);} }
  }
  function next() {
    const cursor = view.page?.next_cursor;
    if (blocked || !cursor || view.denied) return;
    if (trail.slice(0,pageIndex+1).includes(cursor)) {setSelectError('Danh sách chưa chuyển được sang trang tiếp theo. Hãy tải lại.');return;}
    setSelectError('');setTrail(previous => [...previous.slice(0,pageIndex+1),cursor]);setPageIndex(value => value+1);
  }
  return <section className="scenario-session-archive" aria-label={englishText("Phiên Scenario đã lưu")}>
    <div className="scenario-archive-heading"><div><h2><UiText text={"Phiên Scenario đã lưu"} /></h2><p><UiText text={"Học tiếp phiên đang luyện hoặc xem lại cuộc trò chuyện trước."} /></p></div>
      <button type="button" disabled={blocked} onClick={() => {setSelectError('');setReload(value => value+1);}}><UiText text={"Tải lại danh sách"} /></button></div>
    {loading && !disabled && <p role="status"><UiText text={"Đang tải các phiên đã lưu…"} /></p>}
    {(view.status === 'idle' || loading) && disabled && <p className="scenario-archive-note"><UiText text={"Danh sách sẽ tải khi phiên hiện tại sẵn sàng."} /></p>}
    {view.error && <p role="alert"><UiText>{view.error}</UiText></p>}
    {selectError && <p role="alert"><UiText>{selectError}</UiText></p>}
    {view.status === 'ready' && view.page.sessions.length === 0 && <p><UiText>{view.page.transient ? 'Bản xem thử này không lưu lịch sử phiên.' : 'Chưa có phiên Scenario nào được lưu.'}</UiText></p>}
    {view.page?.sessions.length > 0 && <ul className="scenario-archive-list">{view.page.sessions.map(item => {
      const current = item.scene_id === currentSceneId;
      return <li key={item.scene_id} aria-current={current ? 'true' : undefined}>
        <div><h3>{item.title}</h3><p><UiText>{item.level}</UiText> · <UiText>{item.mission_id ? 'Nhiệm vụ có hướng dẫn' : 'Hội thoại'}</UiText> · <UiText>{item.revision}</UiText><UiText text={"/12 lượt"} /></p>
          <small><time dateTime={item.created_at}><UiText>{dateFormat.format(new Date(item.created_at))}</UiText></time> · <UiText>{item.status === 'completed' ? 'Đã kết thúc' : 'Đang luyện'}</UiText></small></div>
        <button type="button" disabled={blocked || current || view.denied || typeof onSelect !== 'function'} onClick={() => select(item)}>
          <UiText>{current ? 'Đang xem' : selecting === item.scene_id ? 'Đang mở…' : item.status === 'completed' ? 'Xem lại' : 'Học tiếp'}</UiText>
        </button>
      </li>;
    })}</ul>}
    <nav className="scenario-archive-pages" aria-label={englishText("Trang phiên Scenario")}>
      <button type="button" disabled={blocked || pageIndex === 0 || view.denied} onClick={() => {setSelectError('');setPageIndex(value => value-1);}}><UiText text={"Trang trước"} /></button>
      <span><UiText text={"Trang"} />{" "}<UiText>{pageIndex+1}</UiText></span>
      <button type="button" disabled={blocked || !view.page?.next_cursor || view.denied} onClick={next}><UiText text={"Trang sau"} /></button>
    </nav>
  </section>;
}
