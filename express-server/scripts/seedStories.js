import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const loadMedia = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((f) => /\.(gif|jpe?g|png|webp)$/i.test(f) && fs.statSync(path.join(dirPath, f)).size > 1000)
    .map((f) => {
      const ext = path.extname(f).toLowerCase();
      const contentType = ext === '.gif' ? 'image/gif' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return { filename: f, isGif: ext === '.gif', data: fs.readFileSync(path.join(dirPath, f)), contentType };
    });
};

const womanMedia = loadMedia(path.resolve('public', 'stories', 'woman')).filter((m) => m.isGif).slice(0, 20);
const manMedia = loadMedia(path.resolve('public', 'stories', 'man')).filter((m) => m.isGif).slice(0, 20);

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitfollow');
const db = mongoose.connection.db;
const users = db.collection('users');
const stories = db.collection('stories');

const badUsers = await users.find({ displayName: { $not: /^[A-Z][a-z]+ [A-Z][a-z]+$/ }, isDemo: true }, { projection: { _id: 1 } }).toArray();
const badIds = badUsers.map((u) => u._id);
await stories.deleteMany({
  $or: [{ isSeededStory: true }, ...(badIds.length ? [{ authorId: { $in: badIds } }] : [])],
});

const MALE_FIRST = new Set([
  'Liam', 'Noah', 'Ethan', 'Mason', 'Lucas', 'Logan', 'Caleb', 'Nathan', 'Ryan', 'Dylan',
  'Aiden', 'Jack', 'Owen', 'Gabriel', 'Carter', 'Julian', 'Mateo', 'Leo', 'Isaac', 'Daniel',
  'Henry', 'Miles', 'Gavin', 'Evan', 'Lukas', 'Soren', 'Matteo', 'Sebastian', 'Henrik', 'Nico',
  'Kenji', 'Hiroshi', 'Minho', 'Jihoon', 'Wei', 'Jun', 'Bao', 'Minh', 'Haruto', 'Ren',
  'Kaito', 'Seojun', 'Doyoon', 'Hao', 'Zhi', 'Tuan', 'Riku', 'Hyun', 'Cheng', 'Daiki',
  'Arjun', 'Rohan', 'Dev', 'Samir', 'Kabir', 'Aarav', 'Vikram', 'Nikhil', 'Siddharth', 'Karan',
  'Kwame', 'Kofi', 'Tariq', 'Malik', 'Idris', 'Chidi', 'Tunde', 'Jelani', 'Jabari',
]);

const CAPTIONS = [
  'Morning lift check-in — form dialed in today!',
  'Quick conditioning finisher before heading out.',
  'Tempo reps and clean depth. Staying consistent.',
  'Locked in all week — zero shortcuts!',
  'Post-workout energy is unmatched.',
  'Evening mobility & strength session done!',
];

const demoUsers = await users
  .find(
    { isDemo: true, isPublic: true, displayName: { $regex: /^[A-Z][a-z]+ [A-Z][a-z]+$/ } },
    { projection: { _id: 1, username: 1, displayName: 1 } }
  )
  .toArray();

const men = demoUsers.filter((u) => MALE_FIRST.has((u.displayName || '').split(' ')[0]));
const women = demoUsers.filter((u) => !MALE_FIRST.has((u.displayName || '').split(' ')[0]));

const docs = [];
const now = Date.now();

women.forEach((u, i) => {
  const item = womanMedia[i % womanMedia.length];
  if (!item) return;
  docs.push({
    authorId: u._id,
    audience: 'PUBLIC',
    text: CAPTIONS[i % CAPTIONS.length],
    photo: { data: item.data, contentType: item.contentType },
    hasPhoto: true,
    viewers: [],
    reactions: [{ userId: new mongoose.Types.ObjectId(), username: 'fitcoach', emoji: '🔥' }],
    isSeededStory: true,
    createdAt: new Date(now - i * 3000),
  });
});

men.forEach((u, i) => {
  const item = manMedia[i % manMedia.length];
  if (!item) return;
  docs.push({
    authorId: u._id,
    audience: 'PUBLIC',
    text: CAPTIONS[(i + 2) % CAPTIONS.length],
    photo: { data: item.data, contentType: item.contentType },
    hasPhoto: true,
    viewers: [],
    reactions: [{ userId: new mongoose.Types.ObjectId(), username: 'gymrat', emoji: '💪' }],
    isSeededStory: true,
    createdAt: new Date(now - (i * 3000 + 1500)),
  });
});


for (let i = 0; i < docs.length; i += 200) {
  await stories.insertMany(docs.slice(i, i + 200), { ordered: false });
}

console.log(`Seeded ${docs.length} live 24h stories (${docs.filter((d) => d.photo.contentType === 'image/gif').length} moving GIFs)!`);
await mongoose.disconnect();
