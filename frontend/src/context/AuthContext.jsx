import { englishText } from '../i18n/uiLanguage.js';
import { UiText } from '../i18n/UiLanguage.jsx';
﻿// src/context/AuthContext.jsx
import React, { useContext, useState, useEffect, useRef, useCallback } from "react";
import {AuthContext} from './authContextValue.js';
import { login as apiLogin } from "../services/authService";
import { saveAuth, clearAuth, getAuth } from "../utils/auth";
import { watchTokenExpiry } from '../utils/sessionExpiry.js';
import Modal from "../components/common/Modal";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState(false);
  const [packageExpiredMessage, setPackageExpiredMessage] = useState(null);
  const sessionCheckIntervalRef = useRef(null);
  const isCheckingSessionRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const showSessionExpiredModalRef = useRef(false);

  const expireSession = useCallback(expectedToken => {
    const stored = getAuth();
    if (!stored?.token || (expectedToken && expectedToken !== stored.token) || showSessionExpiredModalRef.current) return;
    showSessionExpiredModalRef.current = true;
    // Remove the private application immediately, so recording, playback and uploads
    // stop before the user dismisses the explanatory modal.
    setUser(null); setToken(null); clearAuth(); setShowSessionExpiredModal(true);
    if (sessionCheckIntervalRef.current) {
      clearInterval(sessionCheckIntervalRef.current); sessionCheckIntervalRef.current = null;
    }
  }, []);

  useEffect(() => token ? watchTokenExpiry(token, expireSession) : undefined, [token, expireSession]);

  // Hàm logout và redirect
  const handleLogoutAndRedirect = useCallback(() => {
    setUser(null);
    setToken(null);
    clearAuth();
    // Clear interval
    if (sessionCheckIntervalRef.current) {
      clearInterval(sessionCheckIntervalRef.current);
      sessionCheckIntervalRef.current = null;
    }
    // Redirect về login nếu không phải đang ở trang login
    if (window.location.pathname !== "/login") {
      window.location.href = "/login?session=expired";
    }
  }, []);

  // Kiểm tra session có hợp lệ không
  const checkSession = useCallback(async () => {
    const stored = getAuth();
    if (!stored?.token || isCheckingSessionRef.current) {
      return;
    }

    isCheckingSessionRef.current = true;
    try {
      const { default: api } = await import("../api");
      // Gọi API nhẹ để kiểm tra session (sử dụng endpoint /users/me)
      await api.get("/users/me");
    } catch (err) {
      if (err.requiresLogin) expireSession(stored.token);
    } finally {
      isCheckingSessionRef.current = false;
    }
  }, [expireSession]);

  // Update ref when showSessionExpiredModal changes
  useEffect(() => {
    showSessionExpiredModalRef.current = showSessionExpiredModal;
  }, [showSessionExpiredModal]);

  // Lắng nghe event session-expired từ API interceptor
  useEffect(() => {
    const handleSessionExpired = event => expireSession(event.detail?.token);

    window.addEventListener('session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
    };
  }, [expireSession]);

  useEffect(() => {
    const handlePackageExpired = event => {
      const message = event.detail?.message
        || "Gói dịch vụ không còn hiệu lực. Vui lòng liên hệ hỗ trợ để gia hạn.";
      setPackageExpiredMessage(message);
    };

    window.addEventListener('package-expired', handlePackageExpired);
    return () => {
      window.removeEventListener('package-expired', handlePackageExpired);
    };
  }, []);

  // Khôi phục trạng thái đăng nhập khi reload và kiểm tra session
  useEffect(() => {
    if (hasInitializedRef.current) return;
    
    const initializeAuth = async () => {
      hasInitializedRef.current = true;
      const stored = getAuth();
      if (stored) {
        setToken(stored.token);
        setUser(stored.user);
        
        // Kiểm tra session
        await checkSession();
        
        // Kiểm tra session định kỳ mỗi 5 phút (thay vì 30 giây)
        if (getAuth()?.token === stored.token)
          sessionCheckIntervalRef.current = setInterval(checkSession, 300000); // 5 minutes
      }
    };

    initializeAuth();

    // Cleanup interval khi unmount
    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      // Reset refs
      isCheckingSessionRef.current = false;
      hasInitializedRef.current = false;
    };
  }, [checkSession]);

  // Kiểm tra session ngay khi window/tab được focus hoặc có user interaction
  useEffect(() => {
    let lastSessionCheck = 0;
    
    const handleFocus = () => {
      const stored = getAuth();
      const now = Date.now();
      if (stored?.token && !showSessionExpiredModal && now - lastSessionCheck > 5000) {
        lastSessionCheck = now;
        checkSession();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const stored = getAuth();
        const now = Date.now();
        if (stored?.token && !showSessionExpiredModal && now - lastSessionCheck > 5000) {
          lastSessionCheck = now;
          checkSession();
        }
      }
    };

    // Kiểm tra khi có user interaction (click, keypress) - chỉ mỗi 60 giây
    const handleUserInteraction = () => {
      const stored = getAuth();
      const now = Date.now();
      if (stored?.token && !showSessionExpiredModal && now - lastSessionCheck > 60000) {
        lastSessionCheck = now;
        checkSession();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, [checkSession, showSessionExpiredModal]);

  async function login(username, password, remember) {
    setLoading(true);
    try {
      const { token, user } = await apiLogin(username, password);
      if (typeof token !== 'string' || !token || !user || typeof user !== 'object') {
        throw new Error('Phản hồi đăng nhập không hợp lệ');
      }
      setUser(user);
      setToken(token);
      showSessionExpiredModalRef.current = false;
      setShowSessionExpiredModal(false);
      saveAuth({ token, user }, remember);
      if (sessionCheckIntervalRef.current) clearInterval(sessionCheckIntervalRef.current);
      sessionCheckIntervalRef.current = setInterval(checkSession, 300000);
      return { token, user };
    } finally {
      setLoading(false);
    }
  }

  async function logout({ skipServer = false } = {}) {
    try {
      if (!skipServer) {
        const { default: api } = await import("../api");
        const auth = getAuth();
        if (auth?.token) {
          try {
            await api.post("/auth/logout");
          } catch (err) {
            // A revoked/expired session still needs local logout.
            console.warn("Logout API error (ignored):", err?.code || err?.name);
          }
        }
      }
    } catch (err) {
      console.warn("Logout error (ignored):", err?.code||err?.name);
    } finally {
      setUser(null);
      setToken(null);
      clearAuth();
      // Clear interval khi logout
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
    }
  }

  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      login, 
      logout, 
      isAuthenticated, 
      loading
    }}>
      {!showSessionExpiredModal && children}
      
      {/* Modal thông báo khi đăng nhập từ nguồn khác */}
      {showSessionExpiredModal && (
        <Modal
          title={englishText("Phiên đăng nhập đã hết hạn")}
          onClose={() => {
            setShowSessionExpiredModal(false);
            handleLogoutAndRedirect();
          }}
        >
          <div style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ 
              fontSize: "48px", 
              marginBottom: "16px",
              color: "#ef4444"
            }}>
              ⚠️
            </div>
            <h3 style={{ 
              marginBottom: "16px", 
              color: "#1f2937",
              fontSize: "20px",
              fontWeight: "600"
            }}>{" "}<UiText text={"Phiên đăng nhập không còn hiệu lực"} />{" "}</h3>
            <p style={{ 
              marginBottom: "24px", 
              color: "#6b7280",
              fontSize: "16px",
              lineHeight: "1.6"
            }}>{" "}<UiText text={"Vui lòng đăng nhập lại để tiếp tục sử dụng AESP."} />{" "}</p>
            <button
              onClick={() => {
                setShowSessionExpiredModal(false);
                handleLogoutAndRedirect();
              }}
              style={{
                padding: "12px 24px",
                background: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "600",
                width: "100%"
              }}
            >{" "}<UiText text={"Đăng nhập lại"} />{" "}</button>
          </div>
        </Modal>
      )}

      {packageExpiredMessage && (
        <Modal
          title={englishText("Gói học đã hết hạn")}
          onClose={() => setPackageExpiredMessage(null)}
        >
          <div style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px", color: "#f59e0b" }}>⏳</div>
            <p style={{ marginBottom: "24px", color: "#4b5563", fontSize: "16px", lineHeight: "1.6" }}>
              <UiText>{packageExpiredMessage}</UiText>
            </p>
            <button
              onClick={() => setPackageExpiredMessage(null)}
              style={{
                padding: "12px 24px", background: "#2563eb", color: "white", border: "none",
                borderRadius: "8px", cursor: "pointer", fontSize: "16px", fontWeight: "600", width: "100%"
              }}
            >{" "}<UiText text={"Đã hiểu"} />{" "}</button>
          </div>
        </Modal>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
