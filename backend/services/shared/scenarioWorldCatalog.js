import { readFileSync } from 'node:fs';

// Authored catalog shared with the frontend. Model output supplies IDs only;
// it cannot supply executable URLs, rename characters or replace their images.
export const scenarioWorldCatalog = JSON.parse(readFileSync(
  new URL('../../../frontend/src/data/scenarioWorldCatalog.json', import.meta.url), 'utf8'
));
