import {normalizeImageUrl} from './apiHelpers.js';

export function avatarSource(value) {
  if(typeof value!=='string'||!value.trim())return '';
  const source=value.trim();
  // Profile uploads are currently stored as image data URLs in PostgreSQL.
  if(/^data:image\//i.test(source)||source.startsWith('blob:'))return source;
  if(/^[a-z][a-z\d+.-]*:/i.test(source)&&!/^https?:/i.test(source))return '';
  return normalizeImageUrl(source);
}
export function avatarInitials(value) {
  return String(value??'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase()||'U';
}
