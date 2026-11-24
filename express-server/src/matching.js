// People search, "people you may like" suggestions, interest tags and the FITNESSQUIRK badge.
// Pure logic: no Express, no Mongoose. The database is INJECTED (see `db` below) so the same code runs against
// MongoDB in server.js and against an in-memory array in test/unit/matching.test.js.
//
// This is a transparent scoring recommender (shared interests, mutual friends, similar age / activity level), NOT a
// trained model. Each suggestion carries human-readable `reasons`, so it is easy to explain and easy to tune.
//
//   db.findUsers(filter, limit)      -> Promise<user[]>        Mongo-style filter, plain objects back
//   db.findFriendships(filter)       -> Promise<friendship[]>  { users:[a,b], status, requester, pairKey }
//   db.sampleUsers(filter, size)     -> Promise<user[]>        a random sample (cold-start filler)
// Ids are compared as strings everywhere.
import { escapeRegExp, pairKey } from './visibility.js';

/* ------------------------------------------------------------------ text normalising (search) */

const SPECIAL = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ł': 'l', 'ı': 'i' };

/** lower-case, strip accents ("José" -> "jose", "Müller" -> "muller", "Søren" -> "soren") so people can type plain letters */
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[øæœßđðþłı]/g, (c) => SPECIAL[c]);

/** Searchable copies of a user's names, kept on the user document and indexed (see User schema in server.js). */
export function searchFields(username, displayName) {
  const nameFolded = fold(displayName).trim();
  return {
    usernameLower: fold(username),
    nameFolded,
    nameTokens: [...new Set(nameFolded.split(/[^\p{L}\p{N}]+/u).filter(Boolean))],
  };
}

/* ------------------------------------------------------------------ interests (derived from a bio) */

// interest -> words that signal it. Matched on whole words, accents/case ignored.
export const INTERESTS = {
  lifting: ['lift', 'lifting', 'lifts', 'weights', 'weightlifting', 'powerlifting', 'bench', 'squat', 'squats', 'deadlift', 'deadlifts', 'barbell', 'strength', 'hypertrophy', 'bodybuilding', 'gym'],
  running: ['run', 'running', 'runner', 'runners', 'marathon', 'halfmarathon', '5k', '10k', 'jog', 'jogging', 'sprint', 'sprints', 'trail'],
  yoga: ['yoga', 'mobility', 'stretch', 'stretching', 'flexibility', 'pilates'],
  cycling: ['cycle', 'cycling', 'bike', 'biking', 'spin', 'peloton'],
  swimming: ['swim', 'swimming', 'laps', 'pool'],
  hiit: ['hiit', 'cardio', 'circuit', 'conditioning', 'tabata'],
  crossfit: ['crossfit', 'wod', 'olympic'],
  calisthenics: ['calisthenics', 'pullup', 'pullups', 'pushup', 'pushups', 'bodyweight', 'handstand', 'muscleup'],
  hiking: ['hike', 'hiking', 'hikes', 'trek', 'trekking', 'walking', 'walks'],
  nutrition: ['meal', 'prep', 'nutrition', 'protein', 'macros', 'calories', 'diet', 'cooking'],
  'weight loss': ['weightloss', 'fatloss', 'cutting', 'lose', 'losing'],
  bulking: ['bulk', 'bulking', 'gains', 'muscle'],
  boxing: ['box', 'boxing', 'kickboxing', 'mma', 'muay', 'bjj', 'jiujitsu', 'martial'],
  climbing: ['climb', 'climbing', 'bouldering'],
  'team sports': ['soccer', 'football', 'basketball', 'tennis', 'volleyball', 'rugby', 'hockey', 'cricket', 'sport', 'sports'],
  kettlebell: ['kettlebell', 'kettlebells'],
  recovery: ['recovery', 'sleep', 'massage', 'foam'],
};
const WORD_TO_INTEREST = new Map();
for (const [interest, ws] of Object.entries(INTERESTS)) for (const w of ws) if (!WORD_TO_INTEREST.has(w)) WORD_TO_INTEREST.set(w, interest);

/** "Chasing a 315 lb deadlift, run club on Sundays" -> ['lifting', 'running'] (max 6, stable order) */
export function extractInterests(text) {
  const found = new Set();
  for (const w of fold(text).match(/[a-z0-9]+/g) || []) {
    const hit = WORD_TO_INTEREST.get(w);
    if (hit) found.add(hit);
  }
  return [...found].sort().slice(0, 6);
}

/* ------------------------------------------------------------------ coarse bands (never exact age / weight / BMI) */

export const AGE_BUCKETS = ['18-24', '25-34', '35-44', '45-54', '55+'];
/** Under-18s get NO age bucket: they are never matched or indexed by age. */
export function ageBucket(age) {
  const n = Number(age);
  if (!Number.isFinite(n) || n < 18) return null;
  return n < 25 ? '18-24' : n < 35 ? '25-34' : n < 45 ? '35-44' : n < 55 ? '45-54' : '55+';
}
export const isMinorAge = (age) => Number.isFinite(Number(age)) && Number(age) < 18;

export const BMI_BANDS = ['underweight', 'healthy', 'overweight', 'obese'];
export const bmiBandFromCategory = (category) => {
  const b = String(category || '').toLowerCase();
  return BMI_BANDS.includes(b) ? b : null;
};

export const STEP_BANDS = ['low', 'moderate', 'high', 'very high'];
export function stepBand(avgSteps) {
  const n = Number(avgSteps);
  if (avgSteps === null || avgSteps === undefined || !Number.isFinite(n) || n < 0) return null;
  return n < 4000 ? 'low' : n < 8000 ? 'moderate' : n < 12000 ? 'high' : 'very high';
}

const near = (list, a, b) => (a && b ? Math.abs(list.indexOf(a) - list.indexOf(b)) : null);
const nearbyAgeBuckets = (b) => AGE_BUCKETS.filter((x) => near(AGE_BUCKETS, x, b) <= 1);

/* ------------------------------------------------------------------ FITNESSQUIRK badge */

const MAIN_LIFTS = [
  { name: 'Bench', re: /\bbench\b/ },
  { name: 'Squat', re: /\bsquats?\b/ },
  { name: 'Deadlift', re: /\bdeadlifts?\b/ },
  { name: 'Overhead Press', re: /\b(overhead press|ohp|shoulder press|military press)\b/ },
];
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, before, c) => before + c.toUpperCase());

/**
 * lifts: [{ exercise, weight }] = each exercise's heaviest set. Prefers the big four (the heaviest of those),
 * otherwise the heaviest anything. -> { name, weight } | null
 */
export function pickTopLift(lifts = []) {
  const real = lifts.filter((l) => l && l.exercise && Number(l.weight) > 0);
  let best = null;
  for (const l of real) {
    const f = fold(l.exercise);
    const main = MAIN_LIFTS.find((m) => m.re.test(f));
    if (!main) continue;
    if (!best || l.weight > best.weight) best = { name: main.name, weight: Number(l.weight) };
  }
  if (best) return best;
  for (const l of real) if (!best || l.weight > best.weight) best = { name: titleCase(String(l.exercise).trim()).slice(0, 24), weight: Number(l.weight) };
  return best;
}

/** Raw numbers pulled from the real collections -> the snapshot stored on the user (`stats`). */
export function statsFromRows({ lifts = [], sessions = 0, avgSteps = null, stepDays = 0, otherActivity = false } = {}, now = new Date()) {
  const topLift = pickTopLift(lifts);
  return {
    active: sessions > 0 || stepDays > 0 || otherActivity || Boolean(topLift),
    sessions,
    avgSteps: avgSteps === null || avgSteps === undefined ? null : Math.round(avgSteps),
    topLift,
    updatedAt: now,
  };
}

export const STATS_TTL_MS = 10 * 60 * 1000;
export const statsAreStale = (stats, now = Date.now()) => !stats?.updatedAt || now - new Date(stats.updatedAt).getTime() > STATS_TTL_MS;

const fmt = (n) => Number(n).toLocaleString('en-US');

/** One line for a profile / search card, from real stats. No activity at all -> "Yet to hit the gym". */
export function quirkFor(stats) {
  if (!stats || !stats.active) return 'Yet to hit the gym';
  if (stats.topLift?.weight > 0) return `${stats.topLift.name} PR: ${fmt(stats.topLift.weight)} lbs`;
  if (stats.avgSteps >= 1000) return `Averages ${fmt(Math.round(stats.avgSteps / 100) * 100)} steps a day`;
  if (stats.sessions > 0) return `${fmt(stats.sessions)} workout${stats.sessions === 1 ? '' : 's'} logged`;
  return 'Just getting started';
}

/* ------------------------------------------------------------------ what a card may show (privacy) */

/** Bios follow account visibility: strangers see a bio only on a PUBLIC account; friends always do. */
export const canShowBio = (target, isFriend = false) => Boolean(target?.isPublic || isFriend);

/**
 * The card other people see. Always: name, username, photo, relationship. Bio: public accounts / friends.
 * Badge: ONLY if the user switched on "App may publicly index my progress stats" (and is an adult).
 */
export function cardFor(u, { state = 'NONE', isFriend = false, reasons } = {}) {
  const card = { id: String(u._id), username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl || null, state };
  if (u.bio && canShowBio(u, isFriend)) card.bio = u.bio;
  if (u.statsIndexing === true && !u.isMinor) card.quirk = quirkFor(u.stats);
  if (reasons?.length) card.reasons = reasons;
  return card;
}

/* ------------------------------------------------------------------ scoring */

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Stable pseudo-random number in [0,1) for (viewer, candidate, day): ties shuffle daily but never flicker mid-day. */
export function jitter(viewerId, candidateId, day) {
  let h = 2166136261;
  for (const ch of `${viewerId}|${candidateId}|${day}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h / 4294967296;
}

/** The viewer's own signals. They may use their OWN stats for their own suggestions, indexing or not. */
export function signatureOf(u) {
  return {
    interests: new Set(u?.interests || []),
    ageBucket: u?.ageBucket || null,
    bmiBand: u?.bmiBand || null,
    stepBand: stepBand(u?.stats?.avgSteps),
  };
}

/**
 * Score one candidate for one viewer -> { score, reasons }.
 * Privacy: another person's interests count only if their bio is visible (public / friend), and their age, BMI and
 * step bands count only if THEY opted in to stats indexing. Reasons never reveal exact numbers.
 */
export function matchScore(sig, cand, { mutual = 0, isFriend = false, jit = 0 } = {}) {
  let score = jit * 0.8;
  const why = [];

  if (mutual > 0) {
    score += Math.min(mutual, 4) * 2.5;
    why.push([10 + mutual, `${mutual} mutual friend${mutual === 1 ? '' : 's'}`]);
  }
  if (canShowBio(cand, isFriend)) {
    const shared = (cand.interests || []).filter((i) => sig.interests.has(i));
    if (shared.length) {
      score += Math.min(shared.length, 4) * 3;
      why.push([9, `Also into ${shared.slice(0, 2).join(' & ')}`]);
    }
    if (cand.bio) score += 0.3;
  }
  if (cand.statsIndexing === true && !cand.isMinor) {
    const d = near(AGE_BUCKETS, sig.ageBucket, cand.ageBucket);
    if (d === 0) { score += 2; why.push([5, 'Similar age']); } else if (d === 1) { score += 1; why.push([4, 'Similar age']); }

    let fit = 0;
    if (sig.bmiBand && sig.bmiBand === cand.bmiBand) fit += 1;
    const sd = near(STEP_BANDS, sig.stepBand, stepBand(cand.stats?.avgSteps));
    if (sd === 0) fit += 1.5; else if (sd === 1) fit += 0.5;
    if (fit > 0) { score += fit; why.push([3, 'Similar activity level']); }
  }
  why.sort((a, b) => b[0] - a[0]);
  return { score, reasons: why.slice(0, 3).map((w) => w[1]) };
}

/* ------------------------------------------------------------------ queries */

/** My relationship rows for these users, keyed by pairKey. */
export async function relationsFor(db, meId, userIds) {
  if (!userIds.length) return new Map();
  const rows = await db.findFriendships({ users: meId, pairKey: { $in: userIds.map((id) => pairKey(meId, id)) } });
  return new Map(rows.map((f) => [f.pairKey, f]));
}

/**
 * Typed search, narrowing as the user types. Groups, best first:
 *   0 exact username  1 username starts with  2 a word of the name starts with  3 contains (username or name)
 * Inside a group the viewer's best matches come first, then A-Z. Steps 0-2 use indexes; step 3 only runs when
 * those did not already fill the list.
 */
export async function searchUsers(db, { q, viewer, limit = 100, day = dayKey() }) {
  const me = String(viewer._id);
  const needle = fold(String(q || '').replace(/^@/, '')).trim();
  if (!needle) return [];
  const compact = needle.replace(/\s+/g, '');
  const tokens = needle.split(/\s+/).filter(Boolean);
  const sig = signatureOf(viewer);

  const [byUser, byName] = await Promise.all([
    db.findUsers({ _id: { $ne: me }, usernameLower: { $regex: `^${escapeRegExp(compact)}` } }, limit),
    db.findUsers({ _id: { $ne: me }, $and: tokens.map((t) => ({ nameTokens: { $regex: `^${escapeRegExp(t)}` } })) }, limit),
  ]);

  const rows = new Map();
  const add = (u, group) => {
    const id = String(u._id);
    if (!rows.has(id)) rows.set(id, { user: u, group });
  };
  for (const u of byUser) add(u, u.usernameLower === compact ? 0 : 1);
  for (const u of byName) add(u, 2);

  if (rows.size < limit) {
    const rx = { $regex: escapeRegExp(needle) };
    const rxCompact = { $regex: escapeRegExp(compact) };
    const more = await db.findUsers({
      _id: { $nin: [me, ...rows.keys()] },
      $or: [{ usernameLower: rxCompact }, { nameFolded: rx }],
    }, limit - rows.size);
    for (const u of more) add(u, 3);
  }

  const out = [...rows.values()].map(({ user, group }) => {
    const { score, reasons } = matchScore(sig, user, { jit: jitter(me, user._id, day) });
    return { user, group, score, reasons };
  });
  out.sort((a, b) => a.group - b.group || b.score - a.score || String(a.user.usernameLower).localeCompare(String(b.user.usernameLower)));
  return out.slice(0, limit);
}

/**
 * "People you may like" for an empty search box. Candidates come from four cheap, indexed pools (shared interests,
 * similar age among people who opted in, friends-of-friends, and a random public sample so a brand-new user still
 * gets a full list), then every candidate is scored. People you already have a relationship with are left out, and so
 * are under-18s. Private accounts only appear via a mutual friend.
 */
export async function suggestUsers(db, { viewer, limit = 100, day = dayKey() }) {
  const me = String(viewer._id);
  const mine = await db.findFriendships({ users: me });
  const related = new Set([me]);
  const friendIds = new Set();
  for (const f of mine) {
    for (const id of f.users.map(String)) {
      if (id === me) continue;
      related.add(id);
      if (f.status === 'FRIENDS') friendIds.add(id);
    }
  }

  const mutual = new Map();
  if (friendIds.size) {
    const rows = await db.findFriendships({ users: { $in: [...friendIds].slice(0, 200) }, status: 'FRIENDS' });
    for (const f of rows) for (const id of f.users.map(String)) if (!related.has(id)) mutual.set(id, (mutual.get(id) || 0) + 1);
  }

  const sig = signatureOf(viewer);
  const base = { _id: { $nin: [...related] }, isMinor: { $ne: true } };
  const [byInterest, byAge, byMutual, filler] = await Promise.all([
    sig.interests.size ? db.findUsers({ ...base, isPublic: true, interests: { $in: [...sig.interests] } }, 500) : [],
    sig.ageBucket ? db.findUsers({ ...base, isPublic: true, statsIndexing: true, ageBucket: { $in: nearbyAgeBuckets(sig.ageBucket) } }, 300) : [],
    mutual.size ? db.findUsers({ _id: { $in: [...mutual.keys()].slice(0, 300) }, isMinor: { $ne: true } }, 300) : [],
    db.sampleUsers({ ...base, isPublic: true }, 150),
  ]);

  const pool = new Map();
  for (const u of [...byInterest, ...byAge, ...byMutual, ...filler]) pool.set(String(u._id), u);

  const out = [];
  for (const [id, user] of pool) {
    if (related.has(id) || user.isMinor) continue;
    const m = mutual.get(id) || 0;
    const { score, reasons } = matchScore(sig, user, { mutual: m, jit: jitter(me, id, day) });
    out.push({ user, group: 4, score, reasons });
  }
  out.sort((a, b) => b.score - a.score || String(a.user.usernameLower).localeCompare(String(b.user.usernameLower)));
  return out.slice(0, limit);
}
