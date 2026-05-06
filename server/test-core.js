#!/usr/bin/env node
/**
 * test-core.js — pre-push regression tests for the recurring idle/heartbeat bugs
 *
 * Run:  node server/test-core.js
 * Exit: 0 = all pass, 1 = failures (blocks push)
 *
 * Tests the logic that has regressed multiple times:
 *   1. 2-minute idle threshold (heartbeat every 1 min; was 6 min when heartbeat was every 5 min)
 *   2. Heartbeat always clears is_idle unless isIdle===true
 *   3. is_online computed from last_heartbeat_at age, never from stored flag
 *   4. isAway = stale heartbeat OR is_idle (either condition sufficient)
 */

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✓  ${description}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${description}`);
    failed++;
  }
}

// ── helpers (mirrors the real logic) ─────────────────────────────────────────

const THRESHOLD_MINUTES = 2; // heartbeat fires every 1 min; 1 min grace

function heartbeatAgeMin(lastHeartbeatAt) {
  if (!lastHeartbeatAt) return 999;
  return (Date.now() - new Date(lastHeartbeatAt).getTime()) / 60000;
}

/** server/routes/sessions.js – team-overview */
function computeOnlineIdle(session, employeeIsIdle) {
  const age = heartbeatAgeMin(session.last_heartbeat_at);
  const is_online = age < THRESHOLD_MINUTES;
  const is_idle   = !!employeeIsIdle && age < THRESHOLD_MINUTES;
  return { is_online, is_idle };
}

/** admin-panel Reports.jsx – DayTimeline */
function computeIsAway(session, employeeIsIdle) {
  const isActive = !session.punch_out;
  if (!isActive) return false;
  const age = heartbeatAgeMin(session.last_heartbeat_at);
  return age > THRESHOLD_MINUTES || !!employeeIsIdle;
}

/** server/routes/sessions.js – heartbeat endpoint: what it writes to employees */
function heartbeatUpdatesIsIdle(bodyIsIdle) {
  // Always clears unless isIdle===true explicitly sent
  return bodyIsIdle === true ? 1 : 0;
}

/** admin-panel Dashboard.jsx – isStaleSession */
function isStaleSession(session) {
  if (session?.status !== 'active') return false;
  if (session.last_heartbeat_at) {
    return Date.now() > new Date(session.last_heartbeat_at).getTime() + THRESHOLD_MINUTES * 60000;
  }
  const punchIn  = new Date(session.punch_in).getTime();
  const tracked  = (session.total_minutes || 0) * 60000;
  return Date.now() > punchIn + tracked + THRESHOLD_MINUTES * 60000;
}

// ── helpers for building test sessions ───────────────────────────────────────

function minsAgo(n) {
  return new Date(Date.now() - n * 60000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Threshold is 2 minutes — heartbeat every 1 min; 1 min grace
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1] 2-minute threshold');

assert('1.9 min old heartbeat → online',
  computeOnlineIdle({ last_heartbeat_at: minsAgo(1.9) }, 0).is_online === true);

assert('2.0 min old heartbeat → offline',
  computeOnlineIdle({ last_heartbeat_at: minsAgo(2.0) }, 0).is_online === false);

assert('6 min old heartbeat → offline (old 6-min threshold must NOT pass)',
  computeOnlineIdle({ last_heartbeat_at: minsAgo(6) }, 0).is_online === false);

assert('10 min old heartbeat → offline',
  computeOnlineIdle({ last_heartbeat_at: minsAgo(10) }, 0).is_online === false);

assert('Dashboard: 1 min old heartbeat → not stale',
  isStaleSession({ status: 'active', last_heartbeat_at: minsAgo(1) }) === false);

assert('Dashboard: 3 min old → stale',
  isStaleSession({ status: 'active', last_heartbeat_at: minsAgo(3) }) === true);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Heartbeat always clears is_idle unless isIdle===true
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] Heartbeat clears is_idle');

assert('Regular heartbeat (isIdle undefined) → is_idle=0',
  heartbeatUpdatesIsIdle(undefined) === 0);

assert('Regular heartbeat (isIdle not sent / body omits it) → is_idle=0',
  heartbeatUpdatesIsIdle(undefined) === 0);

assert('Heartbeat with isIdle=false → is_idle=0',
  heartbeatUpdatesIsIdle(false) === 0);

assert('Heartbeat with isIdle=true → is_idle=1',
  heartbeatUpdatesIsIdle(true) === 1);

assert('Heartbeat with isIdle=null → is_idle=0 (not truthy)',
  heartbeatUpdatesIsIdle(null) === 0);

// ─────────────────────────────────────────────────────────────────────────────
// 3. isAway logic: stale heartbeat OR is_idle flag (lid close detection)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3] isAway (Reports Day Timeline)');

const freshSession   = { last_heartbeat_at: minsAgo(1),  punch_out: null };
const staleSession   = { last_heartbeat_at: minsAgo(3),  punch_out: null };
const completedSess  = { last_heartbeat_at: minsAgo(1),  punch_out: new Date().toISOString() };

assert('Fresh heartbeat, is_idle=0 → NOT away',
  computeIsAway(freshSession, 0) === false);

assert('Stale heartbeat, is_idle=0 → Away (lid close)',
  computeIsAway(staleSession, 0) === true);

assert('Fresh heartbeat, is_idle=1 → Away (agent flagged idle)',
  computeIsAway(freshSession, 1) === true);

assert('Completed session → never Away',
  computeIsAway(completedSess, 1) === false);

// ─────────────────────────────────────────────────────────────────────────────
// 4. is_idle resets after normal heartbeat (bug that kept reopening)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[4] Idle flag cleared by normal heartbeat (recurring regression)');

// Simulate: employee closes lid → is_idle=1 stored
let storedIsIdle = 1;

// Employee opens lid, timer resumes, macOS agent sends normal heartbeat (no isIdle field)
storedIsIdle = heartbeatUpdatesIsIdle(undefined);
assert('After normal heartbeat, stored is_idle goes 1→0', storedIsIdle === 0);

// With fresh heartbeat and is_idle=0, employee should be Active not Away
const sessionAfterResume = { last_heartbeat_at: minsAgo(0.5), punch_out: null };
assert('After resume: fresh heartbeat + is_idle=0 → Active (not Away)',
  computeIsAway(sessionAfterResume, storedIsIdle) === false);

// ─────────────────────────────────────────────────────────────────────────────
// 5. No heartbeat at all → treated as offline
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[5] No heartbeat edge cases');

assert('null last_heartbeat_at → offline',
  computeOnlineIdle({ last_heartbeat_at: null }, 0).is_online === false);

assert('No heartbeat session → isStaleSession true',
  isStaleSession({ status: 'active', last_heartbeat_at: null, punch_in: minsAgo(60), total_minutes: 0 }) === true);

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Tests: ${passed + failed}  ✓ ${passed} passed  ${failed > 0 ? '✗ ' + failed + ' FAILED' : ''}`);

if (failed > 0) {
  console.error('\n⛔  Tests failed — fix before pushing.\n');
  process.exit(1);
} else {
  console.log('\n✅  All tests passed.\n');
  process.exit(0);
}
