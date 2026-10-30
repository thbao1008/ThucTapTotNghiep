import { unlink } from "node:fs/promises";
import { withSessionCreationLock } from "./sessionCreationLock.js";

export function parseConversationRevision(value) {
  if (value === undefined) throw Object.assign(new Error("Reload conversation before sending"), { status: 428, discardUploadSafe: true });
  if (!/^(0|[1-9]\d*)$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw Object.assign(new Error("Invalid expected_revision"), { status: 400, discardUploadSafe: true });
  }
  return Number(value);
}

export async function discardRejectedUpload(file) {
  if (file?.path) await unlink(file.path).catch(() => {});
}

export async function withConversationTurn(pool, mode, sessionId, expectedRevision, work) {
  const table = { scenario: "scenario_conversations", story: "story_conversations" }[mode];
  if (!table) throw new Error("Invalid conversation mode");
  const expected = parseConversationRevision(expectedRevision);
  return withSessionCreationLock(pool, `${mode}-turn`, sessionId, async client => {
    try {
      const revision = async () => {
        const result = await client.query(`SELECT COALESCE(MAX(id), 0) AS revision FROM ${table} WHERE session_id = $1`, [sessionId]);
        return Number(result.rows[0].revision);
      };
      if (await revision() !== expected) {
        throw Object.assign(new Error("Conversation changed. Reload before sending again."), {
          status: 409, code: "CONVERSATION_CHANGED"
        });
      }
      const result = await work(client);
      return { ...result, revision: await revision() };
    } catch (error) {
      // No COMMIT has been attempted here. Preserve files on ambiguous COMMIT failures.
      error.discardUploadSafe = true;
      throw error;
    }
  });
}
