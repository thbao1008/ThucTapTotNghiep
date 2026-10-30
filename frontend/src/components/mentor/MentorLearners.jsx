import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import { useSearchParams } from "react-router-dom";
﻿import { useEffect, useState } from "react";
import { getAuth } from "../../utils/auth";
import { useRef } from "react";
import Modal from "../common/Modal";
import "../../styles/learnersofmentor.css";
import api from "../../api";   // axios instance với baseURL http://localhost:4000/api (API Gateway)

export default function MentorLearners() {
  const auth = getAuth();
  const userId = auth?.user?._id || auth?.user?.id || auth?.user?.user_id;
  const progressRequest = useRef(0);
  const [search]=useSearchParams();
  const requestedLearner=search.getAll('learner').length===1?search.get('learner'):(search.has('learner')?'invalid':null);
  const handledLink=useRef(null);
  const [linkError,setLinkError]=useState('');
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState('');
  const [loadAttempt,setLoadAttempt]=useState(0);
  const [mentorId, setMentorId] = useState(null);

  // Modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedLearner, setSelectedLearner] = useState(null);
  const [progress, setProgress] = useState(null);
  const [progressError, setProgressError] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [noteError,setNoteError]=useState(''),[noteSaving,setNoteSaving]=useState(false);
  const noteBusy=useRef(false);
  const [reportInput, setReportInput] = useState("");
  const [reportImage, setReportImage] = useState(null);
  const [reportVideo, setReportVideo] = useState(null);
  const [reportStatus, setReportStatus] = useState({ canReport: true, hoursRemaining: 0 });
  const [checkingReport, setCheckingReport] = useState(false);

  // Theo dõi số lượng học viên trước đó để phát hiện học viên mới
  const prevCount = useRef(0);

  useEffect(() => {
    const controller=new AbortController(),{signal}=controller;
    handledLink.current=null;setLearners([]);setMentorId(null);setLoading(true);setLoadError('');setShowProgressModal(false);progressRequest.current++;
    async function fetchLearners() {
      try {
        const mentorRes = await api.get(`/mentors/by-user/${userId}`,{signal});
        const mid = mentorRes.data.mentor_id || mentorRes.data.id;
        if(signal.aborted)return;
        setMentorId(mid);

        const learnersRes = await api.get(`/mentors/${mid}/learners`,{signal});
        if(signal.aborted)return;
        const newLearners = learnersRes.data.learners.map(l => {
          // Normalize report data - ensure null if empty or invalid
          let report = null;
          if (l.report) {
            if (typeof l.report === 'string') {
              const trimmed = l.report.trim();
              if (trimmed.length > 0) {
                report = trimmed;
              }
            }
          }
          
          let report_reply = null;
          if (l.report_reply) {
            if (typeof l.report_reply === 'string') {
              const trimmed = l.report_reply.trim();
              if (trimmed.length > 0) {
                report_reply = trimmed;
              }
            }
          }
          
          return {
            ...l,
            report,
            report_reply,
          };
        });

        // Nếu số lượng tăng lên thì báo có học viên mới
        if (prevCount.current && newLearners.length > prevCount.current) {
          alert(englishText("🎉 Bạn có 1 học viên mới được gán vào!"));
        }

        setLearners(newLearners);
        prevCount.current = newLearners.length;
      } catch (err) {
        if(!signal.aborted)setLoadError("Không thể tải danh sách học viên. Vui lòng thử lại.");
      } finally {
        if(!signal.aborted)setLoading(false);
      }
    }
    fetchLearners();
    return()=>{controller.abort();progressRequest.current++;};
  }, [userId,loadAttempt]);


  // mở modal ghi chú
  const openNoteModal = (learner) => {
    if(noteBusy.current)return;
    setNoteError('');
    setSelectedLearner(learner);
    setNoteInput(learner.note || "");
    setShowNoteModal(true);
  };

  const saveNote = async () => {
    if(noteBusy.current||!selectedLearner)return;
    const learnerId=selectedLearner.learner_id;
    noteBusy.current=true;setNoteSaving(true);setNoteError('');
    try {
      const res=await api.put(`/mentors/learners/${learnerId}/note`,{note:noteInput},{timeout:15000});
      const updated=res.data?.learner;
      if(String(updated?.id)!==String(learnerId)||typeof updated.note!=='string')throw Error('Invalid saved note');
      setLearners(prev=>prev.map(row=>row.learner_id===learnerId?{...row,note:updated.note}:row));
      setShowNoteModal(false);
    }catch(error){setNoteError(error.response?.data?.message||'Chưa xác nhận được ghi chú đã lưu. Hãy kiểm tra trước khi thử lại.');}
    finally{noteBusy.current=false;setNoteSaving(false);}
  };

  const openProgressModal = async (learner) => {
    const requestId = ++progressRequest.current;
    setSelectedLearner(learner);
    setProgress(null);
    setProgressError("");
    setShowProgressModal(true);
    setLoadingProgress(true);
    try {
      const res = await api.get(`/mentors/learners/${learner.learner_id}/progress`);
      if (requestId !== progressRequest.current) return;
      setProgress(res.data);
    } catch (err) {
      if (requestId !== progressRequest.current) return;
      setProgressError(err?.response?.data?.message || err?.response?.data?.error || "Không thể tải tiến độ học viên.");
    } finally {
      if (requestId === progressRequest.current) setLoadingProgress(false);
    }
  };

  useEffect(()=>{
    if(loading||loadError)return;
    if(!requestedLearner){handledLink.current=null;setLinkError('');return;}
    if(handledLink.current===requestedLearner)return;
    handledLink.current=requestedLearner;
    const selected=/^[1-9]\d*$/.test(requestedLearner)&&Number.isSafeInteger(Number(requestedLearner))
      ? learners.find(row=>String(row.learner_id)===requestedLearner):null;
    if(!selected){setLinkError('Học viên trong liên kết không còn thuộc nhóm được gán.');return;}
    setLinkError('');openProgressModal(selected);
  },[loading,loadError,learners,requestedLearner]);

  // mở modal report
  const openReportModal = async (learner) => {
    setSelectedLearner(learner);
    // Reset form - luôn bắt đầu với form trống
    setReportInput("");
    setReportImage(null);
    setReportVideo(null);
    setShowReportModal(true);
    
    // Check 24h constraint
    if (learner.user_id) {
      setCheckingReport(true);
      try {
        const reporterId = auth?.user?._id || auth?.user?.id || auth?.user?.user_id;
        const res = await api.get("/admin/reports/can-report", {
          params: { reporter_id: reporterId, target_id: learner.user_id }
        });
        setReportStatus(res.data);
      } catch (err) {
        console.error("❌ Error checking report status:", err);
        setReportStatus({ canReport: true, hoursRemaining: 0 });
      } finally {
        setCheckingReport(false);
      }
    }
  };

  const saveReport = async () => {
    if (!reportInput.trim()) {
      alert(englishText("Vui lòng nhập nội dung report"));
      return;
    }

    if (!reportStatus.canReport) {
      alert(`Bạn chỉ có thể report lại sau 24 giờ. Còn ${reportStatus.hoursRemaining} giờ nữa.`);
      return;
    }

    try {
      const reporterId = auth?.user?._id || auth?.user?.id || auth?.user?.user_id;
      const targetId = selectedLearner?.user_id;

      const formData = new FormData();
      formData.append("reporter_id", reporterId);
      formData.append("target_id", targetId);
      formData.append("content", reportInput);
      formData.append("status", "pending");
      if (reportImage) formData.append("image", reportImage);
      if (reportVideo) formData.append("video", reportVideo);

      const res = await api.post("/mentors/reports", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      // Reload learners để lấy dữ liệu mới nhất từ backend
      if (mentorId) {
        try {
          const learnersRes = await api.get(`/mentors/${mentorId}/learners`);
          const newLearners = learnersRes.data.learners.map(l => {
            const report = (l.report && typeof l.report === 'string' && l.report.trim().length > 0) ? l.report : null;
            const report_reply = (l.report_reply && typeof l.report_reply === 'string' && l.report_reply.trim().length > 0) ? l.report_reply : null;
            return {
              ...l,
              report,
              report_reply,
            };
          });
          setLearners(newLearners);
        } catch (reloadErr) {
          console.error("❌ Error reloading learners:", reloadErr);
          // Fallback: update manually
          setLearners(prev =>
            prev.map(l =>
              l.learner_id === selectedLearner.learner_id
                ? { 
                    ...l, 
                    report: res.data?.report?.content || reportInput,
                    report_status: res.data?.report?.status || "pending"
                  }
                : l
            )
          );
        }
      }
      
      alert(englishText("Report đã được gửi thành công!"));
      setShowReportModal(false);
      setReportInput("");
      setReportImage(null);
      setReportVideo(null);
      // Reset reportStatus sau khi gửi thành công
      setReportStatus({ canReport: false, hoursRemaining: 24 });
    } catch (err) {
      console.error("❌ Error saving report:", err);
      // Xử lý lỗi 24h constraint từ backend
      if (err?.response?.data?.canReport === false) {
        setReportStatus({
          canReport: false,
          hoursRemaining: err.response.data.hoursRemaining || 24
        });
        alert(`Bạn chỉ có thể report lại sau 24 giờ. Còn ${err.response.data.hoursRemaining || 24} giờ nữa.`);
      } else {
        alert(err?.response?.data?.message || err?.response?.data?.error || englishText("Gửi report thất bại"));
      }
    }
  };

  if (loading) return <p><UiText text={"Đang tải danh sách học viên..."} /></p>;
  if(loadError)return <><p role="alert"><UiText>{loadError}</UiText></p><button onClick={()=>setLoadAttempt(value=>value+1)}><UiText text={"Thử tải lại"} /></button></>;
  if (!learners.length) return <><p><UiText text={"Chưa có học viên nào"} /></p>{linkError&&<p role="alert"><UiText>{linkError}</UiText></p>}</>;
  return (
    <div className="mentor-learners">
      {linkError&&<p role="alert"><UiText>{linkError}</UiText></p>}
      <h3><UiText text={"Danh sách học viên"} /></h3>
      <table className="learners-table">
        <thead>
          <tr>
            <th><UiText text={"STT"} /></th>
            <th><UiText text={"Họ và tên"} /></th>
            <th><UiText text={"Email"} /></th>
            <th><UiText text={"Số điện thoại"} /></th>
            <th><UiText text={"Ngày sinh"} /></th>
            <th><UiText text={"Tình trạng gói"} /></th>
            <th><UiText text={"Ghi chú"} /></th>
            <th><UiText text={"Tiến độ"} /></th>
            <th><UiText text={"Report"} /></th>
            <th><UiText text={"Thông báo"} /></th>
          </tr>
        </thead>
        <tbody>
          {learners.map((l, index) => (
            <tr key={l.learner_id}>
              <td><UiText>{index + 1}</UiText></td>
              <td>{l.learner_name}</td>
              <td>{l.email}</td>
              <td>{l.phone}</td>
              <td><UiText>{l.dob ? new Date(l.dob).toLocaleDateString('en-GB') : "—"}</UiText></td>
              <td>
                {(() => {
                  if (!l.purchase_id) return "Chưa có";
                  if (l.package_is_active === false && l.status !== "expired") return "Không còn hiệu lực";
                  if (l.status === "expired") return "Hết hạn";
                  if (l.days_left === null || l.days_left === undefined) return "Đang xử lý";
                  if (l.days_left > 0) return "Còn hạn";
                  return "Hết hạn";
                })()}
              </td>
              <td
                className="note-cell"
                style={{ whiteSpace: "pre-line" }}
                onClick={() => openNoteModal(l)}
              >
                {l.note || <span className="placeholder"><UiText text={"Nhấn để ghi chú"} /></span>}
              </td>
              <td>
                <button className="btn-ghost" onClick={() => openProgressModal(l)}>{" "}<UiText text={"Xem tiến độ"} />{" "}</button>
              </td>
              <td>
                {(() => {
                  const hasReport = l.report !== null && l.report !== undefined && String(l.report).trim().length > 0;
                  const isDismissed = l.report_status === "dismissed";
                  
                  // Nếu có report và status là dismissed, hiển thị "Gửi lại Report"
                  if (hasReport && isDismissed) {
                    return (
                      <button
                        className="report-btn"
                        onClick={() => openReportModal(l)}
                      >{" "}<UiText text={"Gửi lại Report"} />{" "}</button>
                    );
                  } else {
                    // Luôn hiển thị nút Report (cho cả trường hợp chưa có report hoặc đã có report nhưng không phải dismissed)
                    return (
                      <button
                        className="report-btn"
                        onClick={() => openReportModal(l)}
                      >{" "}<UiText text={"Report"} />{" "}</button>
                    );
                  }
                })()}
              </td>
              <td>
                {(() => {
                  const hasReport = l.report !== null && l.report !== undefined && String(l.report).trim().length > 0;
                  
                  if (hasReport) {
                    const statusText = l.report_status === "resolved" ? "Đã xử lý" : l.report_status === "dismissed" ? "Từ chối" : "Đang chờ";
                    const statusColor = l.report_status === "resolved" ? "#10b981" : l.report_status === "dismissed" ? "#ef4444" : "#f59e0b";
                    
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ fontSize: "12px", color: statusColor }}>
                          <strong><UiText>{statusText}</UiText></strong>
                        </div>
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            setSelectedLearner(l);
                            setShowDetailModal(true);
                          }}
                          style={{ fontSize: "12px", padding: "4px 8px" }}
                        >{" "}<UiText text={"Xem chi tiết"} />{" "}</button>
                      </div>
                    );
                  } else {
                    return <span className="placeholder" style={{ fontSize: "12px" }}><UiText text={"Chưa có report"} /></span>;
                  }
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal ghi chú */}
      {showNoteModal && (
        <Modal
          title={`Ghi chú cho ${selectedLearner.learner_name}`}
          onClose={() => setShowNoteModal(false)}
        >
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            rows="5"
            style={{ width: "100%" }}
            placeholder={englishText("Nhập ghi chú...")}
          />
          {noteError&&<p role="alert"><UiText>{noteError}</UiText></p>}
          <div className="modal-actions">
            <button className="btn-save" disabled={noteSaving} onClick={saveNote}><UiText>{noteSaving?'Đang lưu…':'Lưu'}</UiText></button>
            <button className="btn-cancel" disabled={noteSaving} onClick={() => setShowNoteModal(false)}><UiText text={"Hủy"} /></button>
          </div>
        </Modal>
      )}

      {showProgressModal && selectedLearner && (
        <Modal
          title={englishText(`Tiến độ - ${selectedLearner.learner_name}`)}
          onClose={() => {
            progressRequest.current += 1;
            setShowProgressModal(false);
          }}
        >
          {loadingProgress && <p><UiText text={"Đang tải tiến độ..."} /></p>}
          {progressError && <p className="error-message"><UiText>{progressError}</UiText></p>}
          {progress && (
            <div className="learner-progress-summary">
              <p><strong><UiText text={"Challenges:"} /></strong> <UiText>{progress.challenges.completed}</UiText>/<UiText>{progress.challenges.total}</UiText>{" "}<UiText text={"hoàn thành;"} />{" "}<UiText>{progress.challenges.pending_submissions}</UiText>{" "}<UiText text={"bài đang chờ xử lý."} /></p>
              <p><strong><UiText text={"Phản hồi mentor:"} /></strong> <UiText>{progress.challenges.feedback_count}</UiText>{" "}<UiText text={"lượt."} /></p>
              <p><strong><UiText text={"Luyện nói:"} /></strong> <UiText>{progress.speaking_practice.completed_sessions}</UiText>/<UiText>{progress.speaking_practice.total_sessions}</UiText>{" "}<UiText text={"phiên hoàn thành."} /></p>
              <p><strong><UiText text={"Story:"} /></strong> <UiText>{progress.story?.practiced_sessions ?? '—'}</UiText>{" "}<UiText text={"phiên có lượt trả lời đã lưu."} /></p>
              <p><strong><UiText text={"Scenario Studio:"} /></strong> <UiText>{progress.scenario_world?.completed_sessions ?? '—'}</UiText>{" "}<UiText text={"phiên hoàn tất qua lựa chọn."} /></p>
              <p><strong><UiText text={"Phản hồi gần đây:"} /></strong></p>
              {progress.recent_feedback.length ? (
                <ul>
                  {progress.recent_feedback.map(item => (
                    <li key={item.challenge_id}>
                      {item.title} — <UiText>{item.has_feedback ? "có nhận xét" : "đã chấm"}</UiText>
                    </li>
                  ))}
                </ul>
              ) : <p><UiText text={"Chưa có phản hồi nào."} /></p>}
              <p className="placeholder"><UiText text={"Chưa có điểm tổng hợp đáng tin cậy để hiển thị."} /></p>
            </div>
          )}
        </Modal>
      )}

      {/* Modal report */}
      {showReportModal && (
        <Modal
          title={englishText(`Report học viên ${selectedLearner.learner_name}`)}
          onClose={() => setShowReportModal(false)}
        >
          {/* Hiển thị thông tin report đã gửi (nếu có) */}
          {selectedLearner.report && (
            <div style={{ marginBottom: 20, padding: 12, background: "#f9fafb", borderRadius: 6 }}>
              <p><strong><UiText text={"Nội dung report đã gửi:"} /></strong></p>
              <p style={{ whiteSpace: "pre-line", marginBottom: 12 }}><UiText>{selectedLearner.report}</UiText></p>

              {selectedLearner.report_reply && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
                  <p><strong><UiText text={"Thông báo từ admin:"} /></strong></p>
                  <p style={{ whiteSpace: "pre-line" }}><UiText>{selectedLearner.report_reply}</UiText></p>
                </div>
              )}
            </div>
          )}

          {/* Form report - luôn hiển thị */}
          <div>
            <p><strong><UiText>{selectedLearner.report ? "Gửi lại report:" : "Gửi report:"}</UiText></strong></p>
            
            {checkingReport ? (
              <p><UiText text={"Đang kiểm tra..."} /></p>
            ) : !reportStatus.canReport ? (
              <div style={{ padding: 12, background: "#fef3c7", borderRadius: 6, marginBottom: 12 }}>
                <strong><UiText text={"⚠️ Bạn chỉ có thể report lại sau 24 giờ."} /></strong>
                <p><UiText text={"Còn"} />{" "}<UiText>{reportStatus.hoursRemaining}</UiText>{" "}<UiText text={"giờ nữa."} /></p>
              </div>
            ) : null}
            
            <textarea
              value={reportInput}
              onChange={(e) => setReportInput(e.target.value)}
              rows="5"
              style={{ width: "100%", marginBottom: 12 }}
              placeholder={englishText(selectedLearner.report ? "Nhập lý do báo cáo bổ sung..." : "Nhập lý do báo cáo...")}
              disabled={!reportStatus.canReport}
            />
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4 }}><UiText text={"Hình ảnh (tùy chọn):"} /></label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setReportImage(e.target.files[0] || null)}
                disabled={!reportStatus.canReport}
              />
              {reportImage && (
                <div style={{ marginTop: 8 }}>
                  <img src={URL.createObjectURL(reportImage)} alt="Preview" style={{ maxWidth: "200px", maxHeight: "200px" }} />
                  <button onClick={() => setReportImage(null)} style={{ marginLeft: 8 }}><UiText text={"Xóa"} /></button>
                </div>
              )}
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4 }}><UiText text={"Video (tùy chọn):"} /></label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setReportVideo(e.target.files[0] || null)}
                disabled={!reportStatus.canReport}
              />
              {reportVideo && (
                <div style={{ marginTop: 8 }}>
                  <video src={URL.createObjectURL(reportVideo)} controls style={{ maxWidth: "300px", maxHeight: "200px" }} />
                  <button onClick={() => setReportVideo(null)} style={{ marginLeft: 8 }}><UiText text={"Xóa"} /></button>
                </div>
              )}
            </div>
            
            <div className="modal-actions">
              <button className="btn-save" onClick={saveReport} disabled={!reportStatus.canReport}>
                <UiText>{selectedLearner.report ? "Gửi lại Report" : "Gửi Report"}</UiText>
              </button>
              <button className="btn-cancel" onClick={() => setShowReportModal(false)}><UiText text={"Hủy"} /></button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal xem chi tiết report */}
      {showDetailModal && selectedLearner && (
        <Modal
          title={englishText(`Thông báo - ${selectedLearner.learner_name}`)}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedLearner(null);
          }}
        >
          {(() => {
            const hasReport = selectedLearner.report !== null && selectedLearner.report !== undefined && String(selectedLearner.report).trim().length > 0;
            
            if (!hasReport) {
              return <p><UiText text={"Chưa có report"} /></p>;
            }

            const statusText = selectedLearner.report_status === "resolved" ? "Đã xử lý" : selectedLearner.report_status === "dismissed" ? "Từ chối" : "Đang chờ";
            const statusColor = selectedLearner.report_status === "resolved" ? "#10b981" : selectedLearner.report_status === "dismissed" ? "#ef4444" : "#f59e0b";

            return (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <p><strong><UiText text={"Nội dung report:"} /></strong></p>
                  <div style={{ marginTop: 8, padding: 12, background: "#f9fafb", borderRadius: 6, whiteSpace: "pre-line" }}>
                    <UiText>{selectedLearner.report}</UiText>
                  </div>
                </div>

                {selectedLearner.report_reply && (
                  <div style={{ marginBottom: 20 }}>
                    <p><strong><UiText text={"Phản hồi admin:"} /></strong></p>
                    <div className="admin-reply" style={{ marginTop: 8, padding: 12, background: "#eff6ff", borderRadius: 6, borderLeft: "4px solid #3b82f6" }}>
                      <p style={{ whiteSpace: "pre-line", margin: 0 }}><UiText>{selectedLearner.report_reply}</UiText></p>
                    </div>
                  </div>
                )}

                <div>
                  <p><strong><UiText text={"Trạng thái:"} /></strong></p>
                  <div style={{ marginTop: 8, fontSize: "14px", color: statusColor }}>
                    <strong><UiText>{statusText}</UiText></strong>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
