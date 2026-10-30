import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/i18n/ui-copy.tsv', import.meta.url), 'utf8');
const copy = Object.create(null);
for (const [index, line] of source.split(/\r?\n/).entries()) {
  if (!line.trim() || line.startsWith('#')) continue;
  const parts = line.split('\t');
  if (parts.length !== 2 || !parts.every(value => value.trim())) throw Error(`Invalid copy row ${index + 1}`);
  const [vi, en] = parts.map(value => value.normalize('NFC').replace(/\s+/g, ' ').trim());
  if (Object.hasOwn(copy, vi) && copy[vi] !== en) throw Error(`Conflicting copy row ${index + 1}`);
  copy[vi] = en;
}
await writeFile(new URL('../src/i18n/uiCopy.js', import.meta.url),
  `// Generated from the reviewed local catalog by scripts/build-ui-copy.mjs.\nexport const UI_COPY = Object.freeze(${JSON.stringify(copy, null, 2)});\n`);
console.log(`Built ${Object.keys(copy).length} local UI translations.`);
