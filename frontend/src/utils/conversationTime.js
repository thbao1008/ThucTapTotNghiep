// API histories contain ISO strings; optimistic messages use Date objects.
export function formatConversationTime(timestamp) {
  if (!(timestamp instanceof Date) && typeof timestamp !== "string" && typeof timestamp !== "number") return "";
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
