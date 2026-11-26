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

const BIOS = [
  'Chasing a 225 bench & 10k steps daily 💪',
  'Half-marathon training + high-protein meal prep',
  'Push/pull/legs split • consistency over perfection',
  'Morning runner, lifter, and macro tracker',
  'Building strength one PR at a time 🏋️',
  'Yoga, long walks, and clean home-cooked meals',
  '', // ~14% leave bio blank naturally
];

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
  () => 'Gym session locked in. Hydrating and staying consistent.',
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

const SHORT_PUMPS = [
  () => 'legs cooked',
  (n) => `5k in ${n.m} mins before class`,
  (n) => `new bench pr ${n.w}!!`,
  () => 'upper body done',
  () => 'chicken rice broccoli again lol',
  (n) => `hit ${n.steps} steps around campus today`,
  () => 'post-workout stretch + hydration',
];

const STORY_INTROS = [
  (n) => `Started week ${n.wk} of my new strength block today and honestly almost skipped the gym after a long morning.`,
  (n) => `Six months ago I could barely run a mile without stopping, and today I clocked a ${n.m}-minute 5k with gas left in the tank.`,
  (n) => `Switched from random workouts to tracking every lift and hitting 150g of protein daily, and the difference in recovery is wild.`,
];

const STORY_MIDDLES = [
  (n) => `Opened with ${n.w} lb squats for ${n.r} clean reps, followed by Romanian deadlifts, walking lunges, and core work. Keeping rest times strict at 90 seconds kept my heart rate up the whole session.`,
  (n) => `Prepped four days of grilled chicken, jasmine rice, roasted broccoli, and Greek yogurt bowls so busy weeknights don't derail my calorie target.`,
  (n) => `Logging sets and steps consistently has taken all the guesswork out of progress—even on days when energy feels average, showing up compounds fast.`,
];

const STORY_OUTROS = [
  () => 'If you are stuck on a plateau right now, dial in sleep, protein, and progressive overload for three weeks straight—your future self will thank you.',
  (n) => `Down ${n.lb} lb so far without cutting out foods I enjoy. Drop your favorite post-workout meal below so I can steal ideas for next week!`,
  () => 'Accountability on here keeps me honest every single week. Onto tomorrow’s session 💪',
];

const COMMENT_POOL = [
  'let’s go!! 🔥',
  'solid volume on those sets 💪',
  'consistency paying off big time',
  'that meal prep sounds elite',
  'huge PR, keep pushing!',
  'needed this motivation before my workout today',
  'form first always 🙌',
];

export function postsFor(person, rng = makeRng(), now = Date.now(), commenterPool = []) {
  const count = person.isPublic ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 3);
  const posts = [];
  for (let i = 0; i < count; i++) {
    const n = {
      w: 95 + Math.floor(rng() * 28) * 5, r: 3 + Math.floor(rng() * 8), steps: (4 + Math.floor(rng() * 9)) * 1000,
      wk: 2 + Math.floor(rng() * 20), m: 18 + Math.floor(rng() * 20), lb: 2 + Math.floor(rng() * 25),
    };
    const roll = rng();
    let text;
    if (roll < 0.35) {
      text = SHORT_PUMPS[Math.floor(rng() * SHORT_PUMPS.length)](n);
    } else if (roll < 0.72) {
      text = TEMPLATES[Math.floor(rng() * TEMPLATES.length)](n);
    } else {
      text = [
        STORY_INTROS[Math.floor(rng() * STORY_INTROS.length)](n),
        STORY_MIDDLES[Math.floor(rng() * STORY_MIDDLES.length)](n),
        STORY_OUTROS[Math.floor(rng() * STORY_OUTROS.length)](n),
      ].join(' ');
    }

    const createdAt = new Date(now - Math.floor(rng() * 10 * 24 * 3600 * 1000));
    const comments = [];
    if (commenterPool.length > 0 && rng() < 0.42) {
      const numComments = 1 + Math.floor(rng() * 3);
      for (let c = 0; c < numComments; c++) {
        const commenter = commenterPool[Math.floor(rng() * commenterPool.length)];
        if (commenter && commenter.username !== person.username) {
          comments.push({
            authorId: commenter._id,
            author: { username: commenter.username },
            text: COMMENT_POOL[Math.floor(rng() * COMMENT_POOL.length)],
            createdAt: new Date(createdAt.getTime() + (5 + Math.floor(rng() * 180)) * 60 * 1000),
          });
        }
      }
    }

    posts.push({
      text,
      audience: person.isPublic && rng() < 0.75 ? 'PUBLIC' : 'FRIENDS',
      createdAt,
      comments,
    });
  }
  return posts;
}
