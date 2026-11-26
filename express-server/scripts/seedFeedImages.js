// Attaches curated workout photos from public/feed/man and public/feed/woman
// onto existing gender-matched demo users so Discover & Home feeds come alive!
//   node scripts/seedFeedImages.js
//   node scripts/seedFeedImages.js --reset   -> remove seeded photo posts only
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const FOLDER_NAME = 'feed'; // folder next to public/avatars (expects public/feed/man & public/feed/woman)

const loadPhotos = (subDir) => {
  const dir = path.resolve('public', FOLDER_NAME, subDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && fs.statSync(path.join(dir, f)).size > 1000)
    .map((f) => {
      const ext = path.extname(f).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return {
        filename: f,
        data: fs.readFileSync(path.join(dir, f)),
        contentType,
      };
    });
};

const manPhotos = loadPhotos('man');
const womanPhotos = loadPhotos('woman');

if (manPhotos.length === 0 && womanPhotos.length === 0) {
  console.error(`No images found in public/${FOLDER_NAME}/man or public/${FOLDER_NAME}/woman!`);
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitfollow', {
  serverSelectionTimeoutMS: 8000,
}).catch((e) => {
  console.error(`Can't reach MongoDB (${e.message}). Start it and try again.`);
  process.exit(1);
});

const db = mongoose.connection.db;
const users = db.collection('users');
const posts = db.collection('posts');

if (process.argv.includes('--reset')) {
  const del = await posts.deleteMany({ isSeededPhoto: true });
  console.log(`Removed ${del.deletedCount} seeded photo post(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

const MALE_FIRST = new Set([
  'Liam', 'Noah', 'Ethan', 'Mason', 'Lucas', 'Logan', 'Caleb', 'Nathan', 'Ryan', 'Dylan',
  'Aiden', 'Jack', 'Owen', 'Gabriel', 'Carter', 'Julian', 'Mateo', 'Leo', 'Isaac', 'Daniel',
  'Henry', 'Miles', 'Gavin', 'Evan', 'Lukas', 'Soren', 'Matteo', 'Sebastian', 'Henrik', 'Nico',
  'Kenji', 'Hiroshi', 'Minho', 'Jihoon', 'Wei', 'Jun', 'Bao', 'Minh', 'Haruto', 'Ren',
  'Kaito', 'Seojun', 'Doyoon', 'Hao', 'Zhi', 'Tuan', 'Riku', 'Hyun', 'Cheng', 'Daiki',
  'Arjun', 'Rohan', 'Dev', 'Samir', 'Kabir', 'Aarav', 'Vikram', 'Nikhil', 'Siddharth', 'Karan',
  'Kwame', 'Kofi', 'Tariq', 'Malik', 'Idris', 'Chidi', 'Tunde', 'Jelani', 'Jabari',
]);

const CAPTION_BY_CATEGORY = {
  squats: [
    'Heavy squat session locked in — depth and control felt dialed in today.',
    'Leg day survived. Quads and glutes are completely toasted after those top sets.',
    'Slow eccentrics out of the hole on squats make all the difference.',
  ],
  deadlift: [
    'Deadlift form felt crisp off the floor today — chalk and focus.',
    'Posterior chain work done: heavy pulls without rushing the rest periods.',
    'Nothing beats the feeling of a clean top set on deadlifts.',
  ],
  bench: [
    'Upper body push day done: chest press felt super smooth and controlled.',
    'Added an extra rep on my top bench set today — progressive overload paying off.',
    'Focused on full range of motion and clean bar path on press day.',
  ],
  arms_shoulders: [
    'Shoulders and arms pump in the books. Feeling stronger every week.',
    'Dumbbell curls and lateral raises to finish off upper body day.',
    'Focused on mind-muscle connection and strict form on every dumbbell rep.',
  ],
  back_pull: [
    'Pull day complete — rows and lat pulldowns felt heavier than last week.',
    'Back width and posture work locked in before heading out.',
    'Strict reps on pull-ups and rows — zero momentum, all back.',
  ],
  outdoor_run: [
    'Outdoor tempo run complete — pacing felt effortless by mile two.',
    'Fresh air and miles logged before the day gets busy.',
    'Building aerobic endurance week by week on the trail.',
  ],
  treadmill_cardio: [
    'Indoor cardio session locked in — heart rate stayed right in zone 2.',
    'Incline treadmill finisher to wrap up today’s training.',
    'Steady-state cardio done. Stamina is noticeably improving.',
  ],
  cycling: [
    'High-cadence spin session done — legs are burning in the best way.',
    '45 minutes on the bike for clean low-impact endurance.',
    'Sweat equity paid in full on the bike today.',
  ],
  yoga_stretch: [
    'Mobility flow and deep stretching so tomorrow’s lifts feel smooth.',
    'Taking flexibility and hip openers just as seriously as heavy training.',
    'Mind-body reset and full-body stretch session locked in.',
  ],
  core_abs: [
    'Core stability and planks finished strong — no skipping abs.',
    '15-minute dedicated core circuit to wrap up the workout.',
    'Bracing and core control paying off across all my main lifts.',
  ],
  hiit_kettlebell: [
    'High-intensity conditioning circuit finished — lungs on fire.',
    'Kettlebell swings and explosive intervals to keep stamina sharp.',
    'Fast-paced conditioning session done in under 35 minutes.',
  ],
  group_class: [
    'Group workout energy is unmatched — pushed way harder with the crew.',
    'Packed studio session done. Always shows up when the room is buzzing.',
    'High-energy studio class in the books before noon.',
  ],
  meal_nutrition: [
    'Post-workout fuel dialed in: high protein and clean carbs.',
    'Meal prep paying off — staying right on top of macros all week.',
    'Nutrition is half the work. Clean, simple, and actually tastes great.',
  ],
  gym_selfie: [
    'Post-workout energy is unmatched. Staying locked in all week.',
    'Showed up, put in the work, and stayed hydrated.',
    'Consistency beats intensity every single week.',
  ],
  general: [
    'Morning training session locked in — progressive overload paying off.',
    'Stuck to the plan even on a busy day — 45 minutes in and out.',
    'Small daily habits compound faster than random intense workouts.',
  ],
  rest_recovery: [
    'Rest day locked in — foam rolling, hydrating, and letting the muscles grow.',
    'Recovery is where the actual progress happens. Taking today easy.',
    'Active recovery, electrolytes, and plenty of water before tomorrow’s lift.',
  ],
    sports: [
    'After-basketball cooldown and hydration — great run on the court today.',
    'Full-court cardio hit different today. Stretching out the legs now.',
    'Good game, solid sweat, and recovery mobility locked in.',
  ],
};

const OPENERS = [
  'ok bruh i almost hit snooze and skipped today ngl —',
  'ok so today i rolled my ankle walking to the gym, iced it for 10 mins, and still got it done:',
  'not me showing up 20 mins late with mismatched socks and still hitting a solid session —',
  'running on 4 hours of sleep, cold brew, and pure spite today:',
  'lowkey didn’t want to leave my couch after studying all day but',
  'pov: you told yourself "just a light 20-minute session" and blacked out for an hour —',
  'some guy hogged the only rack for 40 minutes scrolling TikTok so i improvised:',
  'playlist switched to 2010s throwback bangers mid-set and suddenly',
  'my trainer really looked me dead in the eye and said "one more round" —',
  'almost bailed because it was raining outside, glad i didn’t:',
  'pre-workout kicked in right in the parking lot so',
  'finally stopped overthinking my split and stuck to the basics:',
  'accountability check-in before i pass out:',
  '',
  '',
];

const CLOSERS = [
  'someone remind me to drink water and eat actual protein today.',
  'honestly 10/10 mood booster after a chaotic week.',
  'drop your go-to post-workout meal bc i am starving.',
  'slow progress is still progress, locking in for the rest of the week.',
  'feeling way stronger than last month ngl 🙌',
  'now time to shower and inhale a massive bowl of chicken and rice.',
  'my legs/arms are officially filing a complaint tomorrow morning lmao.',
  'if you needed a sign to stop doomscrolling and go move, this is it.',
  '10/10 would recommend even though i’m completely cooked rn.',
  '',
  '',
];

function buildNaturalCaption(category) {
  const middles = CAPTION_BY_CATEGORY[category] || CAPTION_BY_CATEGORY.general;
  const open = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  const mid = middles[Math.floor(Math.random() * middles.length)];
  const close = CLOSERS[Math.floor(Math.random() * CLOSERS.length)];
  const body = open ? `${open} ${mid.charAt(0).toLowerCase()}${mid.slice(1)}` : mid;
  return close ? `${body} ${close}` : body;
}


async function detectCategory(buffer, filename) {
  try {
    const fd = new FormData();
    fd.append('file', new Blob([buffer]), filename);
    const res = await fetch('http://localhost:8001/classify-activity', {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'general';
    const data = await res.json();
    return data.category || 'general';
  } catch {
    return 'general';
  }
}

// Grab public demo users so posts appear immediately in Discover (and Home once friended)
const demoUsers = await users.find({ isDemo: true, isPublic: true }, { projection: { _id: 1, username: 1, displayName: 1, isPublic: 1 } }).toArray();
const men = demoUsers.filter((u) => MALE_FIRST.has((u.displayName || '').split(' ')[0]));
const women = demoUsers.filter((u) => !MALE_FIRST.has((u.displayName || '').split(' ')[0]));

if (men.length === 0 && women.length === 0) {
  console.error('No public demo users found! Run `npm run seed:people` first.');
  await mongoose.disconnect();
  process.exit(1);
}

const postDocs = [];
const now = Date.now();


const allDemoUsers = await users.find({ isDemo: true }, { projection: { _id: 1, username: 1, displayName: 1, isPublic: 1 } }).toArray();
const allMen = allDemoUsers.filter((u) => MALE_FIRST.has((u.displayName || '').split(' ')[0]));
const allWomen = allDemoUsers.filter((u) => !MALE_FIRST.has((u.displayName || '').split(' ')[0]));
const allImgs = [...womanPhotos, ...manPhotos];

for (let i = 0; i < allImgs.length; i++) {
  allImgs[i].category = await detectCategory(allImgs[i].data, allImgs[i].filename);
  if ((i + 1) % 25 === 0 || i + 1 === allImgs.length) {
    console.log(`CLIP classified ${i + 1}/${allImgs.length} images...`);
  }
}

const buildForUsers = (userPool, photoList, gender) => {
  if (!photoList.length) return;
  userPool.forEach((author, idx) => {
    const img = photoList[idx % photoList.length];
    const createdAt = new Date(now - (idx * 3 + Math.floor(Math.random() * 3)) * 1000);
    postDocs.push({
      _id: new mongoose.Types.ObjectId(),
      authorId: author._id,
      author: { username: author.username },
      audience: author.isPublic ? 'PUBLIC' : 'FRIENDS',
      text: buildNaturalCaption(img.category),

      photo: { data: img.data, contentType: img.contentType },
      hasPhoto: true,
      cvStatus: 'approved',
      photoStatus: 'approved',
      authorPublic: Boolean(author.isPublic),
      comments: [],
      isSeededPhoto: true,
      gender,
      createdAt,
      __v: 0,
    });
  });
};

buildForUsers(allWomen, womanPhotos, 'woman');
buildForUsers(allMen, manPhotos, 'man');

// Shuffle so male & female workout posts alternate naturally in Discover
for (let i = postDocs.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [postDocs[i], postDocs[j]] = [postDocs[j], postDocs[i]];
}

for (let i = 0; i < postDocs.length; i += 50) {
  await posts.insertMany(postDocs.slice(i, i + 50), { ordered: false });
}

console.log(`Seeded ${postDocs.length} approved workout photo posts (${womanPhotos.length} woman + ${manPhotos.length} man) onto public demo accounts!`);
await mongoose.disconnect();
