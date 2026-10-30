import { UiOption } from '../../i18n/UiLanguage.jsx';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
﻿import React, { useEffect, useState, useRef } from "react";
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
  const [createError,setCreateError]=useState(''),[creating,setCreating]=useState(false);
  const createPendingRef=useRef(false);
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
    if (!window.confirm(englishText("Bạn có chắc muốn xóa user này?"))) return;
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
    if(createPendingRef.current)return;setCreateError('');
    const emailOk = validateEmail(email);
    const phoneDigits = sanitizePhone(phone);
    const phoneOk = phone === "" || validateVNPhone(phoneDigits);
    if (!name.trim()) { setEmailError(""); setPhoneError(""); alert(englishText("Tên không được để trống")); return; }
    if (password.length < 8) { setCreateError('Mật khẩu cần ít nhất 8 ký tự'); return; }
    if (!emailOk) { setEmailError("Email không đúng định dạng"); return; }
    if (!phoneOk) { setPhoneError("SĐT phải 10 số, bắt đầu bằng 0"); return; }
    if (roleFilter === "LEARNER" && !packageId) { alert(englishText("Vui lòng chọn gói học")); return; }

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
      createPendingRef.current=true;setCreating(true);
      const res = await api.post("/admin/users", payload);
      const created = res.data.user || res.data;
      setUsers((prev) => [...prev, created]);
      setShowCreate(false);
      resetForm();
    } catch (err) {
      setCreateError(err.response?.data?.message||'Chưa xác nhận được kết quả. Hãy tải lại danh sách trước khi tạo lại.');
    } finally {
      createPendingRef.current=false;setCreating(false);
    }
  };

  return (
    <>
      <div className="panel users-list">
        <div className="users-list-header">
          <h2><UiText text={"Danh sách Người dùng"} /></h2>
          <select
            className="input filter-select header-filter"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <UiOption value="ADMIN">{"Admin"}</UiOption>
            <UiOption value="MENTOR">{"Mentor"}</UiOption>
            <UiOption value="LEARNER">{"Learner"}</UiOption>
          </select>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <input
            type="text"
            className="input search-input"
            placeholder={englishText("Tìm theo tên, email hoặc số điện thoại...")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />

          {roleFilter === "MENTOR" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <FiPlus />{" "}<UiText text={"Thêm Mentor"} />{" "}</button>
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
              <FiPlus />{" "}<UiText text={"Thêm Learner"} />{" "}</button>
          )}
        </div>

        {/* Table */}
        <table className="table">
          <thead>
            <tr>
              <th><UiText text={"STT"} /></th>
              <th><UiText text={"Tên"} /></th>
              <th><UiText text={"Số điện thoại"} /></th>
              <th><UiText text={"Email"} /></th>
              <th><UiText text={"Vai trò"} /></th>
              {roleFilter === "LEARNER" && <th><UiText text={"Tình trạng gói"} /></th>}
              <th><UiText text={"Tình trạng"} /></th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan="7"><UiText text={"Không tìm thấy người dùng nào."} /></td></tr>
            ) : (
              paginated.map((user, index) => (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  style={{ cursor: "pointer" }}
                >
                  <td><UiText>{start + index + 1}</UiText></td>
                  <td>{capitalizeWords(user.name)}</td>
                  <td>{user.phone || "-"}</td>
                  <td>{user.email}</td>
                  <td><UiText>{capitalizeWords(user.role)}</UiText></td>

                  {roleFilter === "LEARNER" && (
                    <td>
                      <UiText>{user.status === "banned"
                        ? "Tài khoản bị khóa (gói vẫn tính giờ)"
                        : user.expiry_date
                          ? (user.package_is_active ? "Còn hạn" : new Date(user.expiry_date) <= new Date() ? "Hết hạn" : "Không khả dụng")
                          : "-"}</UiText>
                    </td>
                  )}

                  <td>
                    <UiText>{user.status === "active" ? "Active" : "Banned"}</UiText>
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
          <span><UiText text={"Trang"} />{" "}<UiText>{page}</UiText> / <UiText>{totalPages}</UiText></span>
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
        <Modal title={englishText(roleFilter === 'MENTOR' ? 'Thêm Mentor' : 'Thêm Learner')} onClose={() => setShowCreate(false)}>
          <form className="create-user-form" onSubmit={handleCreate}>
            {createError&&<p role="alert"><UiText>{createError}</UiText></p>}
            <div className="form-grid">
              {/* Họ và tên */}
              <div className="form-group">
                <label><UiText text={"Họ và tên"} /></label>
                <div className="input-with-icon">
                  <FiUser className="icon" />
                  <input
                    type="text"
                    placeholder={englishText("Ví dụ: Nguyễn Văn A")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="form-group">
                <label><UiText text={"Email"} /></label>
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
                {emailError && <span className="input-error row"><FiAlertTriangle /> <UiText>{emailError}</UiText></span>}
                {!emailError && emailCheck.loading && <span className="muted row"><FiLoader />{" "}<UiText text={"Đang kiểm tra..."} /></span>}
                {!emailError && emailCheck.valid === false && <span className="input-error row"><FiAlertTriangle /> {emailCheck.message}</span>}
                {!emailError && emailCheck.valid === true && <span className="row" style={{ color: "#166534", fontSize: 12 }}><FiCheckCircle /> {emailCheck.message}</span>}
              </div>

              {/* Mật khẩu */}
              <div className="form-group">
                <label><UiText text={"Mật khẩu"} /></label>
                <div className="input-with-icon">
                  <FiLock className="icon" />
                  <input
                    type="password"
                    minLength={8} placeholder={englishText("Tối thiểu 8 ký tự")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Số điện thoại */}
              <div className="form-group">
                <label><UiText text={"Số điện thoại"} /></label>
                <div className="input-with-icon">
                  <FiPhone className="icon" />
                  <input
                    type="tel"
                    placeholder={englishText("Ví dụ: 0901234567")}
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
                {phoneError && <span className="input-error row"><FiAlertTriangle /> <UiText>{phoneError}</UiText></span>}
                {phone && !phoneError && phoneCheck.loading && <span className="muted row"><FiLoader />{" "}<UiText text={"Đang kiểm tra..."} /></span>}
                {phone && !phoneError && phoneCheck.valid === false && <span className="input-error row"><FiAlertTriangle /> {phoneCheck.message}</span>}
                {phone && !phoneError && phoneCheck.valid === true && <span className="row" style={{ color: "#166534", fontSize: 12 }}><FiCheckCircle /> {phoneCheck.message}</span>}
              </div>

              {/* Ngày sinh */}
              <div className="form-group">
                <label><UiText text={"Ngày sinh"} /></label>
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
    <label><UiText text={"Gói học"} /></label>
    <div className="input-with-icon">
      <FiPackage className="icon" />
      {packagesLoading ? (
        <div className="row muted"><FiLoader />{" "}<UiText text={"Đang tải danh sách gói..."} /></div>
      ) : packagesError ? (
        <span className="input-error row"><FiAlertTriangle /> <UiText>{packagesError}</UiText></span>
      ) : packages.length > 0 ? (
        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
        >
          <UiOption value="">{"-- Chọn gói học --"}</UiOption>
          {packages.map(pkg => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name} ({englishText(pkg.duration_days)}{englishText("ngày)")}</option>
          ))}
        </select>
      ) : (
        <span className="muted"><UiText text={"Không có gói học khả dụng"} /></span>
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
              >{" "}<UiText text={"Hủy"} />{" "}</button>
              <button
                type="submit"
                disabled={creating} className="btn btn-primary"
              >{" "}<UiText text={"Tạo"} />{" "}<UiText>{roleFilter === "MENTOR" ? "Mentor" : "Learner"}</UiText>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
