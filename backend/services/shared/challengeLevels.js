export const CEFR_LEVELS = Object.freeze(['A1','A2','B1','B2','C1','C2']);
// Compatibility labels, not a proficiency assessment or a rewrite of old records.
export function normalizeChallengeLevel(value) {
  const level=String(value??'').trim().toUpperCase();
  return ({EASY:'A2',MEDIUM:'B1',HARD:'B2'})[level]||level;
}
export const challengeLevelSql = column => `CASE lower(trim(${column})) WHEN 'easy' THEN 'A2' WHEN 'medium' THEN 'B1' WHEN 'hard' THEN 'B2' ELSE upper(trim(${column})) END`;
