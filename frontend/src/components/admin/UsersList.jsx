import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api.js";
import UserForPage from "./UserForPage.jsx";
import {
  FiUser, FiMail, FiLock, FiPhone, FiCalendar, FiPackage,
  FiTrash2, FiPlus, FiLoader, FiAlertTriangle, FiCheckCircle
} from "react-icons/fi";
import PurchasesList from "./PurchasesList.jsx";
import Modal from "../common/Modal.jsx";
import thumucIcon from "../../assets/icons/thumuc.png";
import usersIcon from "../../assets/icons/users.png";
import useExistenceCheck from "../../hooks/useExistenceCheck.js";
import "../../styles/admin-users.css";

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ADMIN");
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [selectedUser, setSelectedUser] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [packageId, setPackageId] = useState("");

  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const emailCheck = useExistenceCheck("email", email);
  const phoneCheck = useExistenceCheck("phone", phone);

  const navigate = useNavigate();
  const [latestPurchase, setLatestPurchase] = useState(null);

  // Helpers
  function capitalizeWords(str) {
    return (str || "")
      .toLowerCase()
      .split(" ")
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  function validateEmail(v) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(String(v).toLowerCase());
  }
  function sanitizePhone(input) {
    return (input || "").replace(/\D/g, "");
  }
  function validateVNPhone(digits) {
    return /^0\d{9}$/.test(digits);
  }

  function getAvatar(user) {
    if (user.avatarUrl) return user.avatarUrl;
    const role = (user.role || "").toUpperCase();
    if (role === "LEARNER") return thumucIcon;
    if (role === "MENTOR") return usersIcon;
    return "/default-avatar.png";
  }

  function getRemainingDays(user) {
    if (!user.package_start || !user.package_duration_days) return "-";
    const start = new Date(user.package_start);
    const end = new Date(start);
    end.setDate(start.getDate() + user.package_duration_days);
    const now = new Date();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }

  // Load users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get("/admin/users");
        console.log("👥 Users từ API:", res.data);
        setUsers(res.data.users || []);
      } catch (err) {
        console.error("❌ Lỗi khi load users:", err);
      }
    };
    fetchUsers();
  }, []);

  // Load packages (public)
  useEffect(() => {
  const fetchPackages = async () => {
    try {
      setPackagesLoading(true);
      setPackagesError("");
      const res = await api.get("/admin/packages/public");
      console.log("📦 Packages từ API:", res.data);

      const data = res.data;
      const list = Array.isArray(data) ? data : (data.packages || []);
      setPackages(list);
    } catch (err) {
      console.error("❌ Lỗi khi load packages:", err);
      setPackages([]);
      setPackagesError("Không thể tải danh sách gói học");
    } finally {
      setPackagesLoading(false);
    }
  };
  fetchPackages();
}, []);

  // Load latest purchase khi chọn learner
  useEffect(() => {
    if (selectedUser && selectedUser.role?.toUpperCase() === "LEARNER") {
      const learnerId = selectedUser.learner_id;
      if (!learnerId) return;

      api.get(`/learners/${learnerId}/latest-purchase`)
        .then(res => {
          setLatestPurchase(res.data.purchase || null);
        })
        .catch(err => {
          console.error("❌ Lỗi load latest purchase:", err);
          setLatestPurchase(null);
        });
    }
  }, [selectedUser]);

  const filtered = users.filter((u) => {
    const roleUpper = (u.role || "").toUpperCase();
    const matchesRole = roleUpper === roleFilter;
    const q = search.toLowerCase().trim();
    if (!q) return matchesRole;
    const matchesSearch =
      ((u.name || "").toLowerCase().includes(q)) ||
      ((u.email || "").toLowerCase().includes(q)) ||
      ((u.phone || "").toLowerCase().includes(q));
    return matchesRole && matchesSearch;
  });
  const start = (page - 1) * perPage;
  const paginated = filtered.slice(start, start + perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const deleteUser = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa user này?")) return;
    try {
      const res = await api.delete(`/admin/users/${id}`);
      if (res.data?.success || res.status === 204) {
        setUsers((prev) => prev.filter((u) => u.id !== id));
      }
    } catch (err) {
      console.error("❌ Lỗi xóa user:", err);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const next = currentStatus === "active" ? "banned" : "active";
    try {
      const res = await api.patch(`/admin/users/${id}/status`, { status: next });
      if (res.data?.user) {
        setUsers((prev) => prev.filter(Boolean).map((u) => (u && u.id === id ? res.data.user : u)));
      } else {
        setUsers((prev) => prev.filter(Boolean).map((u) => (u && u.id === id ? { ...u, status: next } : u)));
      }
    } catch (err) {
      console.error("❌ Lỗi cập nhật trạng thái:", err);
    }
  };

  const resetForm = () => {
    setName(""); setEmail(""); setPassword("");
    setPhone(""); setDob(""); setPackageId("");
    setEmailError(""); setPhoneError("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const emailOk = validateEmail(email);
    const phoneDigits = sanitizePhone(phone);
    const phoneOk = phone === "" || validateVNPhone(phoneDigits);
    if (!name.trim()) { setEmailError(""); setPhoneError(""); alert("Tên không được để trống"); return; }
    if (password.length < 6) { alert("Mật khẩu phải có ít nhất 6 ký tự"); return; }
    if (!emailOk) { setEmailError("Email không đúng định dạng"); return; }
    if (!phoneOk) { setPhoneError("SĐT phải 10 số, bắt đầu bằng 0"); return; }
    if (roleFilter === "LEARNER" && !packageId) { alert("Vui lòng chọn gói học"); return; }

    try {
      const payload = {
        name: capitalizeWords(name),
        email: email.toLowerCase(),
        password,
        phone: phone ? phoneDigits : "",
        dob,
        role: roleFilter,
        packageId: roleFilter === "LEARNER" ? (packageId || null) : null,
      };
      const res = await api.post("/admin/users", payload);
      const created = res.data.user || res.data;
      setUsers((prev) => [...prev, created]);
      setShowCreate(false);
      resetForm();
    } catch (err) {
      console.error("❌ Lỗi tạo user:", err);
    }
  };

  return (
    <>
      <div className="panel users-list">
        <div className="users-list-header">
          <h2>Danh sách Người dùng</h2>
          <select
            className="input filter-select header-filter"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="ADMIN">Admin</option>
            <option value="MENTOR">Mentor</option>
            <option value="LEARNER">Learner</option>
          </select>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <input
            type="text"
            className="input search-input"
            placeholder="Tìm theo tên, email hoặc số điện thoại..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />

          {roleFilter === "MENTOR" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <FiPlus /> Thêm Mentor
            </button>
          )}

          {roleFilter === "LEARNER" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                // đảm bảo đúng role trước khi mở modal
                setRoleFilter("LEARNER");
                setShowCreate(true);
              }}
            >
              <FiPlus /> Thêm Learner
            </button>
          )}
        </div>

        {/* Table */}
        <table className="table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên</th>
              <th>Số điện thoại</th>
              <th>Email</th>
              <th>Vai trò</th>
              {roleFilter === "LEARNER" && <th>Tình trạng gói</th>}
              <th>Tình trạng</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan="7">Không tìm thấy người dùng nào.</td></tr>
            ) : (
              paginated.map((user, index) => (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{start + index + 1}</td>
                  <td>{capitalizeWords(user.name)}</td>
                  <td>{user.phone || "-"}</td>
                  <td>{user.email}</td>
                  <td>{capitalizeWords(user.role)}</td>

                  {roleFilter === "LEARNER" && (
                    <td>
                      {user.status === "banned"
                        ? "Tạm ngưng"
                        : user.expiry_date
                          ? (new Date(user.expiry_date) > new Date() ? "Còn hạn" : "Hết hạn")
                          : "-"}
                    </td>
                  )}

                  <td>
                    {user.status === "active" ? "Active" : "Banned"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="pagination">
          <button
            className="page-btn btn btn-secondary btn-small"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </button>
          <span>Trang {page} / {totalPages}</span>
          <button
            className="page-btn btn btn-secondary btn-small"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      </div>

      {/* Modal hiển thị thông tin user */}
      {selectedUser && (
        <UserForPage
          userId={selectedUser.id}
          onClose={() => setSelectedUser(null)}
          onStatusChange={(updatedUser) => {
            if (!updatedUser || !updatedUser.id) return;
            setUsers(prev => prev.filter(Boolean).map(u => u && u.id === updatedUser.id ? updatedUser : u));
            setSelectedUser(updatedUser);
          }}
        />
      )}

      {/* Modal tạo user */}
      {showCreate && (
        <Modal title={`Tạo ${roleFilter}`} onClose={() => setShowCreate(false)}>
          <form className="create-user-form" onSubmit={handleCreate}>
            <div className="form-grid">
              {/* Họ và tên */}
              <div className="form-group">
                <label>Họ và tên</label>
                <div className="input-with-icon">
                  <FiUser className="icon" />
                  <input
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="form-group">
                <label>Email</label>
                <div className="input-with-icon">
                  <FiMail className="icon" />
                  <input
                    type="email"
                    placeholder="email@domain.com"
                    value={email}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEmail(v);
                      if (v === "") setEmailError("Email không được để trống");
                      else if (!validateEmail(v)) setEmailError("Email không đúng định dạng");
                      else setEmailError("");
                    }}
                    required
                  />
                </div>
                {emailError && <span className="input-error row"><FiAlertTriangle /> {emailError}</span>}
                {!emailError && emailCheck.loading && <span className="muted row"><FiLoader /> Đang kiểm tra...</span>}
                {!emailError && emailCheck.valid === false && <span className="input-error row"><FiAlertTriangle /> {emailCheck.message}</span>}
                {!emailError && emailCheck.valid === true && <span className="row" style={{ color: "#166534", fontSize: 12 }}><FiCheckCircle /> {emailCheck.message}</span>}
              </div>

              {/* Mật khẩu */}
              <div className="form-group">
                <label>Mật khẩu</label>
                <div className="input-with-icon">
                  <FiLock className="icon" />
                  <input
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Số điện thoại */}
              <div className="form-group">
                <label>Số điện thoại</label>
                <div className="input-with-icon">
                  <FiPhone className="icon" />
                  <input
                    type="tel"
                    placeholder="Ví dụ: 0901234567"
                    value={phone}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const digits = sanitizePhone(raw);
                      setPhone(raw);
                      if (raw === "") setPhoneError("");
                      else if (!validateVNPhone(digits)) setPhoneError("SĐT phải 10 số, bắt đầu bằng 0");
                      else setPhoneError("");
                    }}
                    inputMode="numeric"
                    pattern="0[0-9]{9}"
                  />
                </div>
                {phoneError && <span className="input-error row"><FiAlertTriangle /> {phoneError}</span>}
                {phone && !phoneError && phoneCheck.loading && <span className="muted row"><FiLoader /> Đang kiểm tra...</span>}
                {phone && !phoneError && phoneCheck.valid === false && <span className="input-error row"><FiAlertTriangle /> {phoneCheck.message}</span>}
                {phone && !phoneError && phoneCheck.valid === true && <span className="row" style={{ color: "#166534", fontSize: 12 }}><FiCheckCircle /> {phoneCheck.message}</span>}
              </div>

              {/* Ngày sinh */}
              <div className="form-group">
                <label>Ngày sinh</label>
                <div className="input-with-icon">
                  <FiCalendar className="icon" />
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </div>
              </div>

              {/* Gói học cho Learner */}
              {roleFilter === "LEARNER" && (
  <div className="form-group">
    <label>Gói học</label>
    <div className="input-with-icon">
      <FiPackage className="icon" />
      {packagesLoading ? (
        <div className="row muted"><FiLoader /> Đang tải danh sách gói...</div>
      ) : packagesError ? (
        <span className="input-error row"><FiAlertTriangle /> {packagesError}</span>
      ) : packages.length > 0 ? (
        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
        >
          <option value="">-- Chọn gói học --</option>
          {packages.map(pkg => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name} ({pkg.duration_days} ngày)
            </option>
          ))}
        </select>
      ) : (
        <span className="muted">Không có gói học khả dụng</span>
      )}
    </div>
  </div>
)}
            
            </div>

            {/* Nút hành động */}
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowCreate(false); resetForm(); }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
              >
                Tạo {roleFilter === "MENTOR" ? "Mentor" : "Learner"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
