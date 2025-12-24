// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { login as apiLogin } from "../services/authService";
import { saveAuth, clearAuth, getAuth } from "../utils/auth";
import Modal from "../components/common/Modal";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState(false);
  const sessionCheckIntervalRef = useRef(null);
  const isCheckingSessionRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const showSessionExpiredModalRef = useRef(false);

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
      // Nếu nhận được 403 với requiresLogin, session đã bị invalidate (đăng nhập từ nguồn khác)
      if (err.response?.status === 403 && err.response?.data?.requiresLogin) {
        console.log("Session đã bị invalidate, hiển thị thông báo...");
        // Hiển thị modal thông báo
        setShowSessionExpiredModal(true);
      }
    } finally {
      isCheckingSessionRef.current = false;
    }
  }, []);

  // Update ref when showSessionExpiredModal changes
  useEffect(() => {
    showSessionExpiredModalRef.current = showSessionExpiredModal;
  }, [showSessionExpiredModal]);

  // Lắng nghe event session-expired từ API interceptor
  useEffect(() => {
    const handleSessionExpired = () => {
      if (!showSessionExpiredModalRef.current) {
        setShowSessionExpiredModal(true);
      }
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
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
      setUser(user);
      setToken(token);
      saveAuth({ token, user }, remember);
      
      // Không cần kiểm tra session định kỳ liên tục, chỉ mỗi 5 phút
      // Interval đã được set trong useEffect initializeAuth
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      // Gọi API logout để xóa session trên server
      const { default: api } = await import("../api");
      const auth = getAuth();
      if (auth?.token) {
        try {
          await api.post("/auth/logout");
        } catch (err) {
          // Ignore logout errors - session might already be invalid
          console.warn("Logout API error (ignored):", err);
        }
      }
    } catch (err) {
      console.warn("Logout error (ignored):", err);
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
      {children}
      
      {/* Modal thông báo khi đăng nhập từ nguồn khác */}
      {showSessionExpiredModal && (
        <Modal
          title="Phiên đăng nhập đã hết hạn"
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
            }}>
              Bạn đã đăng nhập trên thiết bị khác
            </h3>
            <p style={{ 
              marginBottom: "24px", 
              color: "#6b7280",
              fontSize: "16px",
              lineHeight: "1.6"
            }}>
              Nếu không phải bạn, hãy liên hệ hỗ trợ ngay!
            </p>
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
            >
              Đăng nhập lại
            </button>
          </div>
        </Modal>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
