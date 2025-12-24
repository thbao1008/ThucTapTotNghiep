import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { FiUser, FiPhone, FiCalendar, FiClock, FiDollarSign, FiBook, FiBarChart, FiCheck, FiRefreshCw, FiEye, FiAlertTriangle, FiSearch, FiPackage, FiPlay, FiPause, FiX } from "react-icons/fi";
import api from "../../api";
import "../../styles/admin-purchase.css";

export default function PurchasesPage() {
  const { id } = useParams(); // Route param từ /admin/learners/:id/purchases
  const [searchParams] = useSearchParams(); // Query param từ /admin/purchases?learnerId=...
  const learnerId = id || searchParams.get("learnerId"); // Ưu tiên route param, fallback query param
  
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChangePackageModal, setShowChangePackageModal] = useState(false);
  const [packages, setPackages] = useState([]);
  const [selectedPackageId, setSelectedPackageId] = useState(null);

  useEffect(() => {
    const fetchPurchases = async () => {
      if (!learnerId) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get(`/admin/purchases/${learnerId}`);
        setPurchases(res.data.purchases || []);
      } catch (err) {
        console.error("❌ Lỗi khi load purchases:", err);
        if (err.response?.status === 404) {
          console.error("❌ Route không tồn tại hoặc learnerId không hợp lệ:", learnerId);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPurchases();
  }, [learnerId]);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const res = await api.get("/admin/packages/public");
        setPackages(Array.isArray(res.data) ? res.data : (res.data.packages || []));
      } catch (err) {
        console.error("❌ Lỗi khi load packages:", err);
      }
    };
    fetchPackages();
  }, []);


  const handleRenew = async (purchaseId) => {
    try {
      const res = await api.patch(`/admin/purchases/${purchaseId}/renew`);
      if (res.data.success) {
        alert(res.data.message || "Gia hạn thành công");
        // Refresh purchases
        const refreshRes = await api.get(`/admin/purchases/${learnerId}`);
        setPurchases(refreshRes.data.purchases || []);
      }
    } catch (err) {
      console.error("❌ Lỗi gia hạn:", err);
      alert("Có lỗi xảy ra khi gia hạn");
    }
  };

  const handleChangePackage = async () => {
    if (!selectedPackageId) {
      alert("Vui lòng chọn gói học");
      return;
    }
    try {
      const res = await api.post("/admin/purchases/change-package", {
        learnerId: learnerId,
        newPackageId: selectedPackageId,
      });
      if (res.data.success) {
        alert(res.data.message || "Đổi gói thành công");
        setShowChangePackageModal(false);
        setSelectedPackageId(null);
        // Refresh purchases
        const refreshRes = await api.get(`/admin/purchases/${learnerId}`);
        setPurchases(refreshRes.data.purchases || []);
      }
    } catch (err) {
      console.error("❌ Lỗi đổi gói:", err);
      alert("Có lỗi xảy ra khi đổi gói");
    }
  };

  if (loading) return <p>Đang tải dữ liệu...</p>;

  const learnerName = purchases.length > 0 ? purchases[0].learner_name : `Learner #${learnerId}`;

  // Tìm gói gần nhất vừa hết (gói đầu tiên có status expired và days_left <= 0)
  // QUAN TRỌNG: Dùng purchase_status từ bảng purchases, không phải package_status
  const latestExpiredPurchase = purchases.find(
    (p) => p.purchase_status === "expired" && (p.days_left === null || p.days_left <= 0)
  );

  // Kiểm tra xem có gói nào đang active không
  const hasActivePackage = purchases.some((p) => p.purchase_status === "active" && (p.days_left === null || p.days_left > 0));

  if (loading) {
    return (
      <div className="admin-purchase">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-purchase">
      {/* Header Section */}
      <div className="purchase-header-section">
        <div className="header-content">
          <div className="header-text">
            <h1 className="page-title"><FiBarChart style={{ marginRight: '8px' }} />Lịch sử Gói Học</h1>
            <p className="page-subtitle">
              Quản lý tất cả các gói học của {learnerName}
            </p>
          </div>
          <div className="header-stats">
            <div className="stat-card">
              <div className="stat-icon"><FiPackage /></div>
              <div className="stat-info">
                <span className="stat-number">{purchases.length}</span>
                <span className="stat-label">Tổng gói</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><FiCheck /></div>
              <div className="stat-info">
                <span className="stat-number">
                  {purchases.filter(p => p.days_left > 0).length}
                </span>
                <span className="stat-label">Đang active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="page-actions">
          <button
            className="btn-change-package-modern"
            onClick={() => setShowChangePackageModal(true)}
            disabled={hasActivePackage}
          >
            <span className="btn-icon">🔄</span>
            Đổi gói học
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div className="purchase-content">
        {purchases.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon">📭</div>
            <h3>Không có gói học nào</h3>
            <p>Học viên này chưa đăng ký gói học nào</p>
          </div>
        ) : (
          <div className="purchase-timeline">
            {purchases.map((p, idx) => {
              const isLatestExpired = latestExpiredPurchase && p.purchase_id === latestExpiredPurchase.purchase_id;
              const canRenew = isLatestExpired && !hasActivePackage;
              const canChangePackage = !hasActivePackage;

              return (
                <div key={p.purchase_id || p.id} className="timeline-item">
                  <div className="timeline-marker">
                    <div className={`timeline-dot ${
                      p.days_left > 0
                        ? "status-active"
                        : p.purchase_status === "paused"
                          ? "status-paused"
                          : "status-expired"
                    }`}></div>
                    {idx < purchases.length - 1 && <div className="timeline-line"></div>}
                  </div>

                  <div className="timeline-content">
                    <div className="purchase-card-detailed">
                      <div className="card-header-detailed">
                        <div className="package-title-section">
                          <h3 className="package-title">{p.package_name || "Chưa có gói"}</h3>
                          <div className={`package-status ${
                            p.days_left > 0
                              ? "status-active"
                              : p.purchase_status === "paused"
                                ? "status-paused"
                                : "status-expired"
                          }`}>
                            {p.days_left > 0 && "Còn hạn"}
                            {p.days_left <= 0 && p.purchase_status !== "paused" && "Hết hạn"}
                            {p.purchase_status === "paused" && "Tạm ngưng"}
                            {!p.purchase_status || p.purchase_status === null && "Chưa có gói"}
                          </div>
                        </div>

                        {isLatestExpired && (
                          <div className="expired-badge">
                            <span className="expired-icon"><FiAlertTriangle /></span>
                            Gói gần nhất đã hết hạn
                          </div>
                        )}
                      </div>

                      <div className="card-details-grid">
                        <div className="detail-item">
                          <span className="detail-icon"><FiCalendar /></span>
                          <div className="detail-content">
                            <span className="detail-label">Ngày tạo</span>
                            <span className="detail-value">
                              {p.created_at
                                ? new Date(p.created_at).toLocaleDateString("vi-VN")
                                : "1/1/1970"}
                            </span>
                          </div>
                        </div>

                        <div className="detail-item">
                          <span className="detail-icon"><FiClock /></span>
                          <div className="detail-content">
                            <span className="detail-label">Còn lại</span>
                            <span className={`detail-value ${
                              p.days_left > 0
                                ? "days-active"
                                : p.purchase_status === "paused"
                                  ? "days-paused"
                                  : "days-expired"
                            }`}>
                              {p.days_left !== null && p.days_left !== undefined
                                ? `${p.days_left} ngày`
                                : "0 ngày"}
                            </span>
                          </div>
                        </div>

                        <div className="detail-item">
                          <span className="detail-icon"><FiDollarSign /></span>
                          <div className="detail-content">
                            <span className="detail-label">Giá</span>
                            <span className="detail-value price">
                              {p.price
                                ? p.price.toLocaleString("vi-VN", {
                                    style: "currency",
                                    currency: "VND",
                                  })
                                : "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="card-actions-detailed">
                        {canRenew && (
                          <button
                            className="btn-renew-modern"
                            onClick={() => handleRenew(p.purchase_id || p.id)}
                          >
                            <span className="btn-icon"><FiRefreshCw /></span>
                            Gia hạn
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal đổi gói */}
      {showChangePackageModal && (
        <div className="package-modal" onClick={() => setShowChangePackageModal(false)}>
          <div
            className="package-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="package-modal-header">
              <h3>Chọn gói học mới</h3>
              <button
                className="package-modal-close"
                onClick={() => setShowChangePackageModal(false)}
              >
                <FiX />
              </button>
            </div>
            <div className="package-list">
              {packages.length === 0 ? (
                <p>Không có gói học nào</p>
              ) : (
                packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`package-item ${
                      selectedPackageId === pkg.id ? "selected" : ""
                    }`}
                    onClick={() => setSelectedPackageId(pkg.id)}
                  >
                    <div className="package-item-name">{pkg.name}</div>
                    <div className="package-item-details">
                      <span>Thời hạn: {pkg.duration_days} ngày</span>
                      <span>
                        Giá: {pkg.price?.toLocaleString("vi-VN") || 0} VNĐ
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="package-modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setShowChangePackageModal(false)}
              >
                Hủy
              </button>
              <button
                className="btn-confirm"
                onClick={handleChangePackage}
                disabled={!selectedPackageId}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
