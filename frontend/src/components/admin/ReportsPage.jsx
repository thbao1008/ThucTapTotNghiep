import { UiOption,useUiLanguage } from '../../i18n/UiLanguage.jsx';
import { englishText,selectUiCopy } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
﻿import React, { useEffect, useState } from "react";
import {useRef} from "react";
import {reportReplyDraft,replaceReviewedReport} from "../../utils/adminReport.js";
import api from "../../api.js";
import { FiFlag, FiSearch, FiUsers, FiRefreshCw } from "react-icons/fi";
import "../../styles/reportpage.css";
import '../../styles/admin-casework-refresh.css';
import UserForPage from "./UserForPage.jsx";
import ProgressAnalytics from "../learner/ProgressAnalytics.jsx";
import { normalizeFileUrl, normalizeImageUrl, normalizeVideoUrl } from "../../utils/apiHelpers.js";
import { AuthenticatedMedia } from "../../utils/authenticatedMedia.jsx";

export default function ReportsPage() {
  const {locale}=useUiLanguage();
  const [filters, setFilters] = useState({ from: "", to: "", status: "pending" });
  const [summary, setSummary] = useState({ total_reports: 0 });
  const [feedbacks, setFeedbacks] = useState([]);
  const [loadingReports,setLoadingReports]=useState(true);
  const [reportsError,setReportsError]=useState('');
  const [loadingSummary,setLoadingSummary]=useState(true);
  const [summaryError,setSummaryError]=useState(false);
  const [progressError,setProgressError]=useState('');
  const summaryRequestRef=useRef(0);
  const reportsRequestRef=useRef(0);
  const [progress, setProgress] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  
  // State cho learners progress
  const [learnersProgress, setLearnersProgress] = useState([]);
  const [loadingLearners, setLoadingLearners] = useState(true);
  const [selectedLearnerId, setSelectedLearnerId] = useState(null);
  const [selectedLearnerAnalytics, setSelectedLearnerAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  
  // State cho filter và search
  const [mentorFilter, setMentorFilter] = useState("");
  const [learnerSearch, setLearnerSearch] = useState("");
  const [mentors, setMentors] = useState([]);

  // State cho modal reply
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [replyContent, setReplyContent] = useState("");
  const [savingReply,setSavingReply]=useState(false);
  const [replyError,setReplyError]=useState('');
  const statusFilterRef=useRef(filters.status);
  statusFilterRef.current=filters.status;
  
  // State cho modal phóng to hình ảnh/video
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState({ type: null, url: null });

  // Load summary (chỉ để lọc theo thời gian)
  const fetchSummary = async (currentFilters=filters) => {
    const request=++summaryRequestRef.current;
    setLoadingSummary(true);setSummaryError(false);
    try {
      const params = {};
      if (currentFilters.from && currentFilters.to) {
        params.from = currentFilters.from;
        params.to = currentFilters.to;
      }
      const res = await api.get("/admin/reports/summary", { params });
      if(request===summaryRequestRef.current)setSummary(res.data.summary || { total_reports: 0 });
    } catch (err) {
      console.error("❌ Lỗi load summary:", err);
      if(request===summaryRequestRef.current)setSummaryError(true);
    } finally {if(request===summaryRequestRef.current)setLoadingSummary(false);}
  };

  // Load reports
  const fetchReports = async (status) => {
    const request=++reportsRequestRef.current;
    setLoadingReports(true);setReportsError('');
    try {
      const params = {};
      if (status) params.status = status;
      else if (filters.status) params.status = filters.status;
      const fb = await api.get("/admin/reports", { params });
      if(request===reportsRequestRef.current)setFeedbacks(fb.data.reports || []);
    } catch (err) {
      console.error("❌ Lỗi load reports:", err);
      if(request===reportsRequestRef.current)setReportsError('Unable to load reports. Please try again.');
    } finally {if(request===reportsRequestRef.current)setLoadingReports(false);}
  };

  // Load learner progress
  const fetchProgress = async () => {
    try {
      if (!searchQuery) return;
      const pr = await api.get("/admin/reports/learner-progress", { params: { query: searchQuery } });
      setProgress(pr.data.learners || []);
    } catch (err) {
      console.error("❌ Lỗi load progress:", err);
    }
  };

  // Change report status
  const changeStatus = async (reportId, newStatus, customReply = null) => {
    if(savingReply)return;
    setSavingReply(true);setReplyError('');
    try {
      // Nội dung mặc định theo status
      let defaultReply = "";
      if (newStatus === "dismissed") {
        defaultReply = "Phản hồi bị từ chối vì chưa đủ căn cứ.";
      } else if (newStatus === "resolved") {
        defaultReply = "Phản hồi được chấp nhận đang tiến hành xử lý";
      }
      
      const finalReply = customReply !== null ? customReply : defaultReply;
      
      const res = await api.patch(`/admin/reports/${reportId}/status`, {
        status: newStatus,
        replyContent: finalReply,
        actorRole: "admin"
      });
      console.log("✅ Report updated:", res.data.report);

      // cập nhật lại state FE
      setFeedbacks(prev => replaceReviewedReport(prev,res.data.report,statusFilterRef.current));
      
      setShowReplyModal(false);
      setSelectedReport(null);
      setReplyContent("");
    } catch (err) {
      setReplyError(err.response?.data?.message || "Chưa lưu được phản hồi. Vui lòng kiểm tra lại.");
    } finally {setSavingReply(false);}
  };

  const openReplyModal = (report, newStatus = null) => {
    const draft=reportReplyDraft(report,newStatus);
    const existing=(newStatus===null||newStatus===report.status)&&Boolean(report.reply?.replace(/^\[Admin[^\]]*\]\s*/,''));
    setSelectedReport(draft.report);setReplyContent(locale==='en'&&!existing?englishText(draft.reply):draft.reply);setReplyError('');
    setShowReplyModal(true);
  };

  // Load mentors
  const fetchMentors = async () => {
    try {
      const res = await api.get("/admin/reports/mentors");
      setMentors(res.data.mentors || []);
    } catch (err) {
      console.error("❌ Lỗi load mentors:", err);
    }
  };

  // Load learners progress với filter và search
  const fetchLearnersProgress = async () => {
    try {
      setLoadingLearners(true);
      setProgressError('');
      const params = {};
      if (mentorFilter) params.mentor_id = mentorFilter;
      if (learnerSearch.trim()) params.search = learnerSearch.trim();
      
      const res = await api.get("/admin/reports/learners-progress", { params });
      setLearnersProgress(res.data.learners || []);
    } catch (err) {
      console.error("❌ Lỗi load learners progress:", err);
      setProgressError('Unable to load learner progress. Please try again.');
    } finally {
      setLoadingLearners(false);
    }
  };

  // Load analytics cho learner được chọn
  const fetchLearnerAnalytics = async (learnerId) => {
    try {
      setLoadingAnalytics(true);
      const res = await api.get(`/learners/${learnerId}/progress-analytics`);
      setSelectedLearnerAnalytics(res.data);
    } catch (err) {
      console.error("❌ Lỗi load analytics:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleLearnerClick = (learnerId) => {
    setSelectedLearnerId(learnerId);
    fetchLearnerAnalytics(learnerId);
  };

  useEffect(() => {
    fetchSummary();
    fetchReports(filters.status);
    fetchMentors();
  }, []);

  // Load learners progress khi component mount và khi filter/search thay đổi
  useEffect(() => {
    fetchLearnersProgress();
  }, [mentorFilter, learnerSearch]);

  // Check URL params sau khi learners đã load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const learnerIdParam = urlParams.get('learnerId');
    if (learnerIdParam && learnersProgress.length > 0) {
      const learner = learnersProgress.find(l => String(l.learner_id) === String(learnerIdParam));
      if (learner && !selectedLearnerId) {
        handleLearnerClick(learner.learner_id);
        // Clean URL
        window.history.replaceState({}, '', '/admin/reports');
      }
    }
  }, [learnersProgress]);

  // Hàm mở modal phóng to hình ảnh/video
  const openMediaModal = (type, url) => {
    const fullUrl = normalizeFileUrl(url);
    setSelectedMedia({ type, url: fullUrl });
    setShowMediaModal(true);
  };

  return (
    <div className="report-page admin-workspace-page admin-reports-page">
      <header className="admin-page-heading"><div><span className="admin-page-kicker">AESP ADMIN</span><h1><UiText>Reports</UiText></h1><p><UiText>Review reports and keep an eye on learning progress.</UiText></p></div><div className="admin-page-actions"><button type="button" className="btn btn-ghost" disabled={loadingReports||loadingLearners} onClick={()=>{fetchReports(filters.status);fetchSummary();fetchLearnersProgress();}}><FiRefreshCw aria-hidden="true"/><UiText>Refresh</UiText></button></div></header>

      {/* Phản hồi & tố cáo - Đưa lên trước */}
      <section className="casework-surface">
        <div className="casework-section-heading"><div><h2><FiFlag aria-hidden="true"/><UiText text={"Phản hồi & Tố cáo"}/></h2><p><UiText>Review each report before updating its status.</UiText></p></div><span className="casework-count">{loadingReports?'—':feedbacks.length}</span></div>
        
        {/* Bộ lọc thời gian - Di chuyển vào trong section */}
        <div className="casework-report-period">
          <label><UiText text={"Từ ngày:"} />{" "}<input
              type="date"
              value={filters.from}
              onChange={e => {const next={...filters,from:e.target.value};setFilters(next);fetchSummary(next);}}
            />
          </label>
          <label><UiText text={"Đến ngày:"} />{" "}<input
              type="date"
              value={filters.to}
              onChange={e => {
                const newFilters = { ...filters, to: e.target.value };
                setFilters(newFilters);
                fetchSummary(newFilters);
              }}
            />
          </label>
          <div className="casework-period-total"><strong>{loadingSummary||summaryError?'—':summary.total_reports}</strong><span><UiText text={"Tố cáo (theo thời gian)"}/></span></div>
        </div>
        
        <div className="casework-toolbar casework-report-status">
          <label><span className="casework-detail-label"><UiText text={"Trạng thái"}/></span>
          <select
            name="status-select"
            value={filters.status}
            onChange={e => {
              const newStatus = e.target.value;
              setFilters({ ...filters, status: newStatus });
              fetchReports(newStatus);
            }}
          >
            <UiOption value="pending">{"Pending"}</UiOption>
            <UiOption value="resolved">{"Resolved"}</UiOption>
            <UiOption value="dismissed">{"Dismissed"}</UiOption>
          </select>
          </label>
          {loadingReports&&<span role="status" className="casework-muted"><UiText text={"Đang tải..."}/></span>}
        </div>
        {reportsError&&<p role="alert" className="casework-alert"><UiText>{reportsError}</UiText></p>}

        <div className="admin-table-wrap"><table className="table report-cases-table">
          <thead>
            <tr>
              <th><UiText text={"Người dùng"} /></th>
              <th><UiText text={"Nội dung"} /></th>
              <th><UiText text={"Trạng thái"} /></th>
              <th><UiText text={"Ngày gửi"} /></th>
              <th><UiText text={"Phản hồi admin"} /></th>
            </tr>
          </thead>
          <tbody>
            {feedbacks.map(f => (
              <tr key={f.report_id}>
                <td className="sender-target">
                  <strong><UiText text={"Reporter:"} /></strong>{" "}
                  <button type="button" className="casework-person-link" onClick={() => setSelectedUserId(f.reporter_id)}>
                    {f.reporter_name}<small><UiText>{f.reporter_role}</UiText></small>
                  </button>
                  <br />
                  <strong><UiText text={"Target:"} /></strong>{" "}
                  <button type="button" className="casework-person-link" onClick={() => setSelectedUserId(f.target_id)}>
                    {f.target_name}<small><UiText>{f.target_role}</UiText></small>
                  </button>
                </td>

                <td className="casework-report-content" style={{ whiteSpace: "pre-line" }}>
                  <div>{f.content}</div>
                  {f.image_url && (
                    <div style={{ marginTop: 8 }}>
                      <AuthenticatedMedia as="img"
                        src={normalizeImageUrl(f.image_url)}
                        alt="Report image"
                        onClick={() => openMediaModal("image", f.image_url)}
                        style={{ 
                          maxWidth: "200px", 
                          maxHeight: "200px", 
                          borderRadius: 4,
                          cursor: "pointer",
                          transition: "transform 0.2s",
                          objectFit: "cover"
                        }}
                        onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
                        onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                      />
                    </div>
                  )}
                  {f.video_url && (
                    <div style={{ marginTop: 8 }}>
                      <AuthenticatedMedia as="video"
                        src={normalizeVideoUrl(f.video_url)}
                        controls
                        onClick={() => openMediaModal("video", f.video_url)}
                        style={{ 
                          maxWidth: "300px", 
                          maxHeight: "200px", 
                          borderRadius: 4,
                          cursor: "pointer",
                          transition: "transform 0.2s"
                        }}
                        onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
                        onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                      />
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexDirection: "column" }}>
                    <select
                      className={`casework-status-select is-${f.status}`}
                      aria-label={englishText('Report status')}
                      value={f.status}
                      onChange={e => {
                        const newStatus = e.target.value;
                        if (newStatus !== f.status) {
                          openReplyModal(f, newStatus);
                        }
                      }}
                      style={{ padding: "4px", borderRadius: "4px", width: "100%" }}
                    >
                      <UiOption value="pending">{"Pending"}</UiOption>
                      <UiOption value="resolved">{"Resolved"}</UiOption>
                      <UiOption value="dismissed">{"Dismissed"}</UiOption>
                    </select>
                    {f.status !== "pending" && (
                      <button
                        className="btn-ghost"
                        onClick={() => openReplyModal(f)}
                        style={{ fontSize: 12, padding: "4px 8px", width: "100%" }}
                      >{" "}<UiText text={"Xem/Sửa phản hồi"} />{" "}</button>
                    )}
                  </div>
                </td>
                <td className="casework-date"><UiText>{new Date(f.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</UiText><small>{new Date(f.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</small></td>
                <td style={{ whiteSpace: "pre-line" }}>
                  {f.reply ? (
                    <div className="casework-report-reply">{f.reply}</div>
                  ) : (
                    <span className="placeholder"><UiText text={"Chưa có phản hồi"} /></span>
                  )}
                </td>
              </tr>
            ))}
            {!loadingReports&&!reportsError&&feedbacks.length===0&&<tr><td colSpan="5"><div className="casework-empty"><FiFlag aria-hidden="true"/><p><UiText>No reports match this status.</UiText></p></div></td></tr>}
          </tbody>
        </table></div>
      </section>

      {/* Tiến độ đào tạo - Danh sách learners với progress - Đưa xuống dưới */}
      <section className="casework-surface">
        <div className="casework-section-heading"><div><h2><FiUsers aria-hidden="true"/><UiText text={"Tiến độ đào tạo"}/></h2><p><UiText>Find a learner or filter by their assigned mentor.</UiText></p></div></div>
        
        {/* Bộ lọc và tìm kiếm */}
        <div className="casework-toolbar casework-progress-toolbar">
          <label className="casework-filter-field">
            <span><UiText text={"Lọc theo giảng viên:"} /></span>
            <select
              value={mentorFilter}
              onChange={(e) => setMentorFilter(e.target.value)}
            >
              <UiOption value="">{"Tất cả giảng viên"}</UiOption>
              {mentors.map(mentor => (
                <option key={mentor.mentor_id} value={mentor.mentor_id}>
                  {mentor.mentor_name}
                </option>
              ))}
            </select>
          </label>
          
          <label className="casework-search">
            <FiSearch aria-hidden="true"/>
            <input
              type="text"
              placeholder={selectUiCopy("Tìm theo tên hoặc số điện thoại học viên...",locale).text}
              value={learnerSearch}
              onChange={(e) => setLearnerSearch(e.target.value)}
              aria-label={englishText('Find a learner')}
            />
          </label>
        </div>
        {progressError&&<p role="alert" className="casework-alert"><UiText>{progressError}</UiText></p>}
        
        {loadingLearners ? (
          <div><UiText text={"Đang tải..."} /></div>
        ) : (
          <div className="admin-table-wrap"><table className="table casework-progress-table">
            <thead>
              <tr>
                <th><UiText text={"Học viên"} /></th>
                <th><UiText text={"Giảng viên hỗ trợ"} /></th>
                <th><UiText text={"Tổng điểm trung bình"} /></th>
                <th><UiText text={"Số lần luyện nói"} /></th>
                <th><UiText text={"Số lần làm challenge"} /></th>
                <th><UiText text={"Thao tác"} /></th>
              </tr>
            </thead>
            <tbody>
              {learnersProgress.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center" }}><UiText text={"Chưa có dữ liệu"} /></td>
                </tr>
              ) : (
                learnersProgress.map(learner => (
                  <tr key={learner.learner_id}>
                    <td>
                      <button type="button"
                        className="casework-person-link"
                        onClick={() => setSelectedUserId(learner.user_id)}
                      >
                        {learner.learner_name || "N/A"}
                      </button>
                    </td>
                    <td>
                      {learner.mentor_name ? (
                        <button type="button"
                          className="casework-person-link"
                          onClick={() => learner.mentor_user_id && setSelectedUserId(learner.mentor_user_id)}
                          disabled={!learner.mentor_user_id}
                        >
                          {learner.mentor_name}
                        </button>
                      ) : (
                        <UiText text={"Chưa gán"} />
                      )}
                    </td>
                    <td><UiText>{learner.average_score == null ? "Chưa tổng hợp" : `${Number(learner.average_score).toFixed(1)}/100`}</UiText></td>
                    <td><UiText>{learner.practice_attempts || 0}</UiText></td>
                    <td><UiText>{learner.challenge_attempts || 0}</UiText></td>
                    <td>
                      <button 
                        className="btn-ghost"
                        onClick={() => handleLearnerClick(learner.learner_id)}
                        style={{ padding: "4px 8px", fontSize: 12 }}
                      >{" "}<UiText text={"Xem chi tiết"} />{" "}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        )}
      </section>

      {/* Modal hiển thị thông tin user qua UserForPage */}
      {selectedUserId && (
        <UserForPage
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}

      {/* Modal Reply/Note cho Admin */}
      {showReplyModal && selectedReport && (
        <div className="casework-dialog-overlay">
          <div className="casework-dialog" role="dialog" aria-modal="true" aria-label={englishText('Reply to report')}>
            <h3 className="casework-dialog-heading">{" "}<UiText text={"Phản hồi cho Report #"} /><UiText>{selectedReport.report_id}</UiText>
            </h3>
            
            <div style={{ marginBottom: 16 }}>
              <span className={`casework-status is-${selectedReport.status}`}><UiText>{selectedReport.status}</UiText></span>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <strong><UiText text={"Nội dung report:"} /></strong>
              <div className="casework-note">
                {selectedReport.content}
              </div>
            </div>

            {selectedReport.image_url && (
              <div style={{ marginBottom: 16 }}>
                <strong><UiText text={"Hình ảnh:"} /></strong>
                <div style={{ marginTop: 8 }}>
                  <AuthenticatedMedia as="img"
                    src={normalizeImageUrl(selectedReport.image_url)}
                    alt="Report"
                    onClick={() => openMediaModal("image", selectedReport.image_url)}
                    style={{ 
                      maxWidth: "100%", 
                      maxHeight: "300px", 
                      borderRadius: 4,
                      cursor: "pointer",
                      transition: "transform 0.2s"
                    }}
                    onMouseEnter={(e) => e.target.style.transform = "scale(1.02)"}
                    onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                  />
                </div>
              </div>
            )}

            {selectedReport.video_url && (
              <div style={{ marginBottom: 16 }}>
                <strong><UiText text={"Video:"} /></strong>
                <div style={{ marginTop: 8 }}>
                  <AuthenticatedMedia as="video"
                    src={normalizeVideoUrl(selectedReport.video_url)}
                    controls
                    onClick={() => openMediaModal("video", selectedReport.video_url)}
                    style={{ 
                      maxWidth: "100%", 
                      maxHeight: "300px", 
                      borderRadius: 4,
                      cursor: "pointer",
                      transition: "transform 0.2s"
                    }}
                    onMouseEnter={(e) => e.target.style.transform = "scale(1.02)"}
                    onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                  />
                </div>
              </div>
            )}

            <label className="label" htmlFor="admin-report-response"><UiText text={"Phản hồi của Admin:"} /></label>
            <textarea
              id="admin-report-response"
              rows="5"
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              className="input"
              placeholder={
                englishText(selectedReport.status === "dismissed"
                  ? "Phản hồi bị từ chối vì chưa đủ căn cứ. (Bạn có thể chỉnh sửa nội dung này)"
                  : selectedReport.status === "resolved"
                  ? "Phản hồi được chấp nhận đang tiến hành xử lý (Bạn có thể chỉnh sửa nội dung này)"
                  : "Nhập phản hồi...")
              }
            />

            {replyError&&<p role="alert"><UiText>{replyError}</UiText></p>}
            <div className="casework-dialog-actions">
              <button
                className="btn-submit"
                disabled={savingReply}
                onClick={() => {
                  changeStatus(selectedReport.report_id, selectedReport.status, replyContent);
                }}
              >{" "}<UiText text={"Lưu phản hồi"} />{" "}</button>
              <button
                className="btn-ghost"
                disabled={savingReply}
                onClick={() => {
                  setShowReplyModal(false);
                  setSelectedReport(null);
                  setReplyContent("");
                }}
              >{" "}<UiText text={"Hủy"} />{" "}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal hiển thị chi tiết progress của learner */}
      {selectedLearnerId && (
        <div className="casework-dialog-overlay">
          <div className="casework-dialog casework-dialog--wide" role="dialog" aria-modal="true" aria-label={englishText('Learner progress')}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{" "}<UiText text={"Chi tiết tiến độ học tập -"} />{" "}{learnersProgress.find(l => l.learner_id === selectedLearnerId)?.learner_name || "N/A"}
              </h3>
              <button
                className="btn-ghost"
                onClick={() => {
                  setSelectedLearnerId(null);
                  setSelectedLearnerAnalytics(null);
                }}
                style={{ padding: "8px 16px" }}
              >{" "}<UiText text={"Đóng"} />{" "}</button>
            </div>
            
            {loadingAnalytics ? (
              <div><UiText text={"Đang tải dữ liệu phân tích..."} /></div>
            ) : selectedLearnerAnalytics ? (
              <ProgressAnalytics analytics={selectedLearnerAnalytics} hideRecommendations={false} />
            ) : (
              <div><UiText text={"Không có dữ liệu phân tích"} /></div>
            )}
          </div>
        </div>
      )}

      {/* Modal phóng to hình ảnh/video */}
      {showMediaModal && selectedMedia.url && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            cursor: "pointer"
          }}
          onClick={() => {
            setShowMediaModal(false);
            setSelectedMedia({ type: null, url: null });
          }}
        >
          <div 
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {selectedMedia.type === "image" ? (
              <AuthenticatedMedia as="img"
                src={selectedMedia.url}
                alt="Phóng to"
                style={{
                  maxWidth: "100%",
                  maxHeight: "90vh",
                  borderRadius: 8,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
                }}
              />
            ) : (
              <AuthenticatedMedia as="video"
                src={selectedMedia.url}
                controls
                autoPlay
                style={{
                  maxWidth: "100%",
                  maxHeight: "90vh",
                  borderRadius: 8,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
                }}
              />
            )}
            <button
              onClick={() => {
                setShowMediaModal(false);
                setSelectedMedia({ type: null, url: null });
              }}
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                background: "rgba(255,255,255,0.9)",
                border: "none",
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                fontSize: "24px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                color: "#333",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
              }}
            >{" "}<UiText text={"×"} />{" "}</button>
          </div>
        </div>
      )}
    </div>
  );
}
