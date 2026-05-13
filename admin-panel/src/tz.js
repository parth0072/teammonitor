// tz.js — Timezone-aware date/time formatters
// Reads the configured timezone from localStorage (set on app init from org_settings).
// Falls back to the browser's local timezone if nothing is stored.

const TZ_KEY = 'tm_timezone';

export function getTimezone() {
  return localStorage.getItem(TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function setTimezone(tz) {
  if (tz) localStorage.setItem(TZ_KEY, tz);
}

function intlFmt(dt, opts) {
  if (!dt) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: getTimezone(), ...opts }).format(new Date(dt));
  } catch {
    return '—';
  }
}

/** "4:58 PM" */
export function fmtTime(dt) {
  return intlFmt(dt, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** "4:58:30 PM" */
export function fmtTimeSec(dt) {
  return intlFmt(dt, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

/** "Apr 28, 2026" */
export function fmtDateShort(dt) {
  return intlFmt(dt, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Apr 28, 2026, 4:58 PM" */
export function fmtDateTime(dt) {
  return intlFmt(dt, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

// ── Duration formatters ──────────────────────────────────────────────────────
// Single source of truth — import these everywhere, never define them locally.

/** "5h 04m" — primary format; input = minutes */
export function fmtHM(m) {
  m = Math.round(Number(m) || 0);
  const h = Math.floor(m / 60), mn = m % 60;
  return h > 0 ? `${h}h ${String(mn).padStart(2, "0")}m` : `${mn}m`;
}

/** "5h 4m" — compact unpadded; input = seconds (activity / app logs) */
export function fmtDur(s) {
  s = Math.round(Number(s) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "05:04" — zero-padded HH:MM clock; input = minutes (Timelines summary rows) */
export function fmtHMPad(m) {
  m = Math.round(Number(m) || 0);
  const h = Math.floor(m / 60), mn = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

/** "5.1h" — decimal hours; input = minutes (Dashboard stat cards) */
export function fmtHMdec(m) {
  return (Math.round(Number(m) || 0) / 60).toFixed(1) + "h";
}

// Common timezones for the settings dropdown
export const TIMEZONES = [
  { label: 'UTC',                         value: 'UTC' },
  { label: 'IST — India (UTC+5:30)',       value: 'Asia/Kolkata' },
  { label: 'GST — Dubai (UTC+4)',          value: 'Asia/Dubai' },
  { label: 'PKT — Pakistan (UTC+5)',       value: 'Asia/Karachi' },
  { label: 'BST — Bangladesh (UTC+6)',     value: 'Asia/Dhaka' },
  { label: 'SGT — Singapore (UTC+8)',      value: 'Asia/Singapore' },
  { label: 'JST — Japan (UTC+9)',          value: 'Asia/Tokyo' },
  { label: 'AEST — Sydney (UTC+10/11)',    value: 'Australia/Sydney' },
  { label: 'GMT — London (UTC+0/1)',       value: 'Europe/London' },
  { label: 'CET — Paris/Berlin (UTC+1/2)',  value: 'Europe/Paris' },
  { label: 'MSK — Moscow (UTC+3)',         value: 'Europe/Moscow' },
  { label: 'EST — New York (UTC-5/-4)',    value: 'America/New_York' },
  { label: 'CST — Chicago (UTC-6/-5)',     value: 'America/Chicago' },
  { label: 'MST — Denver (UTC-7/-6)',      value: 'America/Denver' },
  { label: 'PST — Los Angeles (UTC-8/-7)', value: 'America/Los_Angeles' },
];
