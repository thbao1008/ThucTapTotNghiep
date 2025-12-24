import React, { useEffect, useState } from "react";
import api from "../../api.js";
import Modal from "../common/Modal.jsx";
import AssignedLearnersModal from "../common/AssignedLearnersModal.jsx";
import { getAuth } from "../../utils/auth.js";
import "../../styles/user-for-page.css";

export default function UserForPage({ userId, onClose, onStatusChange }) {
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
    const fetchUser = async () => {
      try {
        const res = await api.get(`/admin/users/${userId}`);
        const u = res.data.user || res.data;
        setUser(u);

        if (u.role?.toUpperCase() === "LEARNER") {
          const learnerId = u.learner_id;
          if (learnerId) {
            const purchaseRes = await api.get(`/learners/${learnerId}/latest-purchase`);
            setLatestPurchase(purchaseRes.data.purchase || null);
            
            // Load total rating (average from practice + challenges)
            try {
              const ratingRes = await api.get(`/learners/${learnerId}/progress-analytics`);
              if (ratingRes.data?.overall?.average_score) {
                setLearnerTotalRating(ratingRes.data.overall.average_score);
              }
            } catch (err) {
              // Use rating from user object if available
              if (u.learner_average_score) {
                setLearnerTotalRating(u.learner_average_score);
              }
            }
          }
        }
        
        // Load bio for mentor
        if (u.role?.toUpperCase() === "MENTOR") {
          try {
            const mentorRes = await api.get(`/mentors/by-user/${userId}`);
            const mentorData = mentorRes.data;
            if (mentorData?.bio) {
              setMentorBio(mentorData.bio);
            }
          } catch (err) {
            console.error("Error loading mentor bio:", err);
          }
        }
      } catch (err) {
        if (err.response?.status === 403 || err.response?.status === 404) {
          try {
            // Try to get mentor by userId
            const res = await api.get(`/mentors/by-user/${userId}`);
            const mentor = res.data.mentor || res.data;
            if (mentor) {
              setUser({
                ...mentor,
                role: "MENTOR",
                user_id: mentor.user_id || userId,
                id: mentor.user_id || userId,
                name: mentor.name,
                email: mentor.email,
                phone: mentor.phone,
                dob: mentor.dob,
                status: mentor.status,
                mentor_rating: mentor.rating
              });
              if (mentor.bio) {
                setMentorBio(mentor.bio);
              }
            }
          } catch (e2) {
            console.error("❌ Fallback load mentor error:", e2);
          }
        } else {
          console.error("❌ Lỗi load user:", err);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
    loadBanHistory();
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

  const handleConfirmBan = async () => {
    if (!banReason.trim()) {
      alert("Vui lòng nhập lý do ban");
      return;
    }
    
    try {
      const res = await api.put(`/admin/users/${userId}/status`, { 
        status: "banned",
        ban_reason: banReason.trim()
      });
      if (res.data?.user) {
        const updated = res.data.user;
        setUser(updated);
        setShowBanModal(false);
        setBanReason("");
        // Reload ban history
        loadBanHistory();
        if (onStatusChange) onStatusChange(updated);
      }
    } catch (err) {
      console.error("❌ Lỗi ban user:", err);
      alert(err?.response?.data?.message || "Có lỗi xảy ra khi ban user");
    }
  };

  const handleConfirmUnban = async () => {
    if (!unbanReason.trim()) {
      alert("Vui lòng nhập lý do mở ban");
      return;
    }
    
    try {
      const res = await api.put(`/admin/users/${userId}/status`, { 
        status: "active",
        unban_reason: unbanReason.trim()
      });
      if (res.data?.user) {
        const updated = res.data.user;
        setUser(updated);
        setShowUnbanModal(false);
        setUnbanReason("");
        // Reload ban history
        loadBanHistory();
        // Reload user để lấy ban_reason mới (null khi unban)
        const userRes = await api.get(`/admin/users/${userId}`);
        const u = userRes.data.user || userRes.data;
        setUser(u);
        if (onStatusChange) onStatusChange(updated);
      }
    } catch (err) {
      console.error("❌ Lỗi unban user:", err);
      alert(err?.response?.data?.message || "Có lỗi xảy ra khi mở ban user");
    }
  };

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

  if (loading) return <p>Đang tải...</p>;
  if (!user) return <p>Không tìm thấy người dùng.</p>;

  const isMentor = user.role?.toUpperCase() === "MENTOR";

  return (
    <Modal title="Thông tin người dùng" onClose={onClose} className="user-for-page-modal">
      <div className="user-for-page-content">
        <div className="user-for-page-main">
          <div className="user-for-page-info">
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label">Tên:</span>
              <span className="user-for-page-info-value">{user.name}</span>
            </div>
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label">Email:</span>
              <span className="user-for-page-info-value">{user.email}</span>
            </div>
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label">SĐT:</span>
              <span className="user-for-page-info-value">{user.phone || "-"}</span>
            </div>
            <div className="user-for-page-info-item">
              <span className="user-for-page-info-label">Ngày sinh:</span>
              <span className="user-for-page-info-value">
                {user.dob ? new Date(user.dob).toLocaleDateString("vi-VN") : "-"}
              </span>
            </div>
            {!isMentor && (
              <div className="user-for-page-info-item">
                <span className="user-for-page-info-label">Vai trò:</span>
                <span className="user-for-page-info-value">{user.role}</span>
              </div>
            )}
            {isMentor && (
              <div className="user-for-page-info-item user-for-page-bio">
                <span className="user-for-page-info-label">Giới thiệu:</span>
                {mentorBio ? (
                  <span className="user-for-page-info-value user-for-page-bio-text">{mentorBio}</span>
                ) : (
                  <span className="user-for-page-info-value user-for-page-bio-empty">Chưa được cập nhật</span>
                )}
              </div>
            )}
          </div>

          {/* Rating Section */}
          {user.role?.toUpperCase() === "LEARNER" && learnerTotalRating !== null && (
            <div className="user-for-page-section">
              <h4>Điểm đánh giá tổng</h4>
              <div className="user-for-page-rating-box">
                <div className="user-for-page-rating-value">
                  {parseFloat(learnerTotalRating).toFixed(1)}/100
                </div>
                <div className="user-for-page-rating-label">
                  Điểm trung bình từ luyện nói và challenge
                </div>
              </div>
            </div>
          )}
          
          {user.role?.toUpperCase() === "MENTOR" && user.mentor_rating !== null && user.mentor_rating !== undefined && (
            <div className="user-for-page-section">
              <h4>Điểm đánh giá</h4>
              <div className="user-for-page-rating-box">
                <div className="user-for-page-rating-value">
                  {parseFloat(user.mentor_rating).toFixed(1)}/10
                </div>
                <div className="user-for-page-rating-label">
                  Điểm đánh giá từ học viên
                </div>
              </div>
            </div>
          )}

          {user.role?.toUpperCase() === "LEARNER" && (
            <>
              <div className="user-for-page-section">
                <h4>Gói học đã đăng ký</h4>
                {latestPurchase ? (
                  <>
                    <div className="user-for-page-package-info">
                      <p>
                        <strong>Tên gói:</strong> {latestPurchase.package_name || "Không rõ"}{" "}
                        <span className={`user-for-page-package-status ${
                          user.status === "banned" 
                            ? "paused" 
                            : (latestPurchase.expiry_date && new Date(latestPurchase.expiry_date) > new Date())
                            ? "active" 
                            : "expired"
                        }`}>
                          {user.status === "banned"
                            ? "Tạm ngưng"
                            : (latestPurchase.expiry_date && new Date(latestPurchase.expiry_date) > new Date())
                            ? "Còn hạn"
                            : "Hết hạn"}
                        </span>
                      </p>
                      {latestPurchase.created_at && (
                        <span className="user-for-page-small">
                          Ngày mua: {new Date(latestPurchase.created_at).toLocaleDateString("vi-VN")}
                        </span>
                      )}
                      {latestPurchase.expiry_date && (
                        <span className="user-for-page-small">
                          {" "}– Hết hạn: {new Date(latestPurchase.expiry_date).toLocaleDateString("vi-VN")}
                        </span>
                      )}
                    </div>
                    <button
                      className="user-for-page-btn user-for-page-btn-primary"
                      onClick={() => window.location.href = `/admin/purchases/${user.learner_id}`}
                    >
                      Xem chi tiết gói học
                    </button>
                  </>
                ) : (
                  <p className="user-for-page-muted">Chưa có gói học nào</p>
                )}
              </div>

              <div className="user-for-page-section">
                <h4>Được hướng dẫn bởi giảng viên</h4>
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
                  <p className="user-for-page-muted">Chưa được gán giảng viên</p>
                )}
                {isAdmin && user.mentor_name && (
                  <button
                    className="user-for-page-btn user-for-page-btn-secondary"
                    onClick={async () => {
                      if (!user.learner_id) return;
                      if (!window.confirm("Bạn có chắc chắn muốn đổi mentor? Mentor cũ sẽ được thêm vào danh sách blocklist và hệ thống sẽ tự động gán mentor mới.")) {
                        return;
                      }
                      try {
                        const res = await api.post("/admin/users/learners/change-mentor", {
                          learnerId: user.learner_id,
                        });
                        if (res.data.success) {
                          alert(res.data.message);
                          // Refresh user data
                          const userRes = await api.get(`/admin/users/${userId}`);
                          const u = userRes.data.user || userRes.data;
                          setUser(u);
                          if (onStatusChange) onStatusChange();
                        }
                      } catch (err) {
                        console.error("Lỗi đổi mentor:", err);
                        alert("Có lỗi xảy ra khi đổi mentor");
                      }
                    }}
                    style={{ marginTop: "8px", width: "100%" }}
                  >
                    Đổi mentor
                  </button>
                )}
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
                >
                  Xem tiến độ học tập
                </button>
              </div>
            </>
          )}

          {isMentor && isAdmin && (
            <div className="user-for-page-actions">
              <button 
                className="user-for-page-btn user-for-page-btn-secondary" 
                onClick={() => setShowAssigned(true)}
              >
                Danh sách học viên được bổ nhiệm
              </button>
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
                onClick={handleBanClick}
                className="user-for-page-btn user-for-page-btn-danger"
                style={{ marginTop: "16px", width: "100%" }}
              >
                {user.status === "active" ? "Ban user" : "Unban user"}
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
                  <strong style={{ color: "#dc2626" }}>Lý do ban:</strong>
                  <p style={{ margin: "8px 0 0 0", color: "#991b1b" }}>{user.ban_reason}</p>
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
                  <strong style={{ color: "#374151" }}>Lịch sử ban/unban:</strong>
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
                          {record.action === 'banned' ? '🚫 Bị ban' : '✅ Mở ban'}
                        </div>
                        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                          {new Date(record.created_at).toLocaleString('vi-VN')}
                        </div>
                        {record.reason && (
                          <div style={{ marginTop: "4px", color: "#374151" }}>
                            <strong>Lý do:</strong> {record.reason}
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
            <p style={{ marginBottom: "16px", color: "#374151" }}>
              Vui lòng nhập lý do ban cho user <strong>{user?.name}</strong>:
            </p>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Nhập lý do ban..."
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
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmBan}
                style={{
                  padding: "10px 20px",
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Xác nhận ban
              </button>
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
            <p style={{ marginBottom: "16px", color: "#374151" }}>
              Vui lòng nhập lý do mở ban cho user <strong>{user?.name}</strong>:
            </p>
            <textarea
              value={unbanReason}
              onChange={(e) => setUnbanReason(e.target.value)}
              placeholder="Nhập lý do mở ban..."
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
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmUnban}
                style={{
                  padding: "10px 20px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Xác nhận mở ban
              </button>
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
