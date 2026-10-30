export function formatDashboardScore(value, assessmentStatus) {
  if (assessmentStatus !== "completed" || typeof value !== "number" ||
      !Number.isFinite(value) || value < 0 || value > 100) return "Chưa có điểm";
  return `${value}/100`;
}
