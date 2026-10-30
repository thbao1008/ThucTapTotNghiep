import { UiOption,useUiLanguage } from '../../i18n/UiLanguage.jsx';
import { englishText,selectUiCopy } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
﻿import React, { useState, useEffect } from "react";
import Modal from "../common/Modal.jsx";
import api from "../../api";
import {FiSearch,FiRefreshCw,FiCheck,FiArrowUpRight,FiInbox} from 'react-icons/fi';
import '../../styles/admin-casework-refresh.css';

export default function SupportTickets() {
  const {locale}=useUiLanguage();
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);
  const [busyId,setBusyId]=useState(null);

  const fetchTickets = async () => {
    setLoading(true);setError('');
    try {
      const res = await api.get("/admin/support");
      const sorted = (res.data.requests || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setTickets(sorted);
    } catch (err) {
      setError('Không thể tải yêu cầu hỗ trợ. Vui lòng thử lại.');
    } finally {setLoading(false);}
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const markResolved = async (id) => {
    if(busyId!==null)return;
    setBusyId(id);setError('');setNotice('');
    try{
      const res=await api.patch(`/admin/support/${id}`,{status:'resolved'});
      const updated=res.data?.request;
      if(String(updated?.id)!==String(id)||updated?.status!=='resolved')throw Error('Invalid support response');
      setTickets(rows=>rows.map(row=>row.id===id?updated:row));
      setSelected(current=>current?.id===id?updated:current);
      setNotice('Đã đánh dấu yêu cầu là Đã hỗ trợ.');
    }catch(err){setError(err.response?.data?.error||'Chưa xác nhận được kết quả cập nhật. Hãy tải lại để kiểm tra.');}
    finally{setBusyId(null);}
  };

  const filteredTickets = tickets.filter((t) => {
    const searchLower = search.toLowerCase().trim();
    const matchSearch = !searchLower ||
      t.name?.toLowerCase().includes(searchLower) ||
      t.email?.toLowerCase().includes(searchLower) ||
      t.phone?.toLowerCase().includes(searchLower) ||
      t.note?.toLowerCase().includes(searchLower);

    const matchStatus =
      filter === "all" ? true : t.status?.toLowerCase() === filter;

    return matchSearch && matchStatus;
  });

  return (
    <>
      <div className="admin-workspace-page admin-support-page">
        <header className="admin-page-heading">
          <div><span className="admin-page-kicker">AESP ADMIN</span><h1><UiText>Support</UiText></h1><p><UiText>Review contact requests and follow up with learners.</UiText></p></div>
          <div className="admin-page-actions"><button type="button" className="btn btn-ghost" onClick={fetchTickets} disabled={loading}><FiRefreshCw aria-hidden="true"/><UiText>Refresh</UiText></button></div>
        </header>
        <section className="casework-surface">
        {error&&<p role="alert"><UiText>{error}</UiText> <button onClick={fetchTickets}><UiText text={"Tải lại yêu cầu"} /></button></p>}
        {notice&&<p role="status"><UiText>{notice}</UiText></p>}
        {loading&&<p role="status"><UiText text={"Đang tải yêu cầu..."} /></p>}
        <div className="casework-section-heading"><div><h2><FiInbox aria-hidden="true"/><UiText>Contact requests</UiText></h2><p><UiText>All incoming requests in one place.</UiText></p></div><span className="casework-count">{loading?'—':filteredTickets.length}</span></div>

        <div className="casework-toolbar">
          <label className="casework-search"><FiSearch aria-hidden="true"/>
          <input
            className="input"
            aria-label={englishText('Search requests')}
            placeholder={selectUiCopy("Tìm theo tên, email, số điện thoại hoặc ghi chú...",locale).text}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          </label>
          <select
            className="input"
            aria-label={englishText('Request status')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <UiOption value="all">{"Tất cả"}</UiOption>
            <UiOption value="pending">{"Chưa xử lý"}</UiOption>
            <UiOption value="resolved">{"Đã hỗ trợ"}</UiOption>
          </select>
        </div>

        <div className="admin-table-wrap"><table className="table support-inbox-table">
          <thead>
            <tr>
              <th><UiText>Contact</UiText></th>
              <th><UiText>Request</UiText></th>
              <th><UiText text={"Trạng thái"} /></th>
              <th><UiText text={"Ngày"} /></th>
              <th><UiText text={"Thao tác"} /></th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.map((t) => (
              <tr key={t.id}>
                <td><strong className="casework-contact-name">{t.name||'—'}</strong><span className="casework-contact-line">{t.email||'—'}</span><span className="casework-contact-line">{t.phone||'—'}</span></td>
                <td><span className="casework-reference">#{t.id}</span><p className="casework-request-note">{t.note||'—'}</p></td>
                <td><span className={`casework-status ${t.status==='resolved'?'is-resolved':'is-pending'}`}><UiText>{t.status==='resolved'?'Resolved':t.status==='pending'?'Pending':t.status}</UiText></span></td>
                <td className="casework-date"><UiText>{new Date(t.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</UiText><small>{new Date(t.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</small></td>
                <td>
                  <div className="casework-row-actions">
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => setSelected(t)}
                  ><FiArrowUpRight aria-hidden="true"/><UiText text={"Xem"}/></button>
                  {t.status !== "resolved" && (
                    <button
                      className="btn btn-primary btn-small"
                      disabled={busyId!==null}
                      onClick={() => markResolved(t.id)}
                    ><FiCheck aria-hidden="true"/><UiText>Mark resolved</UiText></button>
                  )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading&&filteredTickets.length===0&&<tr><td colSpan="5"><div className="casework-empty"><FiInbox aria-hidden="true"/><p><UiText>No requests match your filters.</UiText></p></div></td></tr>}
          </tbody>
        </table></div>
        </section>
      </div>

      {selected && (
        <Modal
          title={englishText(`Yêu cầu #${selected.id}`)}
          onClose={() => setSelected(null)}
          className="admin-casework-modal"
        >
          <dl className="casework-details"><div><dt><UiText text={"Họ tên"}/></dt><dd>{selected.name||'—'}</dd></div><div><dt>Email</dt><dd>{selected.email||'—'}</dd></div><div><dt><UiText text={"SĐT"}/></dt><dd>{selected.phone||'—'}</dd></div><div><dt><UiText text={"Trạng thái"}/></dt><dd><span className={`casework-status ${selected.status==='resolved'?'is-resolved':'is-pending'}`}><UiText>{selected.status==='resolved'?'Resolved':selected.status==='pending'?'Pending':selected.status}</UiText></span></dd></div></dl>
          <div className="casework-note"><span className="casework-detail-label"><UiText>Request</UiText></span><p>{selected.note||'—'}</p></div>
          <div className="casework-dialog-actions">
            <button
              className="btn btn-ghost btn-small"
              onClick={() => setSelected(null)}
            >{" "}<UiText text={"Đóng"} />{" "}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
