// Fills the app with sample people so search, friends and the Discover feed have something in them.
//   npm run seed:people                 -> 5000 people (the randomuser.me maximum), each with a profile photo
//   npm run seed:people -- --count=300  -> fewer
//   npm run seed:people -- --reset      -> remove every demo account, its posts and its friendships
// Needs internet (it asks https://randomuser.me for names/usernames/photos) and a running MongoDB.
// Safe to re-run: usernames that already exist are skipped. Demo accounts can't be signed into; they're flagged isDemo
// and automatically accept friend requests so you can try the whole flow with one real account.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { makeRng, toDemoPeople, postsFor } from '../src/demoPeople.js';

const args = process.argv.slice(2);
const COUNT = Math.min(5000, Math.max(1, Number(args.find((a) => a.startsWith('--count='))?.split('=')[1]) || 5000));
const PAGE = 1000; // randomuser.me allows up to 5000 per call; pages of 1000 are gentler and survive hiccups

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
const people = [];

for (let page = 1; people.length < COUNT; page++) {
  const want = Math.min(PAGE, COUNT - people.length);
  const url = `https://randomuser.me/api/?results=${PAGE}&page=${page}&seed=fitfollow&inc=name,login,picture&noinfo&nat=us,gb,ca,au,nz,ie`;
  let results;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results = (await res.json()).results;
  } catch (e) {
    console.error(`Couldn't fetch people from randomuser.me (${e.message}). Check your internet connection.`);
    process.exit(1);
  }
  if (!results?.length) break;
  people.push(...toDemoPeople(results, { taken, rng }).slice(0, want));
  if (page > 20) break; // safety net
}

const userDocs = [];
const postDocs = [];
for (const p of people) {
  const _id = new mongoose.Types.ObjectId();
  userDocs.push({
    _id, email: `${p.username}@demo.fitfollow`, username: p.username, displayName: p.displayName, password: unusableHash,
    role: 'user', isPublic: p.isPublic, defaultAudience: 'FRIENDS', avatarUrl: p.avatarUrl, isDemo: true, __v: 0,
  });
  for (const post of postsFor(p, rng)) {
    postDocs.push({ authorId: _id, author: { username: p.username }, audience: post.audience, text: post.text, cvStatus: null,
      photoStatus: 'none', authorPublic: p.isPublic, createdAt: post.createdAt, __v: 0 });
  }
}
for (let i = 0; i < userDocs.length; i += 1000) await users.insertMany(userDocs.slice(i, i + 1000), { ordered: false });
for (let i = 0; i < postDocs.length; i += 1000) await posts.insertMany(postDocs.slice(i, i + 1000), { ordered: false });

console.log(`Added ${userDocs.length} demo people (${userDocs.filter((u) => u.isPublic).length} public) and ${postDocs.length} posts.`);
console.log('Search for any name in the Friends tab. Public accounts\' public posts show up under Discover.');
await mongoose.disconnect();
