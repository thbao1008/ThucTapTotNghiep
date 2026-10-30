const BASE_URL = "/api/auth";

export async function login(identifier, password) {
  if (!identifier || !password) {
    throw new Error("Vui lòng nhập đầy đủ thông tin");
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

  try {
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ identifier, password }),
      signal: controller.signal,
      credentials: "include", // Include cookies
      keepalive: true, // Keep connection alive
    });

    clearTimeout(timeoutId);

    // Check if response is empty
    if (!res || res.status === 0) {
      throw new Error("Không nhận được phản hồi từ server. Vui lòng kiểm tra backend services đã chạy chưa.");
    }

    // Xử lý response text trước khi parse JSON
    const text = await res.text();
    
    // Check if response is empty
    if (!text || text.trim() === "") {
      throw new Error("Server trả về response rỗng. Vui lòng kiểm tra backend services.");
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse JSON response:", text);
      if (res.status === 504 || res.status === 503) {
        throw new Error("Gateway Timeout - Vui lòng kiểm tra backend services đã chạy chưa");
      }
      throw new Error(`Lỗi server: ${text.substring(0, 100)}`);
    }
    
    if (!res.ok) {
      // Xử lý lỗi banned user
      if (res.status === 403 && data?.banned) {
        const error = new Error(data.message || "Tài khoản của bạn đang bị tạm khóa. Hãy liên hệ hỗ trợ để được giải quyết.");
        error.banned = true;
        error.banReason = data.banReason;
        throw error;
      }
      // Xử lý lỗi có session active (đang đăng nhập trên thiết bị khác)
      if (res.status === 403 && data?.hasActiveSession) {
        const error = new Error(data.message || "Tài khoản của bạn đang được sử dụng trên thiết bị khác. Vui lòng đăng xuất khỏi thiết bị đó trước khi đăng nhập lại.");
        error.hasActiveSession = true;
        error.deviceInfo = data.deviceInfo;
        throw error;
      }
      throw new Error(data.message || `Đăng nhập thất bại (${res.status})`);
    }

    const token = data.token || data.data?.token;
    const user = data.user || data.data?.user;

    if (!token || !user) {
      throw new Error("Phản hồi đăng nhập không hợp lệ");
    }
    return { token, user };
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Handle specific errors
    if (err.name === "AbortError") {
      throw new Error("Request timeout - Vui lòng kiểm tra backend services đã chạy chưa");
    }
    if (err.message?.includes("Failed to fetch") || err.message?.includes("ERR_EMPTY_RESPONSE")) {
      throw new Error("Không thể kết nối đến server. Vui lòng kiểm tra backend services đã chạy chưa.");
    }
    if (err.message?.includes("NetworkError") || err.message?.includes("ERR_CONNECTION_REFUSED")) {
      throw new Error("Không thể kết nối đến server. Vui lòng kiểm tra API Gateway đã chạy chưa.");
    }
    
    // Re-throw other errors
    throw err;
  }
}
