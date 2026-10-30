export function readAuthToken() {
  if (typeof window === "undefined") return null;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const value = storage.getItem("aesp_auth_v1");
      if (!value) continue;
      const parsed = JSON.parse(value);
      if (typeof parsed?.token === "string" && parsed.token) return parsed.token;
    } catch {
      continue;
    }
  }
  return null;
}

export function isProtectedUploadUrl(value) {
  try {
    return new URL(value, window.location.origin).pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

export async function requestAuthenticatedMedia(src, signal, trustedBases = []) {
  if (!isProtectedUploadUrl(src)) return { url: src, cleanup() {} };
  const target = new URL(src, window.location.origin);
  const trustedOrigins = new Set([window.location.origin]);
  for (const base of trustedBases) {
    if (base) trustedOrigins.add(new URL(base, window.location.origin).origin);
  }
  if (!trustedOrigins.has(target.origin) || !["http:", "https:"].includes(target.protocol) ||
      target.username || target.password) {
    throw new Error("Địa chỉ audio không thuộc máy chủ được cấu hình.");
  }
  const token = readAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(target.href, { headers, signal, redirect: "error" });
  if (signal?.aborted) throw new DOMException("Media request was aborted", "AbortError");
  if (!response.ok) {
    if ([401, 403].includes(response.status)) {
      window.dispatchEvent(new CustomEvent("session-expired"));
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để nghe audio.");
    }
    throw new Error(response.status === 404
      ? "Không tìm thấy audio hoặc bạn không có quyền truy cập."
      : "Không thể tải audio. Vui lòng thử lại.");
  }
  const blob = await response.blob();
  if (signal?.aborted) throw new DOMException("Media request was aborted", "AbortError");
  const url = URL.createObjectURL(blob);
  return { url, cleanup: () => URL.revokeObjectURL(url) };
}
