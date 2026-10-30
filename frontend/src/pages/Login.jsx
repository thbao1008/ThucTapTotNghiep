import { englishText } from '../i18n/uiLanguage.js';
﻿import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Brand from "../components/common/Brand.jsx";
import {TranslationToggle, UiText } from "../i18n/UiLanguage.jsx";
import { login as apiLogin } from "../services/authService";
import { saveAuth } from "../utils/auth";
import { useAuth } from "../context/AuthContext";
import api from "../api.js";
import "../styles/login.css";


export default function Login({ onLogin }) {
  const context = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password states
  const [mode, setMode] = useState("login"); // "login" | "forgot-step1" | "forgot-step2" | "forgot-step3"
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [resetToken, setResetToken] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!identifier.trim()) return setError("Vui lòng nhập email hoặc số điện thoại.");
    if (!password) return setError("Vui lòng nhập mật khẩu.");

    setLoading(true);
    try {
      const result = context?.login
        ? await context.login(identifier.trim(), password, remember)
        : await apiLogin(identifier.trim(), password);
      const { token, user } = result;
      if (!token || !user) throw new Error("Phản hồi đăng nhập không hợp lệ");

      if (!context?.login) saveAuth({ token, user }, remember);
      onLogin?.(user);

      document.body.classList.remove("theme-admin", "theme-mentor", "theme-learner");
      document.body.classList.add(`theme-${user.role?.toLowerCase() || "learner"}`);

      const role = user.role?.toLowerCase();
      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "mentor") navigate("/mentor", { replace: true });
      else navigate("/learn", { replace: true });
    } catch (err) {
      console.error("Login error:", err);
      // Xử lý lỗi banned user
      if (err?.banned) {
        setError(err?.message || "Tài khoản của bạn đang bị tạm khóa. Hãy liên hệ hỗ trợ để được giải quyết.");
      } 
      // Xử lý lỗi có session active (đang đăng nhập trên thiết bị khác)
      else if (err?.hasActiveSession) {
        setError(err?.message || "Tài khoản của bạn đang được sử dụng trên thiết bị khác. Vui lòng đăng xuất khỏi thiết bị đó trước khi đăng nhập lại.");
      } 
      else {
        setError(err?.message || "Sai tài khoản hoặc mật khẩu");
      }
    } finally {
      setLoading(false);
    }
  }

  // Step 1: Request security question
  async function handleForgotStep1(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!identifier.trim()) {
      return setError("Vui lòng nhập email hoặc số điện thoại");
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { identifier: identifier.trim() });
      setSecurityQuestion(res.data.security_question);
      setMessage("Vui lòng trả lời câu hỏi bảo mật");
      setMode("forgot-step2");
    } catch (err) {
      setError(err?.response?.data?.message || "Không tìm thấy tài khoản hoặc tài khoản chưa thiết lập câu hỏi bảo mật");
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify security answer
  async function handleForgotStep2(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!securityAnswer.trim()) {
      return setError("Vui lòng nhập câu trả lời");
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/verify-security-answer", {
        identifier: identifier.trim(),
        security_answer: securityAnswer.trim()
      });
      setResetToken(res.data.resetToken);
      setMessage("Xác thực thành công. Vui lòng đặt mật khẩu mới");
      setMode("forgot-step3");
    } catch (err) {
      setError(err?.response?.data?.message || "Câu trả lời không đúng");
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Reset password
  async function handleForgotStep3(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!newPassword.trim()) {
      return setError("Vui lòng nhập mật khẩu mới");
    }
    // Validate mật khẩu chặt chẽ
    if (newPassword.length < 8) {
      return setError("Mật khẩu phải có ít nhất 8 ký tự");
    }
    if (!/[A-Z]/.test(newPassword)) {
      return setError("Mật khẩu phải có ít nhất 1 chữ hoa");
    }
    if (!/[a-z]/.test(newPassword)) {
      return setError("Mật khẩu phải có ít nhất 1 chữ thường");
    }
    if (!/[0-9]/.test(newPassword)) {
      return setError("Mật khẩu phải có ít nhất 1 số");
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      return setError("Mật khẩu phải có ít nhất 1 ký tự đặc biệt");
    }
    if (newPassword !== confirmPassword) {
      return setError("Mật khẩu xác nhận không khớp");
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        token: resetToken,
        newPassword: newPassword.trim()
      });
      setMessage("✅ Đặt lại mật khẩu thành công. Đang chuyển về trang đăng nhập...");
      setTimeout(() => {
        setMode("login");
        setIdentifier("");
        setSecurityQuestion("");
        setSecurityAnswer("");
        setResetToken(null);
        setNewPassword("");
        setConfirmPassword("");
        setMessage("");
      }, 2000);
    } catch (err) {
      setError(err?.response?.data?.message || "Có lỗi xảy ra khi đặt lại mật khẩu");
    } finally {
      setLoading(false);
    }
  }

  function resetForgotPassword() {
    setMode("login");
    setIdentifier("");
    setSecurityQuestion("");
    setSecurityAnswer("");
    setResetToken(null);
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
  }

  return (
    <div className="login-wrap">
      <div className="public-language-bar"><TranslationToggle /></div>
      {/* Background */}
      <div
        className="hero-bg"
      />

      {/* Logo */}
      <div
        className="brand cursor-pointer transition-transform duration-200 hover:scale-105 hover:opacity-90"
        onClick={() => navigate("/")}
      >
        <Brand />
      </div>

      {/* Card */}
      <div className="login-card">
        {mode === "login" && (
          <>
            <h1 className="card-title"><UiText text={"Đăng nhập luyện nói tiếng Anh"} /></h1>
            <p className="card-subtitle">{" "}<UiText text={"A little practice. A more confident you."} />{" "}</p>

            <form className="form" onSubmit={handleLogin} noValidate>
              <div className="field">
                <label className="label" htmlFor="login-identifier"><UiText text={"Email hoặc Số điện thoại"} /></label>
                <input
                  id="login-identifier"
                  type="text"
                  className={`input ${error ? "error" : ""}`}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={englishText("Nhập email hoặc số điện thoại")}
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="login-password"><UiText text={"Mật khẩu"} /></label>
                <div className="input-group password-group">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className={`input ${error ? "error" : ""}`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={englishText("Mật khẩu")}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    <UiText>{showPassword ? "Ẩn" : "Hiện"}</UiText>
                  </button>
                </div>
              </div>

              <div className="helper-row">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span><UiText text={"Ghi nhớ"} /></span>
                </label>

                <button
                  type="button"
                  className="help-link"
                  onClick={() => {
                    resetForgotPassword();
                    setMode("forgot-step1");
                  }}
                >{" "}<UiText text={"Quên mật khẩu?"} />{" "}</button>
              </div>

              {error && <div className="error"><UiText>{error}</UiText></div>}
              {message && <div className="note"><UiText>{message}</UiText></div>}

              <button
                className={`button ${loading ? "loading" : ""}`}
                type="submit"
                disabled={loading}
              >
                <UiText>{loading ? "Đang xử lý..." : "Đăng nhập"}</UiText>
              </button>
            </form>

            <div className="support-note">{" "}<UiText text={"Tài khoản được tạo bởi quản trị viên. Cần hỗ trợ?"} />{" "}
            </div>
          </>
        )}

        {/* Step 1: Nhập email/phone */}
        {mode === "forgot-step1" && (
          <>
            <h1 className="card-title"><UiText text={"Quên mật khẩu"} /></h1>
            <p className="card-subtitle"><UiText text={"Nhập email hoặc số điện thoại để lấy câu hỏi bảo mật"} /></p>

            <form className="form" onSubmit={handleForgotStep1} noValidate>
              <div className="field">
                <label className="label"><UiText text={"Email hoặc Số điện thoại"} /></label>
                <input
                  type="text"
                  className={`input ${error ? "error" : ""}`}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={englishText("Nhập email hoặc số điện thoại")}
                  autoComplete="username"
                />
              </div>

              {error && <div className="error"><UiText>{error}</UiText></div>}
              {message && <div className="note"><UiText>{message}</UiText></div>}

              <div className="helper-row">
                <button type="button" className="help-link" onClick={resetForgotPassword}>{" "}<UiText text={"← Quay lại đăng nhập"} />{" "}</button>
              </div>

              <button
                className={`button ${loading ? "loading" : ""}`}
                type="submit"
                disabled={loading}
              >
                <UiText>{loading ? "Đang xử lý..." : "Tiếp theo"}</UiText>
              </button>
            </form>
          </>
        )}

        {/* Step 2: Trả lời câu hỏi bảo mật */}
        {mode === "forgot-step2" && (
          <>
            <h1 className="card-title"><UiText text={"Câu hỏi bảo mật"} /></h1>
            <p className="card-subtitle"><UiText text={"Vui lòng trả lời câu hỏi bảo mật của bạn"} /></p>

            <form className="form" onSubmit={handleForgotStep2} noValidate>
              <div className="field">
                <label className="label"><UiText text={"Câu hỏi bảo mật"} /></label>
                <div className="security-question-box">
                  <UiText>{securityQuestion}</UiText>
                </div>
              </div>

              <div className="field">
                <label className="label"><UiText text={"Câu trả lời"} /></label>
                <input
                  type="text"
                  className={`input ${error ? "error" : ""}`}
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder={englishText("Nhập câu trả lời")}
                  autoComplete="off"
                />
              </div>

              {error && <div className="error"><UiText>{error}</UiText></div>}
              {message && <div className="note"><UiText>{message}</UiText></div>}

              <div className="helper-row">
                <button type="button" className="help-link" onClick={() => setMode("forgot-step1")}>{" "}<UiText text={"← Quay lại"} />{" "}</button>
              </div>

              <button
                className={`button ${loading ? "loading" : ""}`}
                type="submit"
                disabled={loading}
              >
                <UiText>{loading ? "Đang xử lý..." : "Xác nhận"}</UiText>
              </button>
            </form>
          </>
        )}

        {/* Step 3: Đặt mật khẩu mới */}
        {mode === "forgot-step3" && (
          <>
            <h1 className="card-title"><UiText text={"Đặt mật khẩu mới"} /></h1>
            <p className="card-subtitle"><UiText text={"Nhập mật khẩu mới cho tài khoản của bạn"} /></p>

            <form className="form" onSubmit={handleForgotStep3} noValidate>
              <div className="field">
                <label className="label"><UiText text={"Mật khẩu mới"} /></label>
                <input
                  type="password"
                  className={`input ${error ? "error" : ""}`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={englishText("Nhập mật khẩu mới (tối thiểu 8 ký tự, có chữ hoa, thường, số và ký tự đặc biệt)")}
                  autoComplete="new-password"
                />
              </div>

              <div className="field">
                <label className="label"><UiText text={"Xác nhận mật khẩu"} /></label>
                <input
                  type="password"
                  className={`input ${error ? "error" : ""}`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={englishText("Nhập lại mật khẩu mới")}
                  autoComplete="new-password"
                />
              </div>

              {error && <div className="error"><UiText>{error}</UiText></div>}
              {message && <div className="note"><UiText>{message}</UiText></div>}

              <div className="helper-row">
                <button type="button" className="help-link" onClick={() => setMode("forgot-step2")}>{" "}<UiText text={"← Quay lại"} />{" "}</button>
              </div>

              <button
                className={`button ${loading ? "loading" : ""}`}
                type="submit"
                disabled={loading}
              >
                <UiText>{loading ? "Đang xử lý..." : "Đặt lại mật khẩu"}</UiText>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
