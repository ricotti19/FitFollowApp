// Fills the app with sample people so search, friends and the Discover feed have something in them.
//   npm run seed:people                 -> 5000 people, each with a local AI portrait
//   npm run seed:people -- --count=300  -> fewer
//   npm run seed:people -- --reset      -> remove every demo account, its posts and its friendships
// Runs completely offline (except MongoDB) with zero external API calls.
// Safe to re-run: usernames that already exist are skipped. Demo accounts can't be signed into; they're flagged isDemo
// and automatically accept friend requests so you can try the whole flow with one real account.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { makeRng, toDemoPeople, postsFor } from '../src/demoPeople.js';

const args = process.argv.slice(2);
const COUNT = Math.min(5000, Math.max(1, Number(args.find((a) => a.startsWith('--count='))?.split('=')[1]) || 5000));

// Encode your downloaded .jpeg portraits from public/avatars/man and public/avatars/woman as base64 Data URLs
const loadAvatarUrls = (subDir) => {
  const dir = path.resolve('public/avatars', subDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && fs.statSync(path.join(dir, f)).size > 1000)
    .map((f) => `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`);
};

const manAvatars = loadAvatarUrls('man');
const womanAvatars = loadAvatarUrls('woman');

if (manAvatars.length === 0 && womanAvatars.length === 0) {
  console.error('No valid portraits found in public/avatars/man or public/avatars/woman!');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitfollow', { serverSelectionTimeoutMS: 8000 })
  .catch((e) => { console.error(`Can't reach MongoDB (${e.message}). Start it and try again.`); process.exit(1); });

// Raw collections on purpose: server.js owns the Mongoose models and starts a server when imported.
const db = mongoose.connection.db;
const users = db.collection('users');
const posts = db.collection('posts');
const friendships = db.collection('friendships');

if (args.includes('--reset')) {
  const ids = (await users.find({ isDemo: true }, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    await posts.deleteMany({ authorId: { $in: batch } });
    await friendships.deleteMany({ users: { $in: batch } });
    await users.deleteMany({ _id: { $in: batch } });
  }
  console.log(`Removed ${ids.length} demo account(s) and their posts/friendships.`);
  await mongoose.disconnect();
  process.exit(0);
}

const taken = new Set(await users.distinct('username'));
const rng = makeRng('fitfollow');
const unusableHash = await bcrypt.hash(crypto.randomUUID(), 10); // nobody knows the password -> demo accounts can't be logged into
const MALE_NAMES = [
  'Liam', 'Noah', 'Ethan', 'Mason', 'Lucas', 'Logan', 'Caleb', 'Nathan', 'Ryan', 'Dylan',
  'Aiden', 'Jack', 'Owen', 'Gabriel', 'Carter', 'Julian', 'Mateo', 'Leo', 'Isaac', 'Daniel',
  'Henry', 'Miles', 'Gavin', 'Evan', 'Lukas', 'Soren', 'Matteo', 'Sebastian', 'Henrik', 'Nico',
  'Kenji', 'Hiroshi', 'Minho', 'Jihoon', 'Wei', 'Jun', 'Bao', 'Minh', 'Haruto', 'Ren',
  'Kaito', 'Seojun', 'Doyoon', 'Hao', 'Zhi', 'Tuan', 'Riku', 'Hyun', 'Cheng', 'Daiki',
  'Arjun', 'Rohan', 'Dev', 'Samir', 'Kabir', 'Aarav', 'Vikram', 'Nikhil', 'Siddharth', 'Karan',
  'Kwame', 'Kofi', 'Tariq', 'Malik', 'Idris', 'Chidi', 'Tunde', 'Jelani', 'Jabari',
];

const FEMALE_NAMES = [
  'Emma', 'Olivia', 'Sophia', 'Ava', 'Mia', 'Isabella', 'Harper', 'Evelyn', 'Abigail', 'Emily',
  'Chloe', 'Zoe', 'Grace', 'Hannah', 'Aria', 'Nora', 'Lily', 'Ella', 'Sofia', 'Elena',
  'Claire', 'Tessa', 'Camila', 'Sienna', 'Freya', 'Astrid', 'Clara', 'Chiara', 'Lucia', 'Amelie',
  'Mei', 'Yuki', 'Hana', 'Sakura', 'Jisoo', 'Sora', 'Lin', 'Ling', 'Linh', 'Mai',
  'Aoi', 'Yuna', 'Eunji', 'Minji', 'Xinyi', 'Lan', 'Thao', 'Haruka', 'Nari', 'Jia',
  'Maya', 'Priya', 'Nadia', 'Aisha', 'Leila', 'Meera', 'Ananya', 'Kavya', 'Diya', 'Riya',
  'Amara', 'Nia', 'Imani', 'Zainab', 'Amina', 'Sade', 'Kemi', 'Makena', 'Eshe',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Thompson', 'White', 'Harris',
  'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres',
  'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Rossi', 'Conti', 'Lindqvist', 'Bergstrom', 'Kowalski', 'Novak', 'Dubois', 'Laurent', 'Mueller', 'Weber',
  'Chen', 'Wang', 'Li', 'Zhang', 'Liu', 'Kim', 'Park', 'Choi', 'Jung', 'Kang',
  'Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Nguyen', 'Tran', 'Le', 'Pham', 'Wong',
  'Patel', 'Sharma', 'Singh', 'Kumar', 'Gupta', 'Mehta', 'Reddy', 'Nair', 'Iyer', 'Desai',
  'Okafor', 'Mensah', 'Adeyemi', 'Diallo', 'Toure', 'Boateng', 'Bello', 'Nwosu', 'Kamau', 'Abubakar',
];

const allCombos = [];
for (const first of MALE_NAMES) {
  for (const last of LAST_NAMES) allCombos.push({ first, last, gender: 'man' });
}
for (const first of FEMALE_NAMES) {
  for (const last of LAST_NAMES) allCombos.push({ first, last, gender: 'woman' });
}
for (let i = allCombos.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [allCombos[i], allCombos[j]] = [allCombos[j], allCombos[i]];
}

const picked = allCombos.slice(0, COUNT);
const mockResults = picked.map((c, i) => ({
  name: { first: c.first, last: c.last },
  login: { username: `${c.first.toLowerCase()}${c.last.toLowerCase()}${100 + i}` },
  picture: { medium: '' },
}));

const people = toDemoPeople(mockResults, { taken, rng }).slice(0, COUNT);
const peopleWithIds = people.map((p) => ({
  ...p,
  gender: MALE_NAMES.includes((p.displayName || '').split(' ')[0]) ? 'man' : 'woman',
  _id: new mongoose.Types.ObjectId(),
}));
const userDocs = [];
const postDocs = [];
let manIdx = 0;
let womanIdx = 0;

peopleWithIds.forEach((p) => {
  const pool = p.gender === 'man' && manAvatars.length > 0 ? manAvatars : womanAvatars.length > 0 ? womanAvatars : manAvatars;
  const cursor = p.gender === 'man' ? manIdx++ : womanIdx++;
  const useInitial = cursor % 6 === 5; // ~83% AI portrait, ~17% initial monogram

  userDocs.push({
    _id: p._id,
    email: `${p.username}@demo.fitfollow`,
    username: p.username,
    displayName: p.displayName,
    bio: p.bio || '',
    password: unusableHash,
    role: 'user',
    isPublic: p.isPublic,
    defaultAudience: 'FRIENDS',
    avatarUrl: useInitial ? null : pool[cursor % pool.length],
    isDemo: true,
    __v: 0,
  });

  for (const post of postsFor(p, rng, Date.now(), peopleWithIds)) {
    postDocs.push({
      _id: new mongoose.Types.ObjectId(),
      authorId: p._id,
      author: { username: p.username },
      audience: post.audience,
      text: post.text,
      comments: (post.comments || []).map((c) => ({ _id: new mongoose.Types.ObjectId(), ...c })),
      cvStatus: null,
      photoStatus: 'none',
      authorPublic: p.isPublic,
      createdAt: post.createdAt,
      __v: 0,
    });
  }
});

for (let i = 0; i < userDocs.length; i += 1000) await users.insertMany(userDocs.slice(i, i + 1000), { ordered: false });
for (let i = 0; i < postDocs.length; i += 1000) await posts.insertMany(postDocs.slice(i, i + 1000), { ordered: false });

console.log(`Added ${userDocs.length} demo people (${userDocs.filter((u) => u.isPublic).length} public) and ${postDocs.length} posts using ${manAvatars.length} man + ${womanAvatars.length} woman AI portraits.`);
console.log('Search for any name in the Friends tab. Public accounts\' public posts show up under Discover.');
await mongoose.disconnect();
