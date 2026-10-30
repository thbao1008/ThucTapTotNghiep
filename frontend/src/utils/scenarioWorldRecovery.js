import { presentWorldSession } from './scenarioWorld.js';

// A mutation replay can be older than the current session. Always inspect the
// saved snapshot before presenting durable state; this function never resends.
export async function readWorldAfterMutation({ client, sceneId, catalog, signal, minimumRevision = 0 }) {
  if (typeof sceneId !== 'string' || !sceneId.trim() || !Number.isSafeInteger(minimumRevision)
    || minimumRevision < 0 || minimumRevision > 12) throw new Error('Yêu cầu khôi phục Scenario chưa hợp lệ.');
  const response = await client.get(`/learners/scenario-world/conversation/${sceneId}`, { signal, timeout: 15000 });
  const saved = presentWorldSession(response.data, catalog);
  if (saved.scene.client_id !== sceneId || saved.turns.length < minimumRevision) throw new Error('Hội thoại trả về chưa khớp với phiên vừa lưu.');
  return { ...saved, request: { ...response.data.request } };
}
