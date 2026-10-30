// Expiry signals must belong to the token that actually made the request.
export function isExpiredSessionResponse(status, data, requestToken, currentToken) {
  if (!requestToken || requestToken !== currentToken) return false;
  return status === 401 || (status === 403 && data?.requiresLogin === true);
}

export function readStoredAuthToken() {
  try {
    const raw = globalThis.sessionStorage?.getItem('aesp_auth_v1')
      || globalThis.localStorage?.getItem('aesp_auth_v1');
    return raw ? JSON.parse(raw)?.token || null : null;
  } catch { return null; }
}

export function jwtExpirationMs(token, decode = globalThis.atob) {
  try {
    if (typeof token !== 'string' || token.split('.').length !== 3 || typeof decode !== 'function') return null;
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(decode(part)).exp;
    return Number.isSafeInteger(exp) && exp > 0 && Number.isSafeInteger(exp * 1000) ? exp * 1000 : null;
  } catch { return null; }
}

// This stops local capture/playback at JWT expiry; the server still authorizes every request.
export function watchTokenExpiry(token, onExpire, {
  now = Date.now, schedule = setTimeout, unschedule = clearTimeout,
} = {}) {
  const expiration = jwtExpirationMs(token);
  if (expiration === null) return () => {};
  let timer, cancelled = false;
  const check = () => {
    if (cancelled) return;
    const remaining = expiration - now();
    if (remaining <= 0) { onExpire(token); return; }
    timer = schedule(check, Math.min(remaining, 2_147_483_647));
  };
  check();
  return () => { cancelled = true; if (timer !== undefined) unschedule(timer); };
}
