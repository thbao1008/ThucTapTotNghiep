// api.js
import axios from "axios";
import { isExpiredSessionResponse, readStoredAuthToken } from './utils/sessionExpiry.js';

// Tạo instance Axios với baseURL chuẩn
// Dùng relative URL để đi qua Vite proxy
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "/api", // Relative URL - đi qua Vite proxy
  timeout: 60000, // 60 seconds timeout for file uploads
});

// Interceptor: gắn token vào header nếu có và set Content-Type
api.interceptors.request.use((config) => {
  // Set Content-Type only if not multipart/form-data (Axios will set it automatically for FormData)
  if (!config.headers['Content-Type'] && !(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }
  
  // Remove Content-Type header for FormData - let Axios set it automatically with boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  
  const authToken = readStoredAuthToken();
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
    config.aespAuthToken = authToken;
  }
  return config;
});

// Interceptor: xử lý lỗi response chung
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't crash - log error and return friendly message
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      // Role/package denials are not login expiry. Ignore stale failures from a previous login.
      if (isExpiredSessionResponse(status, data, error.config?.aespAuthToken, readStoredAuthToken())) {
        error.message = data.message || "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
        error.requiresLogin = true;
        // Trigger event để AuthContext biết và hiển thị modal
        window.dispatchEvent(new CustomEvent('session-expired', { detail: { token: error.config.aespAuthToken } }));
      }

      // Gói học hết hạn không đồng nghĩa session bị thu hồi. Giữ người dùng đăng
      // nhập để họ vẫn xem được profile/tiến độ và nhận hướng dẫn gia hạn.
      if (status === 403 && data?.expired) {
        error.message = data.message || "Gói dịch vụ không còn hiệu lực. Vui lòng liên hệ hỗ trợ.";
        error.packageExpired = true;
        window.dispatchEvent(new CustomEvent('package-expired', {
          detail: { message: error.message }
        }));
      }
      
      // Xử lý lỗi banned user (403 với banned)
      if (status === 403 && data?.banned) {
        error.message = data.message || "Tài khoản của bạn đang bị tạm khóa. Hãy liên hệ hỗ trợ để được giải quyết.";
        error.banned = true;
        error.banReason = data.banReason;
      }
      
      console.error("API error - api.js:34", status, data);
    } else if (error.request) {
      // Backend không phản hồi - không crash, chỉ log
      console.warn("⚠️  Backend services chưa sẵn sàng. Vui lòng kiểm tra backend services đã chạy chưa.");
      // Return friendly error instead of crashing
      error.message = "Backend services chưa sẵn sàng. Vui lòng kiểm tra backend services đã chạy chưa.";
    } else {
      console.error("Axios config error - api.js:38", error.message);
    }
    // Don't crash - return error for UI to handle
    return Promise.reject(error);
  }
);

export default api;
