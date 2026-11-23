// Pure helpers for scripts/seedPeople.js (no network, no database) so they can be unit-tested.

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/** Small seeded RNG (mulberry32): the same seed always makes the same people and posts. */
export function makeRng(seed = 'fitfollow') {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sanitizeUsername = (raw) => String(raw || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);

const titleCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/**
 * Profile photo for a demo person. randomuser.me serves real-looking portraits, but only ~100 men + ~100 women
 * exist, so across 5000 people faces repeat (about 25x each). For a TRULY unique picture per person, return
 *   `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(person.login.username)}`
 * instead (illustrated avatars, unlimited, deterministic) - this one function is the only thing to change.
 */
export const defaultAvatarFor = (person) => person?.picture?.large || person?.picture?.medium || null;

/**
 * randomuser.me `results[]` -> demo accounts. Skips usernames that are invalid or already taken
 * (`taken` is a Set of existing usernames; it is updated as we go so duplicates inside the batch are skipped too).
 * ~40% of people get a public account, the rest stay private (the app's default).
 */
export function toDemoPeople(results, { taken = new Set(), rng = makeRng(), avatarFor = defaultAvatarFor, publicShare = 0.4 } = {}) {
  const out = [];
  for (const r of results || []) {
    const username = sanitizeUsername(r?.login?.username);
    if (!USERNAME_RE.test(username) || taken.has(username)) continue;
    taken.add(username);
    const displayName = titleCase(`${r?.name?.first || ''} ${r?.name?.last || ''}`) || username;
    out.push({ username, displayName: displayName.slice(0, 40), avatarUrl: avatarFor(r), isPublic: rng() < publicShare });
  }
  return out;
}

const TEMPLATES = [
  (n) => `New bench PR today: ${n.w} lb for ${n.r}. Slow progress is still progress.`,
  (n) => `${n.steps} steps before lunch. Walking meetings are underrated.`,
  () => 'Leg day done. Stairs are now a negotiation.',
  () => 'Meal prepped chicken and rice for the week. Boring, but it works.',
  (n) => `Week ${n.wk} of showing up consistently. The hard part is the door, not the workout.`,
  (n) => `5k in ${n.m} minutes. Not fast, but faster than last month.`,
  () => 'Morning run before sunrise. Worth every yawn.',
  () => 'Pull-ups finally feel smooth. Back day is paying off.',
  (n) => `Hit my ${n.steps} step goal and then walked the dog for bonus steps.`,
  () => 'Rest day. Stretching, hydrating, and doing nothing on purpose.',
  (n) => `Squatted ${n.w} lb today. Form first, ego never.`,
  () => 'Tried a new protein shake recipe. 10/10, would blend again.',
  (n) => `Down ${n.lb} lb since I started tracking. Logging every day is the trick.`,
  () => 'Gym was packed so I did a full bodyweight session at home. No excuses.',
  () => 'Sunday long walk. Podcasts + sunshine = reset.',
  (n) => `Deadlift day: ${n.w} lb moved. Chalk everywhere.`,
  () => 'Anyone want to be gym buddies? Accountability helps me so much.',
  () => 'Yoga this morning. My hamstrings are filing a complaint.',
  (n) => `${n.m} minute HIIT session done. Never again (until tomorrow).`,
  () => 'Swapped soda for sparkling water this week. Small wins.',
];

/** 0-3 sample posts for a demo person. Private accounts can't post "public", so theirs are friends-only. */
export function postsFor(person, rng = makeRng(), now = Date.now()) {
  const count = person.isPublic ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 3);
  const posts = [];
  for (let i = 0; i < count; i++) {
    const n = {
      w: 95 + Math.floor(rng() * 28) * 5, r: 3 + Math.floor(rng() * 8), steps: (4 + Math.floor(rng() * 9)) * 1000,
      wk: 2 + Math.floor(rng() * 20), m: 18 + Math.floor(rng() * 20), lb: 2 + Math.floor(rng() * 25),
    };
    posts.push({
      text: TEMPLATES[Math.floor(rng() * TEMPLATES.length)](n),
      audience: person.isPublic && rng() < 0.75 ? 'PUBLIC' : 'FRIENDS',
      createdAt: new Date(now - Math.floor(rng() * 10 * 24 * 3600 * 1000)),
    });
  }
  return posts;
}