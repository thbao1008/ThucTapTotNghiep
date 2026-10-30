import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import MentorAssignment from "./MentorAssignment.jsx";
import React, { useEffect, useState, useRef } from "react";
import api from "../../api.js";
import Modal from "../common/Modal.jsx";
import AssignedLearnersModal from "../common/AssignedLearnersModal.jsx";
import { getAuth } from "../../utils/auth.js";
import "../../styles/user-for-page.css";

export default function UserForPage(props) {
  if(getAuth()?.user?.role?.toLowerCase()!=='admin')return <Modal title={englishText('Thông tin người dùng')} onClose={props.onClose}><p role="alert"><UiText>Không có quyền admin</UiText></p></Modal>;
  return <AdminUserProfile key={props.userId} {...props}/>;
}

function AdminUserProfile({ userId, onClose, onStatusChange }) {
  const [user, setUser] = useState(null);
  const [latestPurchase, setLatestPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAssigned, setShowAssigned] = useState(false);
  const [showMentorInfo, setShowMentorInfo] = useState(false);
  const [learnerTotalRating, setLearnerTotalRating] = useState(null);
  const [mentorBio, setMentorBio] = useState("");
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [showUnbanModal, setShowUnbanModal] = useState(false);
  const [unbanReason, setUnbanReason] = useState("");
  const [banHistory, setBanHistory] = useState([]);

  const auth = getAuth();
  const isAdmin = auth?.user?.role?.toUpperCase() === "ADMIN";

  useEffect(() => {
    let current=true;
    setLoading(true);setUser(null);setLatestPurchase(null);setLearnerTotalRating(null);setMentorBio('');
    api.get(`/admin/users/${userId}`).then(res=>{
      if(!current)return;
      const u=res.data.user;setUser(u);setMentorBio(u.mentor_bio||'');
      if(u.package_name)setLatestPurchase({package_name:u.package_name,expiry_date:u.expiry_date,status:u.package_status,is_active:u.package_is_active});
    }).catch(()=>{}).finally(()=>{if(current)setLoading(false);});
    loadBanHistory();
    return ()=>{current=false;};
  }, [userId]);

  const handleBanClick = () => {
    if (user.status === "active") {
      // Hiển thị modal nhập lý do ban
      setShowBanModal(true);
      setBanReason("");
    } else {
      // Hiển thị modal nhập lý do unban
      setShowUnbanModal(true);
      setUnbanReason("");
    }
  };

  const statusPending = useRef(false);
  const [statusBusy,setStatusBusy] = useState(false);
  const [statusError,setStatusError] = useState('');
  const [statusUncertain,setStatusUncertain] = useState(false);
  async function refreshStatus() {
    if(statusPending.current)return;
    statusPending.current=true;setStatusBusy(true);
    try{const {data}=await api.get(`/admin/users/${userId}`,{timeout:12000});if(!data?.user)throw Error('Invalid profile');setUser(data.user);setStatusUncertain(false);setStatusError('');setShowBanModal(false);setShowUnbanModal(false);await loadBanHistory();onStatusChange?.(data.user);}
    catch{setStatusError('Không thể tải lại hồ sơ. Vui lòng thử lại.');}
    finally{statusPending.current=false;setStatusBusy(false);}
  }
  async function changeStatus(status,reason) {
    if(statusPending.current||statusUncertain)return;
    if(!reason.trim()){setStatusError('Vui lòng nhập lý do');return;}
    statusPending.current=true;setStatusBusy(true);setStatusError('');
    try{
      const {data}=await api.put(`/admin/users/${userId}/status`,{status,...(status==='banned'?{ban_reason:reason.trim()}:{unban_reason:reason.trim()})},{timeout:20000});
      if(data?.user?.status!==status)throw Error('Unconfirmed status');
      setUser(current=>({...current,...data.user}));setShowBanModal(false);setShowUnbanModal(false);setBanReason('');setUnbanReason('');await loadBanHistory();onStatusChange?.(data.user);
    }catch(error){
      const uncertain=!error.response||error.response.status>=500;
      setStatusUncertain(uncertain);
      setStatusError(uncertain?'Chưa xác nhận được kết quả. Hãy tải lại hồ sơ trước khi thử lại.':error.response?.data?.message||'Không thể cập nhật trạng thái.');
    }finally{statusPending.current=false;setStatusBusy(false);}
  }
  const handleConfirmBan=()=>changeStatus('banned',banReason);
  const handleConfirmUnban=()=>changeStatus('active',unbanReason);
  const loadBanHistory = async () => {
    try {
      const res = await api.get(`/admin/users/${userId}/ban-history`);
      if (res.data?.history) {
        setBanHistory(res.data.history);
      }
    } catch (err) {
      console.error("❌ Lỗi load ban history:", err);
    }
  };

  if (loading) return <p><UiText text={"Đang tải..."} /></p>;
  if (!user) return <p><UiText text={"Không tìm thấy người dùng."} /></p>;

  const isMentor = user.role?.toUpperCase() === "MENTOR";

  return (
    <Modal title={englishText("Thông tin người dùng")} onClose={onClose} className="user-for-page-modal">
      <div className="user-for-page-content">
        <div className="user-for-page-main">
          <div className="user-for-page-info">
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label"><UiText text={"Tên:"} /></span>
              <span className="user-for-page-info-value">{user.name}</span>
            </div>
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label"><UiText text={"Email:"} /></span>
              <span className="user-for-page-info-value">{user.email}</span>
            </div>
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label"><UiText text={"SĐT:"} /></span>
              <span className="user-for-page-info-value">{user.phone || "-"}</span>
            </div>
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label"><UiText text={"Ngày sinh:"} /></span>
              <span className="user-for-page-info-value">
                <UiText>{user.dob ? new Date(user.dob).toLocaleDateString('en-GB') : "-"}</UiText>
              </span>
            </div>
            {!isMentor && (
              <div className="user-for-page-info-item">
                <span className="user-for-page-info-label"><UiText text={"Vai trò:"} /></span>
                <span className="user-for-page-info-value"><UiText>{user.role}</UiText></span>
              </div>
            )}
            {isMentor && (
              <div className="user-for-page-info-item user-for-page-bio">
                <span className="user-for-page-info-label"><UiText text={"Giới thiệu:"} /></span>
                {mentorBio ? (
                  <span className="user-for-page-info-value user-for-page-bio-text"><UiText>{mentorBio}</UiText></span>
                ) : (
                  <span className="user-for-page-info-value user-for-page-bio-empty"><UiText text={"Chưa được cập nhật"} /></span>
                )}
              </div>
            )}
          </div>

          {/* Rating Section */}
          {user.role?.toUpperCase() === "LEARNER" && learnerTotalRating !== null && (
            <div className="user-for-page-section">
              <h4><UiText text={"Điểm đánh giá tổng"} /></h4>
              <div className="user-for-page-rating-box">
                <div className="user-for-page-rating-value">
                  <UiText>{parseFloat(learnerTotalRating).toFixed(1)}</UiText>/100
                </div>
                <div className="user-for-page-rating-label">{" "}<UiText text={"Điểm trung bình từ luyện nói và challenge"} />{" "}</div>
              </div>
            </div>
          )}
          
          {user.role?.toUpperCase() === "MENTOR" && user.mentor_rating !== null && user.mentor_rating !== undefined && (
            <div className="user-for-page-section">
              <h4><UiText text={"Điểm đánh giá"} /></h4>
              <div className="user-for-page-rating-box">
                <div className="user-for-page-rating-value">
                  <UiText>{parseFloat(user.mentor_rating).toFixed(1)}</UiText>/10
                </div>
                <div className="user-for-page-rating-label">{" "}<UiText text={"Điểm đánh giá từ học viên"} />{" "}</div>
              </div>
            </div>
          )}

          {user.role?.toUpperCase() === "LEARNER" && (
            <>
              <div className="user-for-page-section">
                <h4><UiText text={"Gói học đã đăng ký"} /></h4>
                {latestPurchase ? (
                  <>
                    <div className="user-for-page-package-info">
                      <p>
                        <strong><UiText text={"Tên gói:"} /></strong> <UiText>{latestPurchase.package_name || "Không rõ"}</UiText>{" "}
                        <span className={`user-for-page-package-status ${
                          user.status === "banned" 
                            ? "paused" 
                            : latestPurchase.is_active
                            ? "active" 
                            : "expired"
                        }`}>
                          <UiText>{user.status === "banned"
                            ? "Tài khoản bị khóa · thời hạn gói vẫn tính"
                            : latestPurchase.is_active
                            ? "Còn hạn"
                            : "Hết hạn"}</UiText>
                        </span>
                      </p>
                      {latestPurchase.created_at && (
                        <span className="user-for-page-small">{" "}<UiText text={"Ngày mua:"} />{" "}<UiText>{new Date(latestPurchase.created_at).toLocaleDateString('en-GB')}</UiText>
                        </span>
                      )}
                      {latestPurchase.expiry_date && (
                        <span className="user-for-page-small">
                          {" "}<UiText text={"– Hết hạn:"} />{" "}<UiText>{new Date(latestPurchase.expiry_date).toLocaleDateString('en-GB')}</UiText>
                        </span>
                      )}
                    </div>
                    <button
                      className="user-for-page-btn user-for-page-btn-primary"
                      onClick={() => window.location.href = `/admin/purchases/${user.learner_id}`}
                    >{" "}<UiText text={"Xem chi tiết gói học"} />{" "}</button>
                  </>
                ) : (
                  <p className="user-for-page-muted"><UiText text={"Chưa có gói học nào"} /></p>
                )}
              </div>

              <div className="user-for-page-section">
                <h4><UiText text={"Mentor hỗ trợ"} /></h4>
                {user.mentor_name ? (
                  <p>
                    <span
                      className="user-for-page-mentor-link"
                      onClick={() => setShowMentorInfo(true)}
                    >
                      {user.mentor_name}
                    </span>
                  </p>
                ) : (
                  <p className="user-for-page-muted"><UiText text={"Chưa được gán Mentor"} /></p>
                )}
                {isAdmin && <MentorAssignment key={user.learner_id} learnerId={user.learner_id} onChanged={async()=>{
                  const res=await api.get(`/admin/users/${userId}`);setUser(res.data.user);onStatusChange?.();
                }}/>}

              </div>

              <div className="user-for-page-section">
                <button
                  className="user-for-page-btn user-for-page-btn-primary"
                  onClick={() => {
                    if (user.learner_id) {
                      // Mở ReportsPage với filter learnerId
                      window.location.href = `/admin/reports?learnerId=${user.learner_id}`;
                    }
                  }}
                  style={{ width: "100%" }}
                >{" "}<UiText text={"Xem tiến độ học tập"} />{" "}</button>
              </div>
            </>
          )}

          {isMentor && isAdmin && (
            <div className="user-for-page-actions">
              <button 
                className="user-for-page-btn user-for-page-btn-secondary" 
                onClick={() => setShowAssigned(true)}
              >{" "}<UiText text={"Danh sách học viên được bổ nhiệm"} />{" "}</button>
            </div>
          )}
        </div>

        <div className="user-for-page-avatar-section">
          <div className="user-for-page-avatar">
            <img
              src={user.avatar_url || user.avatarUrl || user.avatar || "/default-avatar.png"}
              alt="Avatar"
              onError={(e) => {
                e.target.src = "/default-avatar.png";
              }}
            />
          </div>
          
          {isAdmin && (
            <>
              <button
                disabled={statusBusy||statusUncertain} onClick={handleBanClick}
                className="user-for-page-btn user-for-page-btn-danger"
                style={{ marginTop: "16px", width: "100%" }}
              >
                <UiText>{user.status === "active" ? "Ban user" : "Unban user"}</UiText>
              </button>

              {/* Hiển thị lý do ban nếu user bị banned */}
              {user.status === "banned" && user.ban_reason && (
                <div style={{ 
                  marginTop: "16px", 
                  padding: "12px", 
                  background: "#fef2f2", 
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  fontSize: "14px"
                }}>
                  <strong style={{ color: "#dc2626" }}><UiText text={"Lý do ban:"} /></strong>
                  <p style={{ margin: "8px 0 0 0", color: "#991b1b" }}><UiText>{user.ban_reason}</UiText></p>
                </div>
              )}

              {/* Hiển thị lịch sử ban/unban */}
              {banHistory.length > 0 && (
                <div style={{ 
                  marginTop: "16px", 
                  padding: "12px", 
                  background: "#f9fafb", 
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "13px"
                }}>
                  <strong style={{ color: "#374151" }}><UiText text={"Lịch sử ban/unban:"} /></strong>
                  <div style={{ marginTop: "8px", maxHeight: "200px", overflowY: "auto" }}>
                    {banHistory.map((record, idx) => (
                      <div key={idx} style={{ 
                        marginBottom: "8px", 
                        padding: "8px", 
                        background: "white",
                        borderRadius: "4px",
                        borderLeft: `3px solid ${record.action === 'banned' ? '#ef4444' : '#10b981'}`
                      }}>
                        <div style={{ fontWeight: "600", color: record.action === 'banned' ? '#dc2626' : '#059669' }}>
                          <UiText>{record.action === 'banned' ? '🚫 Bị ban' : '✅ Mở ban'}</UiText>
                        </div>
                        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                          <UiText>{new Date(record.created_at).toLocaleString('en-GB')}</UiText>
                        </div>
                        {record.reason && (
                          <div style={{ marginTop: "4px", color: "#374151" }}>
                            <strong><UiText text={"Lý do:"} /></strong> <UiText>{record.reason}</UiText>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal nhập lý do ban */}
      {showBanModal && (
        <Modal 
          title="Ban User" 
          onClose={() => {
            setShowBanModal(false);
            setBanReason("");
          }}
        >
          <div style={{ padding: "20px" }}>
            <p style={{ marginBottom: "16px", color: "#374151" }}>{" "}<UiText text={"Vui lòng nhập lý do ban cho user"} />{" "}<strong>{user?.name}</strong>:
            </p>
            {statusError && <p role="alert"><UiText>{statusError}</UiText></p>}
            {statusUncertain && <button disabled={statusBusy} onClick={refreshStatus}><UiText text="Tải lại hồ sơ" /></button>}
            {statusBusy && <p role="status"><UiText text="Đang xử lý..." /></p>}
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={englishText("Nhập lý do ban...")}
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical"
              }}
            />
            <div style={{ marginTop: "20px", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setBanReason("");
                }}
                style={{
                  padding: "10px 20px",
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >{" "}<UiText text={"Hủy"} />{" "}</button>
              <button
                disabled={statusBusy||statusUncertain} onClick={handleConfirmBan}
                style={{
                  padding: "10px 20px",
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >{" "}<UiText text={"Xác nhận ban"} />{" "}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal nhập lý do unban */}
      {showUnbanModal && (
        <Modal 
          title="Unban User" 
          onClose={() => {
            setShowUnbanModal(false);
            setUnbanReason("");
          }}
        >
          <div style={{ padding: "20px" }}>
            <p style={{ marginBottom: "16px", color: "#374151" }}>{" "}<UiText text={"Vui lòng nhập lý do mở ban cho user"} />{" "}<strong>{user?.name}</strong>:
            </p>
            {statusError && <p role="alert"><UiText>{statusError}</UiText></p>}
            {statusUncertain && <button disabled={statusBusy} onClick={refreshStatus}><UiText text="Tải lại hồ sơ" /></button>}
            {statusBusy && <p role="status"><UiText text="Đang xử lý..." /></p>}
            <textarea
              value={unbanReason}
              onChange={(e) => setUnbanReason(e.target.value)}
              placeholder={englishText("Nhập lý do mở ban...")}
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical"
              }}
            />
            <div style={{ marginTop: "20px", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowUnbanModal(false);
                  setUnbanReason("");
                }}
                style={{
                  padding: "10px 20px",
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >{" "}<UiText text={"Hủy"} />{" "}</button>
              <button
                disabled={statusBusy||statusUncertain} onClick={handleConfirmUnban}
                style={{
                  padding: "10px 20px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >{" "}<UiText text={"Xác nhận mở ban"} />{" "}</button>
            </div>
          </div>
        </Modal>
      )}

      {showAssigned && (
        <AssignedLearnersModal mentorId={user.id} onClose={() => setShowAssigned(false)} />
      )}

      {showMentorInfo && (
        <UserForPage
          userId={user.mentor_user_id ?? user.mentor_id}
          onClose={() => setShowMentorInfo(false)}
        />
      )}
    </Modal>
  );
}
