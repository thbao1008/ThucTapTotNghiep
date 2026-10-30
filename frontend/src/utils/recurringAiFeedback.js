import { getVerifiedAiFeedback } from './learnerFeedback.js';

function issues(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value : [];
}

function transcriptExcerpt(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return ''; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.text !== 'string') return '';
  const text = value.text.trim();
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

// The persisted schema only distinguishes grammar and usage. Group an exact
// normalized phrase, never infer a grammar rule, vocabulary level or skill grade.
export function buildRecurringAiFeedback(submissions) {
  if (!Array.isArray(submissions)) return [];
  const groups = new Map();
  const seenSubmissions = new Set();
  const ordered = submissions.filter(Boolean).slice().sort((a, b) => Number(b.id) - Number(a.id));
  for (const submission of ordered) {
    const verified = getVerifiedAiFeedback(submission);
    if (!verified || seenSubmissions.has(String(verified.submissionId))) continue;
    seenSubmissions.add(String(verified.submissionId));
    const seenIssues = new Set();
    for (const issue of issues(submission.grammar_issues)) {
      if (!issue || !['grammar', 'usage'].includes(issue.type)
        || typeof issue.word !== 'string' || typeof issue.note !== 'string') continue;
      const word = issue.word.normalize('NFC').trim().replace(/\s+/g, ' ');
      const note = issue.note.trim();
      if (!word || word.length > 80 || !note || note.length > 2000) continue;
      const key = JSON.stringify([issue.type, word.toLowerCase()]);
      if (seenIssues.has(key)) continue;
      seenIssues.add(key);
      if (!groups.has(key)) groups.set(key, { key, type: issue.type, word, count: 0, evidence: [] });
      const group = groups.get(key);
      group.count += 1;
      group.evidence.push({ submissionId: verified.submissionId, title: verified.title,
        note, excerpt: transcriptExcerpt(submission.transcript), challengePath: verified.challengePath });
    }
  }
  return [...groups.values()].filter(group => group.count >= 2)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
