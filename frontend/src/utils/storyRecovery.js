export const STORY_REQUEST_TIMEOUT_MS = 180_000;

// Recovery must never infer success from an old message or resend an uncertain upload.
export function recoverStoryTurn(restored, expectedRevision) {
  const newRows = restored.conversation.filter(row => Number.isSafeInteger(Number(row.id))
    && Number(row.id) > expectedRevision);
  const reply = [...newRows].reverse().find(row => row.type === 'ai' && row.text.trim());
  const saved = newRows.some(row => row.type === 'user');
  return { reply: saved ? reply || null : null, notice: saved
    ? 'Đã đồng bộ phản hồi mới nhất. Không tự động gửi lại bản ghi.'
    : 'Chưa xác nhận được lượt ghi âm đã lưu. Hội thoại đã được đồng bộ; không tự động gửi lại bản ghi.' };
}
