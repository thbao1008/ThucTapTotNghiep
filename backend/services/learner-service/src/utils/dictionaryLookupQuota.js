const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED_USERS = 10_000;

export function createDictionaryLookupQuota({
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
  maxTrackedUsers = MAX_TRACKED_USERS,
  now = Date.now
} = {}) {
  const userWindows = new Map();

  return function consumeLookup(userId) {
    const currentTime = now();
    for (const [trackedUserId, window] of userWindows) {
      if (window.resetAt <= currentTime) userWindows.delete(trackedUserId);
    }

    const key = String(userId);
    let window = userWindows.get(key);
    if (!window) {
      if (userWindows.size >= maxTrackedUsers) {
        return { allowed: false, capacityExceeded: true, retryAfterSeconds: 60 };
      }
      window = { count: 0, resetAt: currentTime + windowMs };
      userWindows.set(key, window);
    }

    if (window.count >= limit) {
      return {
        allowed: false,
        capacityExceeded: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - currentTime) / 1000))
      };
    }

    window.count += 1;
    return {
      allowed: true,
      capacityExceeded: false,
      remaining: limit - window.count
    };
  };
}

export const consumeDictionaryLookup = createDictionaryLookupQuota();
