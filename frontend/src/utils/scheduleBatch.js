// Scoped to a mounted form. Unknown outcomes require history review, not retry.
const validId = value => ['string', 'number'].includes(typeof value)
  && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
export function createScheduleBatch(send) {
  let busy = false;
  const outcomes = new Map();
  const manifests = new Map();
  return {
    async run(items, { signal } = {}) {
      if (busy || signal?.aborted) return null;
      busy = true;
      try {
        // Once any child is saved/uncertain, retain that group's original
        // recipients and payloads across list refreshes and explicit retries.
        const groups = new Map();
        for (const item of items) {
          const group = item.group ?? item.key;
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(item);
        }
        const runItems = [...groups].flatMap(([group, groupItems]) => {
          const locked = [...outcomes.values()].some(row => (row.group ?? row.key) === group && ['saved', 'unknown'].includes(row.status));
          if (!locked) manifests.set(group, groupItems.map(item => ({ ...item, payload: { ...item.payload } })));
          return manifests.get(group);
        });
        for (const item of runItems) {
          if (signal?.aborted) break;
          const previous = outcomes.get(item.key);
          if (previous && ['saved', 'unknown'].includes(previous.status)) continue;
          try {
            const { data } = await send(item, { signal });
            const valid = validId(data?.id)
              && (!item.expectedId || String(data.id) === String(item.expectedId))
              && (!item.expectedLearnerId || (validId(data.learner_id) && String(data.learner_id) === String(item.expectedLearnerId)))
              && (!item.expectedMentorId || (validId(data.mentor_id) && String(data.mentor_id) === String(item.expectedMentorId)));
            outcomes.set(item.key, { ...item, status: valid ? 'saved' : 'unknown' });
          } catch (error) {
            const status = error?.response?.status;
            // A request timeout can happen after the server accepted a write.
            outcomes.set(item.key, { ...item, status: status >= 400 && status < 500 && status !== 408 ? 'failed' : 'unknown' });
            if (status === 401 || status === 403) break;
          }
        }
        return runItems.map(item => outcomes.get(item.key) || { ...item, status: 'pending' });
      } finally { busy = false; }
    },
    locked(prefix) { return [...outcomes.values()].some(row => row.group === prefix && ['saved', 'unknown'].includes(row.status)); }
  };
}

export function summarizeScheduleBatch(outcomes) {
  const counts = { saved: 0, failed: 0, unknown: 0 };
  for (const row of outcomes) counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}
