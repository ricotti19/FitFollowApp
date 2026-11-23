// Pure helpers (no React / DOM) so they can be unit-tested with `npm test`.

export const WEIGHT_UNIT = 'lb'; // change to 'kg' if your users prefer it; the server stores plain numbers
export const LENGTH_UNIT = 'in';

/** Local calendar day as YYYY-MM-DD. (toISOString would give the UTC day, wrong in the evening for US time zones.) */
export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "Friday, Nov 20" */
export function headerDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** "Nov 20" from a YYYY-MM-DD string (parsed as a local date, never shifted by time zone). */
export function shortDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function weekdayLetter(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
}

export const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');

/** 0..100, safe for goal = 0 and negative / NaN input. */
export function pct(value, goal) {
  if (!goal || goal <= 0 || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.round((value / goal) * 100));
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function hoursLeft(iso, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 3600000));
}

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(r).padStart(2, '0')}s`;
  return `${r}s`;
}

const PALETTE = ['#3a5af6', '#d75c3c', '#458c5e', '#7242e9', '#c0457f', '#2d8fa8'];
/** Stable colour per user, like the coloured letter avatars in the mock-up. */
export function avatarColor(seed = '') {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const initial = (name = '?') => (String(name).trim()[0] || '?').toUpperCase();

/** Parse a number from an input box. Returns null when blank / not finite. */
export function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export const round1 = (n) => Math.round(n * 10) / 10;

export const AUDIENCE_LABEL = { PRIVATE: 'Only me', FRIENDS: 'Friends', PUBLIC: 'Public' };