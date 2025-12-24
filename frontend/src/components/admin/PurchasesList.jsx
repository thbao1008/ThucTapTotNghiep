import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiUser, FiPhone, FiCalendar, FiClock, FiDollarSign, FiBook, FiBarChart, FiCheck, FiRefreshCw, FiEye, FiAlertTriangle, FiSearch, FiMail } from "react-icons/fi";
import api from "../../api";
import "../../styles/admin-purchase.css";

export default function PurchasesList({ learnerId }) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchPhone, setSearchPhone] = useState("");
  const navigate = useNavigate();

  // Load purchases ban đầu
  useEffect(() => {
    const fetchPurchases = async () => {
      try {
        let res;
        if (learnerId) {
          // Route đúng: /admin/purchases/:learnerId
          res = await api.get(`/admin/purchases/${learnerId}`);
        } else {
          res = await api.get("/admin/purchases");
        }
        setPurchases(res.data.purchases || []);
      } catch (err) {
        console.error("❌ Lỗi khi load purchases:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPurchases();
  }, [learnerId]);

  // Tự động tìm kiếm khi nhập (debounce)
  useEffect(() => {
    if (learnerId) return; // Không search nếu có learnerId

    const timeoutId = setTimeout(async () => {
      try {
        let res;
        if (searchPhone.trim()) {
          // Tìm kiếm với phone
          res = await api.get(`/admin/purchases?phone=${encodeURIComponent(searchPhone.trim())}`);
        } else {
          // Nếu xóa hết thì load lại tất cả
          res = await api.get("/admin/purchases");
        }
        setPurchases(res.data.purchases || []);
      } catch (err) {
        console.error("❌ Lỗi tìm kiếm:", err);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeoutId);
  }, [searchPhone, learnerId]);

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
            <h1 className="page-title">📚 Quản lý Gói Học</h1>
            <p className="page-subtitle">
              Theo dõi và quản lý tất cả các gói học đã được đăng ký
            </p>
          </div>
          {!learnerId && (
            <div className="header-stats">
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <span className="stat-number">{purchases.length}</span>
                  <span className="stat-label">Tổng gói</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {!learnerId && (
          <div className="search-section">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                placeholder="Tìm kiếm theo số điện thoại..."
                className="search-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="purchase-content">
        {purchases.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon"><FiMail /></div>
            <h3>Không có gói học nào</h3>
            <p>Chưa có học viên nào đăng ký gói học</p>
          </div>
        ) : (
          <div className="purchase-grid">
            {purchases.map((p, idx) => (
              <div key={p.purchase_id} className="purchase-card">
                <div className="card-header">
                  <div className="card-index">#{idx + 1}</div>
                  <div className={`card-status ${
                    p.days_left > 0
                      ? "status-active"
                      : p.status === "paused"
                        ? "status-paused"
                        : "status-expired"
                  }`}>
                    {p.days_left > 0
                      ? "Còn hạn"
                      : p.status === "paused"
                        ? "Tạm ngưng"
                        : "Hết hạn"}
                  </div>
                </div>

                <div className="card-content">
                  <div className="package-info">
                    <h3 className="package-name">{p.package_name || "Chưa có gói"}</h3>
                    <div className="learner-info">
                      <span className="learner-name"><FiUser style={{ marginRight: '4px' }} />{p.learner_name}</span>
                      <span className="learner-phone"><FiPhone style={{ marginRight: '4px' }} />{p.phone}</span>
                    </div>
                  </div>

                  <div className="purchase-details">
                    <div className="detail-row">
                      <span className="detail-label">Ngày mua:</span>
                      <span className="detail-value">
                        {p.created_at
                          ? new Date(p.created_at).toLocaleDateString("vi-VN")
                          : "-"}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Còn lại:</span>
                      <span className={`detail-value ${
                        p.days_left > 0
                          ? "days-active"
                          : p.status === "paused"
                            ? "days-paused"
                            : "days-expired"
                      }`}>
                        {p.status === "paused" ? "-" : `${p.days_left || 0} ngày`}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Giá:</span>
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

                <div className="card-actions">
                  <button
                    className="btn-view-card"
                    onClick={() =>
                      navigate(`/admin/purchases/${p.learner_id}`)
                    }
                  >
                    <span className="btn-icon"><FiEye /></span>
                    Xem chi tiết
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
