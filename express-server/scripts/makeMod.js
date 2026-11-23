// Promote a registered user to moderator (they get the "Mod" tab: report queue + photo review queue).
//   npm run make-mod -- <username>
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';

const username = (process.argv[2] || '').toLowerCase().replace(/^@/, '');
if (!username) {
  console.error('Usage: npm run make-mod -- <username>');
  process.exit(1);
}

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
const r = await User.updateOne({ username }, { $set: { role: 'moderator' } });
console.log(r.matchedCount ? `@${username} is now a moderator. Sign out and back in to see the Mod tab.` : `No user named @${username}.`);
await mongoose.disconnect();