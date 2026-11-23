// Demo data so the app isn't empty on first run:  npm run seed
// Creates the people from the UI mock-up. Every demo account has the password:  fitfollow123
// Safe to run repeatedly (existing demo users are left alone). Wipe demo data with:  npm run seed -- --reset
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';
import { Friendship, pairKey } from '../src/models/Friendship.js';
import { Content } from '../src/models/Content.js';
import { StepEntry, FoodEntry, BodyEntry } from '../src/models/Tracking.js';
import { Session, PersonalRecord } from '../src/models/Workout.js';
import { Message } from '../src/models/Social.js';
import { purgeUser } from '../src/services/account.js';
import { seedFoods } from '../src/services/seedFoods.js';

const PASSWORD = 'fitfollow123';
// [username, displayName, isPublic]  - the last four are public accounts, matching the "Public" labels in the mock-up
const PEOPLE = [
  ['maya', 'Maya', false],
  ['jordan', 'Jordan', false],
  ['sam', 'Sam', false],
  ['priya', 'Priya', true],
  ['marcus', 'Marcus', true],
  ['elena', 'Elena', true],
  ['dev', 'Dev', true],
];
const FRIENDS_OF_MAYA = ['jordan', 'sam'];

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

if (process.argv.includes('--reset')) {
  const users = await User.find({ email: /@demo\.fitfollow$/ }, { _id: 1 }).lean();
  for (const u of users) await purgeUser(u._id);
  console.log(`Removed ${users.length} demo account(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

await seedFoods();
const passwordHash = await bcrypt.hash(PASSWORD, 10);
const byName = {};
for (const [username, displayName, isPublic] of PEOPLE) {
  byName[username] =
    (await User.findOne({ username })) ||
    (await User.create({ email: `${username}@demo.fitfollow`, username, displayName, passwordHash, isPublic }));
}

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const me = byName.maya;

for (const name of FRIENDS_OF_MAYA) {
  const key = pairKey(me._id, byName[name]._id);
  await Friendship.updateOne({ pairKey: key }, { $set: { users: [me._id, byName[name]._id], requester: me._id, status: 'FRIENDS' } }, { upsert: true });
}

if ((await Content.countDocuments({ author: { $in: Object.values(byName).map((u) => u._id) } })) === 0) {
  const mk = (u, type, text, audience) =>
    Content.create({ author: u._id, authorPublic: u.isPublic, type, text, audience, expiresAt: type === 'story' ? new Date(Date.now() + 20 * 3600 * 1000) : null });
  await mk(byName.jordan, 'post', 'New squat PR - 225 for 5 🔥', 'FRIENDS');
  await mk(byName.sam, 'post', 'Rest day walk, 12k steps.', 'FRIENDS');
  await mk(byName.priya, 'post', 'Sunday long run done. 10 miles!', 'PUBLIC');
  await mk(byName.marcus, 'post', 'Meal prep for the week 💪', 'PUBLIC');
  await mk(byName.jordan, 'story', 'Leg day 🦵', 'FRIENDS');
  await mk(byName.priya, 'story', 'Morning mobility flow', 'PUBLIC');
  await mk(byName.dev, 'story', 'Trying a new split this week', 'PUBLIC');
  await mk(me, 'post', 'Private note: felt strong today.', 'PRIVATE');
}