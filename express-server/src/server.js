import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import jwt from 'jsonwebtoken';
import { AUDIENCES, pairKey, feedFilter, canViewPost, escapeRegExp, isValidAvatar } from './visibility.js';
import bcrypt from 'bcryptjs'
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { moderateCaption, moderateBio, moderateComment, MESSAGES, BIO_MESSAGES } from './moderation.js';
import { searchWgerExercises, isValidWgerExercise, inspectExercise, searchFormVideos } from './exercises.js';
import { makeRng, postsFor } from './demoPeople.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' })); // room for a small profile-photo data URL
app.use('/avatars', express.static('public/avatars'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 1. Connect to local MongoDB (same pattern as NrityaWeb)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitfollow', { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('MERN Stack: Connected to MongoDB (fitfollow)'))
  .catch((err) => console.error('MongoDB connection error (is mongod running?):', err.message));

// Quick "is it all wired up?" check:  curl localhost:4000/api/health
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
app.get('/api/health', async (req, res) => {
  const ready = mongoose.connection.readyState;
  res.json({ api: 'ok', db: DB_STATES[ready] || 'unknown', users: ready === 1 ? await User.countDocuments() : null });
});
// Without a database every route would hang ~10s and then fail vaguely; say what's wrong right away instead.
app.use('/api', (req, res, next) => (mongoose.connection.readyState === 1
  ? next()
  : res.status(503).json({ error: "Can't reach the database. Is MongoDB running?" })));

const User = mongoose.model('User', new mongoose.Schema({
  email: String,
  username: String,
  displayName: String,
  bio: { type: String, default: '' },
  password: String,
  phone: String,
  calorieGoal: { type: Number, default: 2200 },
  plan: { type: mongoose.Schema.Types.Mixed, default: null },
  role: { type: String, default: 'user' },
  isPublic: { type: Boolean, default: false },
  defaultAudience: { type: String, enum: AUDIENCES, default: 'FRIENDS' },
  avatarUrl: String,
  isDemo: { type: Boolean, default: false },
  allowStatsIndexing: { type: Boolean, default: false },
  dismissedSuggestions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
}));

const StepLog = mongoose.model('StepLog', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  day: String, steps: Number
}));
const FoodLog = mongoose.model('FoodLog', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  day: String, name: String, calories: Number, protein: Number, carbs: Number, fat: Number
}));

const WorkoutSession = mongoose.model('WorkoutSession', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  exercise: String,
  name: String,
  activityType: { type: String, default: 'strength' }, // 'weighted_strength' | 'bodyweight_strength' | 'cardio_speed' | 'movement_duration'
  weight: Number,
  reps: Number,
  sets: Number,
  minutes: Number,
  speedMph: Number,
  createdAt: { type: Date, default: Date.now },
}));

const WorkoutPreset = mongoose.model('WorkoutPreset', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name: String,
}));

const BodyMetric = mongoose.model('BodyMetric', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  day: String, weight: Number, waist: Number, chest: Number, hip: Number, arm: Number, thigh: Number
}));

const Post = mongoose.model('Post', new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  author: { username: String }, audience: String, text: String, cvStatus: String,
  photoStatus: { type: String, default: 'none' },
  photo: { data: Buffer, contentType: String },
  authorPublic: { type: Boolean, default: false },
    comments: [{
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    author: { username: String },
    text: String,
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now }
}));

Post.collection.createIndex({ createdAt: -1 }).catch(() => {});

// One document per PAIR of users, whichever direction the request went (see pairKey in visibility.js).
//   PENDING = `requester` asked, the other person hasn't answered. FRIENDS = accepted.
//   Declining, cancelling and unfriending all just delete the document.
const Friendship = mongoose.model('Friendship', new mongoose.Schema({
  pairKey: { type: String, required: true, unique: true },
  users: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], index: true }, // [a, b]
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['PENDING', 'FRIENDS'], default: 'PENDING' },
}, { timestamps: true }));

// Direct messages between two friends. `pairKey` is the same key the Friendship uses,
// so one query returns the whole conversation no matter who sent what.
const messageSchema = new mongoose.Schema({
  pairKey: { type: String, required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
messageSchema.index({ pairKey: 1, createdAt: -1 });
const Message = mongoose.model('Message', messageSchema);

const Story = mongoose.model('Story', new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  audience: { type: String, enum: ['FRIENDS', 'PUBLIC'], default: 'FRIENDS' },
  text: { type: String, default: '' },
  photo: { data: Buffer, contentType: String },
  hasPhoto: { type: Boolean, default: false },
  viewers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    viewedAt: { type: Date, default: Date.now },
  }],
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    emoji: String,
  }],
  createdAt: { type: Date, default: Date.now, expires: 86400 },
}));
Story.collection.createIndex({ createdAt: -1 }).catch(() => {});


// Older posts were saved with only author.username; give them an authorId once the DB is up.
mongoose.connection.once('open', async () => {
  try {
    const names = await Post.distinct('author.username', { authorId: { $exists: false } });
    for (const name of names) {
      const u = await User.findOne({ username: name }, '_id').lean();
      if (u) 
        await Post.updateMany({ authorId: { $exists: false }, 'author.username': name }, { authorId: u._id });
    }
    await Post.updateMany({ authorPublic: { $exists: false } }, { authorPublic: false });
  } catch (e) { console.warn('post backfill skipped:', e.message); }
});

// ---- CV service (Python/Flask in ../server, started with `python app.py`) ----
const CV_URL = (process.env.CV_SERVICE_URL || 'http://127.0.0.1:8001').trim().replace(/\/+$/, '');
const CV_APPROVE = Number(process.env.CV_APPROVE ?? 0.6);
const CV_REVIEW = Number(process.env.CV_REVIEW ?? 0.4);

// -> { outcome: 'approved' | 'review' | 'rejected', confidence, mode, note }
async function checkPhoto(file) {
  if (process.env.CV_ENABLED === 'false') return { outcome: 'approved', note: 'CV check disabled' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const fd = new FormData();
    fd.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'photo.jpg');
    const headers = process.env.CV_TOKEN ? { 'x-cv-token': process.env.CV_TOKEN } : {};
    const r = await fetch(`${CV_URL}/classify`, { method: 'POST', body: fd, headers, signal: controller.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || typeof d.confidence !== 'number') {
      console.warn(`[cv] ${CV_URL}/classify answered ${r.status}:`, d.error || d);
      return { outcome: 'review', note: `CV service error (${d.error || r.status}) - saved for manual mod review` };
    }
    const pct = Math.round(d.confidence * 100);
    const note = `CV confidence ${pct}% (${d.mode})`;
    // fail-closed: without a detected person a photo is never auto-approved
    if (d.confidence >= CV_APPROVE && d.poseFound !== false) return { outcome: 'approved', confidence: d.confidence, mode: d.mode, note };
    if (d.confidence >= CV_REVIEW) return { outcome: 'review', confidence: d.confidence, mode: d.mode, note };
    return { outcome: 'rejected', confidence: d.confidence, mode: d.mode, note };
  } catch (e) {
    console.warn(`[cv] could not reach ${CV_URL}: ${e.message}`);
    return { outcome: 'review', note: 'CV service offline - saved for manual mod review' };
  } finally {
    clearTimeout(timer);
  }
}

async function isSupportiveText(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(`${CV_URL}/classify-comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!r.ok) return true; // local moderateComment() already ran; fail-open if CV service is sleeping/unavailable
    const d = await r.json();
    return d.allowed !== false;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}

const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;
const foodCache = new Map();

function normalizeFood(item, idx = 0) {
  const n = item?.nutrients || item?.nutriments || {};
  const calories = Number(item?.calories ?? n?.calories ?? n?.['energy-kcal_100g'] ?? n?.['energy-kcal_serving'] ?? 0);
  const protein = Number(item?.protein ?? n?.protein ?? n?.proteins_100g ?? n?.proteins_serving ?? 0);
  const carbs = Number(item?.carbs ?? n?.carbs ?? n?.carbohydrates_100g ?? n?.carbohydrates_serving ?? 0);
  const fat = Number(item?.fat ?? n?.fat ?? n?.fat_100g ?? n?.fat_serving ?? 0);
  const name = String(item?.name || item?.product_name || item?.description || '').trim();
  if (!name) return null;
  return {
    id: String(item?.id || item?.code || `ext-${idx}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
    name,
    calories: round1(calories),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    source: item?.source || 'external',
  };
}

async function searchExternalFoods(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const cached = foodCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.items;

  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,nutriments,serving_size`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FitFollowApp/1.0 (local dev)' },
    });
    if (!res.ok) throw new Error(`OpenFoodFacts ${res.status}`);
    const data = await res.json();
    const items = (data.products || [])
      .map((p, i) => normalizeFood({
        ...p,
        name: p.product_name ? `${p.product_name}${p.serving_size ? ` (${p.serving_size})` : ''}` : '',
        source: 'openfoodfacts',
      }, i))
      .filter((f) => f && (f.calories > 0 || f.protein > 0 || f.carbs > 0 || f.fat > 0))
      .slice(0, 15);
    foodCache.set(key, { at: Date.now(), items });
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const BUILTIN_FOODS = [
  { id: 'f1', name: 'Grilled Chicken Breast (100g)', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: 'f2', name: 'Brown Rice, cooked (1 cup)', calories: 216, protein: 5, carbs: 45, fat: 1.8 },
  { id: 'f3', name: 'Whey Protein Shake (1 scoop)', calories: 120, protein: 24, carbs: 3, fat: 1.5 },
  { id: 'f4', name: 'Egg, large (1)', calories: 72, protein: 6, carbs: 0.4, fat: 5 },
  { id: 'f5', name: 'Egg Whites (100g)', calories: 52, protein: 11, carbs: 0.7, fat: 0.2 },
  { id: 'f6', name: 'Oatmeal, cooked (1 cup)', calories: 158, protein: 6, carbs: 27, fat: 3.2 },
  { id: 'f7', name: 'Greek Yogurt, plain nonfat (170g)', calories: 100, protein: 17, carbs: 6, fat: 0.7 },
  { id: 'f8', name: 'Banana (1 medium)', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { id: 'f9', name: 'Apple (1 medium)', calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { id: 'f10', name: 'Salmon, baked (100g)', calories: 208, protein: 20, carbs: 0, fat: 13 },
  { id: 'f11', name: 'Ground Beef 90% lean (100g)', calories: 176, protein: 20, carbs: 0, fat: 10 },
  { id: 'f12', name: 'Turkey Breast (100g)', calories: 135, protein: 30, carbs: 0, fat: 1 },
  { id: 'f13', name: 'Tuna, canned in water (100g)', calories: 116, protein: 26, carbs: 0, fat: 0.8 },
  { id: 'f14', name: 'Shrimp, cooked (100g)', calories: 99, protein: 24, carbs: 0.2, fat: 0.3 },
  { id: 'f15', name: 'Tofu, firm (100g)', calories: 144, protein: 17, carbs: 3, fat: 9 },
  { id: 'f16', name: 'Sweet Potato, baked (1 medium)', calories: 103, protein: 2.3, carbs: 24, fat: 0.2 },
  { id: 'f17', name: 'White Rice, cooked (1 cup)', calories: 206, protein: 4.3, carbs: 45, fat: 0.4 },
  { id: 'f18', name: 'Quinoa, cooked (1 cup)', calories: 222, protein: 8, carbs: 39, fat: 3.6 },
  { id: 'f19', name: 'Whole Wheat Bread (1 slice)', calories: 81, protein: 4, carbs: 14, fat: 1.1 },
  { id: 'f20', name: 'Sourdough Bread (1 slice)', calories: 93, protein: 4, carbs: 18, fat: 0.6 },
  { id: 'f21', name: 'Bagel, plain (1)', calories: 245, protein: 10, carbs: 48, fat: 1.5 },
  { id: 'f22', name: 'Pasta, cooked (1 cup)', calories: 220, protein: 8, carbs: 43, fat: 1.3 },
  { id: 'f23', name: 'Avocado (1/2 medium)', calories: 120, protein: 1.5, carbs: 6, fat: 11 },
  { id: 'f24', name: 'Broccoli, steamed (1 cup)', calories: 55, protein: 3.7, carbs: 11, fat: 0.6 },
  { id: 'f25', name: 'Spinach, raw (2 cups)', calories: 14, protein: 1.7, carbs: 2.2, fat: 0.2 },
  { id: 'f26', name: 'Mixed Salad Greens (2 cups)', calories: 20, protein: 1.5, carbs: 3.5, fat: 0.2 },
  { id: 'f27', name: 'Blueberries (1 cup)', calories: 84, protein: 1.1, carbs: 21, fat: 0.5 },
  { id: 'f28', name: 'Strawberries (1 cup)', calories: 53, protein: 1.1, carbs: 13, fat: 0.5 },
  { id: 'f29', name: 'Orange (1 medium)', calories: 62, protein: 1.2, carbs: 15, fat: 0.2 },
  { id: 'f30', name: 'Grapes (1 cup)', calories: 104, protein: 1.1, carbs: 27, fat: 0.2 },
  { id: 'f31', name: 'Almonds (28g)', calories: 164, protein: 6, carbs: 6, fat: 14 },
  { id: 'f32', name: 'Peanut Butter (2 tbsp)', calories: 188, protein: 8, carbs: 6, fat: 16 },
  { id: 'f33', name: 'Walnuts (28g)', calories: 185, protein: 4.3, carbs: 3.9, fat: 18 },
  { id: 'f34', name: 'Chia Seeds (2 tbsp)', calories: 138, protein: 4.7, carbs: 12, fat: 8.7 },
  { id: 'f35', name: 'Olive Oil (1 tbsp)', calories: 119, protein: 0, carbs: 0, fat: 14 },
  { id: 'f36', name: 'Whole Milk (1 cup)', calories: 149, protein: 8, carbs: 12, fat: 8 },
  { id: 'f37', name: 'Skim Milk (1 cup)', calories: 83, protein: 8, carbs: 12, fat: 0.2 },
  { id: 'f38', name: 'Almond Milk, unsweetened (1 cup)', calories: 30, protein: 1, carbs: 1, fat: 2.5 },
  { id: 'f39', name: 'Cheddar Cheese (28g)', calories: 113, protein: 7, carbs: 0.4, fat: 9 },
  { id: 'f40', name: 'Cottage Cheese, low-fat (1/2 cup)', calories: 81, protein: 14, carbs: 3, fat: 1.1 },
  { id: 'f41', name: 'Mozzarella, part-skim (28g)', calories: 72, protein: 7, carbs: 1, fat: 4.5 },
  { id: 'f42', name: 'Black Beans, cooked (1/2 cup)', calories: 114, protein: 7.6, carbs: 20, fat: 0.5 },
  { id: 'f43', name: 'Lentils, cooked (1 cup)', calories: 230, protein: 18, carbs: 40, fat: 0.8 },
  { id: 'f44', name: 'Chickpeas, cooked (1/2 cup)', calories: 134, protein: 7.3, carbs: 22, fat: 2.1 },
  { id: 'f45', name: 'Edamame, shelled (1/2 cup)', calories: 94, protein: 9, carbs: 7, fat: 4 },
  { id: 'f46', name: 'Protein Bar (1 bar)', calories: 200, protein: 20, carbs: 22, fat: 7 },
  { id: 'f47', name: 'Hummus (2 tbsp)', calories: 70, protein: 2, carbs: 8, fat: 5 },
  { id: 'f48', name: 'White Potato, baked (1 medium)', calories: 161, protein: 4.3, carbs: 37, fat: 0.2 },
  { id: 'f49', name: 'Green Beans (1 cup)', calories: 44, protein: 2.4, carbs: 10, fat: 0.4 },
  { id: 'f50', name: 'Asparagus (6 spears)', calories: 20, protein: 2.2, carbs: 3.7, fat: 0.2 },
  { id: 'f51', name: 'Carrots, raw (1 medium)', calories: 25, protein: 0.5, carbs: 6, fat: 0.1 },
  { id: 'f52', name: 'Tomato (1 medium)', calories: 22, protein: 1.1, carbs: 4.8, fat: 0.2 },
  { id: 'f53', name: 'Cucumber (1 cup sliced)', calories: 16, protein: 0.7, carbs: 3.8, fat: 0.1 },
  { id: 'f54', name: 'Bell Pepper (1 medium)', calories: 31, protein: 1, carbs: 6, fat: 0.3 },
  { id: 'f55', name: 'Onion (1/2 cup chopped)', calories: 32, protein: 0.9, carbs: 7.5, fat: 0.1 },
  { id: 'f56', name: 'Mushrooms (1 cup sliced)', calories: 15, protein: 2.2, carbs: 2.3, fat: 0.2 },
  { id: 'f57', name: 'Zucchini (1 cup sliced)', calories: 21, protein: 1.5, carbs: 3.9, fat: 0.4 },
  { id: 'f58', name: 'Cauliflower (1 cup)', calories: 27, protein: 2.1, carbs: 5.3, fat: 0.3 },
  { id: 'f59', name: 'Corn (1/2 cup)', calories: 67, protein: 2.5, carbs: 16, fat: 0.5 },
  { id: 'f60', name: 'Peas, green (1/2 cup)', calories: 62, protein: 4.1, carbs: 11, fat: 0.2 },
  { id: 'f61', name: 'Apple Sauce, unsweetened (1/2 cup)', calories: 52, protein: 0.2, carbs: 14, fat: 0.1 },
  { id: 'f62', name: 'Honey (1 tbsp)', calories: 64, protein: 0.1, carbs: 17, fat: 0 },
  { id: 'f63', name: 'Maple Syrup (1 tbsp)', calories: 52, protein: 0, carbs: 13, fat: 0 },
  { id: 'f64', name: 'Dark Chocolate 70% (28g)', calories: 170, protein: 2.2, carbs: 13, fat: 12 },
  { id: 'f65', name: 'Granola (1/2 cup)', calories: 200, protein: 5, carbs: 32, fat: 6 },
  { id: 'f66', name: 'Pancakes (2 medium)', calories: 175, protein: 5, carbs: 30, fat: 4 },
  { id: 'f67', name: 'French Toast (1 slice)', calories: 159, protein: 5, carbs: 20, fat: 6.7 },
  { id: 'f68', name: 'Bacon (2 slices)', calories: 86, protein: 6, carbs: 0.2, fat: 6.6 },
  { id: 'f69', name: 'Ham, sliced (56g)', calories: 60, protein: 10, carbs: 1, fat: 2 },
  { id: 'f70', name: 'Pork Chop, cooked (100g)', calories: 209, protein: 26, carbs: 0, fat: 11 },
  { id: 'f71', name: 'Steak, sirloin (100g)', calories: 183, protein: 27, carbs: 0, fat: 8 },
  { id: 'f72', name: 'Lamb, lean (100g)', calories: 206, protein: 28, carbs: 0, fat: 10 },
  { id: 'f73', name: 'Cod, baked (100g)', calories: 105, protein: 23, carbs: 0, fat: 0.9 },
  { id: 'f74', name: 'Tilapia (100g)', calories: 128, protein: 26, carbs: 0, fat: 2.7 },
  { id: 'f75', name: 'Sardines, canned (92g)', calories: 191, protein: 23, carbs: 0, fat: 11 },
  { id: 'f76', name: 'Greek Salad (1 serving)', calories: 180, protein: 5, carbs: 10, fat: 14 },
  { id: 'f77', name: 'Caesar Salad (1 serving)', calories: 190, protein: 7, carbs: 8, fat: 14 },
  { id: 'f78', name: 'Chicken Caesar Wrap (1 wrap)', calories: 430, protein: 32, carbs: 38, fat: 16 },
  { id: 'f79', name: 'Turkey Sandwich (1 sandwich)', calories: 320, protein: 24, carbs: 38, fat: 8 },
  { id: 'f80', name: 'Veggie Burger Patty (1 patty)', calories: 124, protein: 11, carbs: 10, fat: 4.4 },
  { id: 'f81', name: 'Beef Burger Patty (100g)', calories: 250, protein: 26, carbs: 0, fat: 17 },
  { id: 'f82', name: 'Pizza, cheese (1 slice)', calories: 285, protein: 12, carbs: 36, fat: 10 },
  { id: 'f83', name: 'Sushi Roll, California (6 pcs)', calories: 255, protein: 9, carbs: 38, fat: 7 },
  { id: 'f84', name: 'Burrito Bowl, chicken (1 bowl)', calories: 550, protein: 42, carbs: 55, fat: 18 },
  { id: 'f85', name: 'Tacos, chicken (2 tacos)', calories: 320, protein: 24, carbs: 30, fat: 12 },
  { id: 'f86', name: 'Ramen (1 bowl)', calories: 436, protein: 18, carbs: 60, fat: 14 },
  { id: 'f87', name: 'Miso Soup (1 cup)', calories: 40, protein: 3, carbs: 5, fat: 1 },
  { id: 'f88', name: 'Fruit Smoothie (12 oz)', calories: 220, protein: 5, carbs: 48, fat: 2 },
  { id: 'f89', name: 'Protein Smoothie (16 oz)', calories: 350, protein: 35, carbs: 40, fat: 6 },
  { id: 'f90', name: 'Coffee, black (1 cup)', calories: 2, protein: 0.3, carbs: 0, fat: 0 },
  { id: 'f91', name: 'Latte, whole milk (12 oz)', calories: 190, protein: 10, carbs: 18, fat: 7 },
  { id: 'f92', name: 'Orange Juice (1 cup)', calories: 112, protein: 2, carbs: 26, fat: 0.5 },
  { id: 'f93', name: 'Green Tea (1 cup)', calories: 2, protein: 0, carbs: 0, fat: 0 },
  { id: 'f94', name: 'Coconut Water (1 cup)', calories: 46, protein: 1.7, carbs: 9, fat: 0.5 },
  { id: 'f95', name: 'Rice Cakes (2 cakes)', calories: 70, protein: 1.5, carbs: 15, fat: 0.5 },
  { id: 'f96', name: 'Popcorn, air-popped (3 cups)', calories: 93, protein: 3, carbs: 19, fat: 1.1 },
  { id: 'f97', name: 'Trail Mix (1/4 cup)', calories: 173, protein: 5, carbs: 16, fat: 11 },
  { id: 'f98', name: 'Ice Cream, vanilla (1/2 cup)', calories: 137, protein: 2.3, carbs: 16, fat: 7 },
  { id: 'f99', name: 'Cheesecake (1 slice)', calories: 321, protein: 6, carbs: 26, fat: 22 },
  { id: 'f100', name: 'Pancake Syrup (2 tbsp)', calories: 102, protein: 0, carbs: 27, fat: 0 }
];

// ---- Auth: every protected request carries `Authorization: Bearer <jwt>`; req.user is who is asking ----
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-only-secret');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set in production.');
const toPublicUser = (u) => ({ 
  id: String(u._id), 
  username: u.username, 
  displayName: u.displayName, 
  bio: u.bio || '',
  email: u.email, 
  calorieGoal: u.calorieGoal || 2200,
  avatarUrl: u.avatarUrl || null,
  isPublic: Boolean(u.isPublic),
  defaultAudience: u.defaultAudience || 'FRIENDS',
  allowStatsIndexing: Boolean(u.allowStatsIndexing),
});
const PROFILE_FIELDS = 'username displayName bio email calorieGoal plan avatarUrl isPublic defaultAudience allowStatsIndexing';
const signToken = (u) => jwt.sign({ sub: String(u._id) }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });

async function requireAuth(req, res, next) {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Please sign in.' });
    const { sub } = jwt.verify(m[1], JWT_SECRET);
    const u = mongoose.isValidObjectId(sub) ? await User.findById(sub, PROFILE_FIELDS).lean() : null;
    if (!u) return res.status(401).json({ error: 'Please sign in again.' });
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}


// Auth
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function emailProblem(value) {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!email) return 'Email is required.';
  if (email.length > 254) return 'That email is too long.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address, e.g. you@example.com.';
  return null;
}

function passwordProblem(value) {
  const password = typeof value === 'string' ? value : '';
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const username = String(req.body?.username || '').trim();
    const displayName = String(req.body?.displayName || '').trim() || username;
    const password = String(req.body?.password || '');
    const phone = String(req.body?.phone || '').trim();

    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Enter a valid phone, e.g. +15551234567.' });
    }

    const emailErr = emailProblem(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 letters, numbers or underscores.' });
    }

    if (!moderateComment(username).allowed || !moderateComment(displayName).allowed) {
      return res.status(400).json({ error: 'Please choose an appropriate username and display name.' });
    }

    const passErr = passwordProblem(password);
    if (passErr) return res.status(400).json({ error: passErr });

    const taken = await User.findOne({ $or: [{ email }, { username }] });
    if (taken) {
      return res.status(409).json({
        error: taken.email === email
          ? 'An account with that email already exists.'
          : 'That username is already taken.',
      });
    }

    const rawGoal = Number(req.body?.calorieGoal);
    const calorieGoal = Number.isFinite(rawGoal) && rawGoal >= 1000 && rawGoal <= 6000 ? Math.round(rawGoal) : 2200;
    const plan = req.body?.plan && typeof req.body.plan === 'object' ? req.body.plan : null;
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await User.create({ email, username, displayName, password: hashedPassword, phone: phone || undefined, calorieGoal, plan });
    res.status(201).json({ token: signToken(u), user: toPublicUser(u) });
  } catch (err) {
    console.error('register failed:', err);
    res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const emailErr = emailProblem(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
    if (!password) return res.status(400).json({ error: 'Password is required.' });

    const u = await User.findOne({ email });
    if (!u) return res.status(401).json({ error: 'No account found for that email.' });
    const isMatch = await bcrypt.compare(password, u.password);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password.' });

    res.json({ token: signToken(u), user: toPublicUser(u) });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
});


/* ---------- password reset ---------- */
const resetCodes = new Map(); // `${channel}:${email}` -> { code, expires, attempts }
const RESET_TTL_MS = 10 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));

// Replace the console.log with nodemailer (email) / Twilio (SMS) when you have credentials.
let mailer;
function getMailer() {
  if (mailer) return mailer;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return mailer;
}

let smsClient;
function getSms() {
  if (smsClient) return smsClient;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  smsClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return smsClient;
}

async function sendEmailCode({ email, code }) {
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#101544">
      <p>Your FitFollow password reset code is</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:12px 0">${code}</p>
      <p style="color:#555">It expires in 10 minutes. If this wasn't you, ignore this email.</p>
    </div>`;

  // Use Brevo's HTTPS API on port 443 when configured (Render free tier blocks outbound SMTP port 587)
  const apiKey = process.env.BREVO_API_KEY || (process.env.SMTP_PASS?.startsWith('xkeysib-') ? process.env.SMTP_PASS : '');
  if (apiKey) {
    const rawFrom = String(process.env.MAIL_FROM || process.env.SMTP_USER || '').trim();
    const m = /^(.*)<([^>]+)>$/.exec(rawFrom);
    const sender = m ? { name: m[1].trim().replace(/^"|"$/g, '') || 'FitFollow', email: m[2].trim() } : { name: 'FitFollow', email: rawFrom };
    const r = await fetch('https://brevo.com', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email }],
        subject: `Your FitFollow code: ${code}`,
        textContent: `Your FitFollow password reset code is ${code}. It expires in 10 minutes.`,
        htmlContent: html,
      }),
    });
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      throw new Error(`Brevo API ${r.status}: ${errBody}`);
    }
    return true;
  }

  const transport = getMailer();
  if (!transport) return false;
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: `Your FitFollow code: ${code}`,
    text: `Your FitFollow password reset code is ${code}. It expires in 10 minutes.`,
    html,
  });
  return true;
}

async function sendSmsCode({ phone, code }) {
  const client = getSms();
  if (!client) return false;
  await client.messages.create({
    to: phone,
    from: process.env.TWILIO_FROM,
    body: `FitFollow code: ${code}. Expires in 10 minutes.`,
  });
  return true;
}

async function deliverResetCode({ channel, email, phone, code }) {
  const production = process.env.NODE_ENV === 'production';

  if (channel === 'sms') {
    const sent = await sendSmsCode({ phone, code });
    if (!sent) {
      if (production) throw new Error('SMS delivery is not configured.');
      console.warn(`[FitFollow] SMS not configured — code for ${phone}: ${code}`);
      return false;
    }
    return true;
  }

  const sent = await sendEmailCode({ email, code });
  if (!sent) {
    if (production) throw new Error('Email delivery is not configured.');
    console.warn(`[FitFollow] email not configured — code for ${email}: ${code}`);
    return false;
  }
  return true;
}

app.post('/api/auth/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const channel = req.body?.channel === 'sms' ? 'sms' : 'email';

    const emailErr = emailProblem(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    const user = await User.findOne({ email });
    const generic = { ok: true, message: 'If that account exists, a 6-digit code is on its way.' };

    if (!user) return res.json(generic); // don't reveal whether the account exists

    if (channel === 'sms' && !user.phone) {
      return res.status(400).json({ error: 'No phone number on this account. Use email instead.' });
    }

    const code = makeCode();
    resetCodes.set(`${channel}:${email}`, {
      code,
      expires: Date.now() + RESET_TTL_MS,
      attempts: 0,
    });

    const delivered = await deliverResetCode({ channel, email, phone: user.phone, code });

    const payload = { ...generic, delivered };
    if (!delivered && process.env.NODE_ENV !== 'production') payload.devCode = code;
    res.json(payload);
  } catch (err) {
    console.error('forgot failed:', err);
    res.status(500).json({ error: 'Could not send a code. Please try again.' });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const channel = req.body?.channel === 'sms' ? 'sms' : 'email';
    const code = String(req.body?.code || '').trim();
    const password = String(req.body?.password || '');

    const emailErr = emailProblem(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code.' });

    const passErr = passwordProblem(password);
    if (passErr) return res.status(400).json({ error: passErr });

    const key = `${channel}:${email}`;
    const entry = resetCodes.get(key);
    if (!entry) return res.status(400).json({ error: 'Request a new code first.' });
    if (Date.now() > entry.expires) {
      resetCodes.delete(key);
      return res.status(400).json({ error: 'That code expired. Request a new one.' });
    }
    if (entry.attempts >= RESET_MAX_ATTEMPTS) {
      resetCodes.delete(key);
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }
    if (entry.code !== code) {
      entry.attempts += 1;
      return res.status(400).json({ error: 'That code is incorrect.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Request a new code first.' });

    user.password = await bcrypt.hash(password, 10);
    await user.save();
    resetCodes.delete(key);

    res.json({ ok: true, message: 'Password updated. You can sign in now.' });
  } catch (err) {
    console.error('reset failed:', err);
    res.status(500).json({ error: 'Could not reset the password. Please try again.' });
  }
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: toPublicUser(req.user) }));

app.patch('/api/me', requireAuth, async (req, res) => {
  const b = req.body || {};
  const set = {};
  if (b.displayName !== undefined) {
    const name = String(b.displayName).trim();
    if (name.length < 1 || name.length > 40) return res.status(400).json({ error: 'Display name must be 1-40 characters.' });
    if (!moderateComment(name).allowed) return res.status(400).json({ error: 'Please choose an appropriate display name.' });
    set.displayName = name;
  }
  if (b.isPublic !== undefined) set.isPublic = b.isPublic === true;
  if (b.allowStatsIndexing !== undefined) set.allowStatsIndexing = b.allowStatsIndexing === true;
  if (b.defaultAudience !== undefined) {
    if (!AUDIENCES.includes(b.defaultAudience)) return res.status(400).json({ error: 'Unknown audience.' });
    set.defaultAudience = b.defaultAudience;
  }
  if (b.avatarUrl !== undefined) {
    if (b.avatarUrl !== null) {
      if (!isValidAvatar(b.avatarUrl)) {
        return res.status(400).json({ error: 'That photo is too large or not a JPEG/PNG/WebP image.' });
      }
      
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.avatarUrl);
      if (m) {
        const fd = new FormData();
        fd.append('file', new Blob([Buffer.from(m.at(2), 'base64')], { type: m.at(1) }), 'avatar.jpg');
        const headers = process.env.CV_TOKEN ? { 'x-cv-token': process.env.CV_TOKEN } : {};
        const r = await fetch(`${CV_URL}/classify-avatar`, { method: 'POST', body: fd, headers }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => ({})) : null;
        if (!d?.approved) {
          return res.status(422).json({ error: 'Please upload an appropriate fitness/workout profile photo.' });
        }
      }

    }
    set.avatarUrl = b.avatarUrl;
  }

  if (!Object.keys(set).length) return res.status(400).json({ error: 'Nothing to update.' });

  const publicAfter = set.isPublic ?? Boolean(req.user.isPublic);
  if (!publicAfter && (set.defaultAudience ?? req.user.defaultAudience) === 'PUBLIC') {
    if (set.defaultAudience === 'PUBLIC') return res.status(400).json({ error: 'Switch to a public account first to default to Public.' });
    set.defaultAudience = 'FRIENDS';
  }

  const u = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true, projection: PROFILE_FIELDS }).lean();
  if (set.isPublic !== undefined) await Post.updateMany({ authorId: req.user._id }, { authorPublic: set.isPublic });
  res.json({ user: toPublicUser(u) });
});

app.post('/api/me/password', requireAuth, async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });
  if (next === current) return res.status(400).json({ error: 'Choose a different password than your current one.' });
  const u = await User.findById(req.user._id);
  if (!u || !(await bcrypt.compare(current, u.password))) return res.status(400).json({ error: 'Your current password is incorrect.' });
  u.password = await bcrypt.hash(next, 10);
  await u.save();
  res.json({ ok: true });
});


app.delete('/api/me', requireAuth, async (req, res) => {
  const me = req.user._id;
  await Promise.all([
    StepLog.deleteMany({ userId: me }),
    FoodLog.deleteMany({ userId: me }),
    WorkoutSession.deleteMany({ userId: me }),
    WorkoutPreset.deleteMany({ userId: me }),
    BodyMetric.deleteMany({ userId: me }),
    Post.deleteMany({ authorId: me }),
    Post.updateMany({}, { $pull: { comments: { authorId: me } } }),
    Story.deleteMany({ authorId: me }),
    Friendship.deleteMany({ users: me }),
    Message.deleteMany({ $or: [{ senderId: me }, { recipientId: me }] }),
    Report.deleteMany({ $or: [{ reporterId: me }, { targetUserId: me }] }),
    User.deleteOne({ _id: me }),
  ]);
  res.json({ ok: true });
});


// Today (Steps & Nutrition)
app.get('/api/steps', requireAuth, async (req, res) => {
  const doc = await StepLog.findOne({ userId: req.user._id, day: req.query.day });
  res.json({ steps: doc?.steps || 0, goal: 10000 });
});
app.post('/api/steps', requireAuth, async (req, res) => {
  const steps = Number(req.body.steps);
  if (!Number.isFinite(steps) || steps <= 0 || steps > 100000) {
    return res.status(400).json({ error: 'Steps must be between 1 and 100,000.' });
  }
  const doc = await StepLog.findOneAndUpdate(
    { userId: req.user._id, day: req.body.day },
    { $inc: { steps: Math.round(steps) } },
    { upsert: true, new: true }
  );
  res.json({ steps: doc.steps, goal: 10000 });
});

app.get('/api/nutrition', requireAuth, async (req, res) => {
  const entries = await FoodLog.find({ userId: req.user._id, day: req.query.day });
  const totals = entries.reduce((a, b) => ({
    calories: a.calories + (b.calories || 0), protein: a.protein + (b.protein || 0), carbs: a.carbs + (b.carbs || 0), fat: a.fat + (b.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  res.json({
    entries,
    foods: BUILTIN_FOODS,
    totals,
    goal: req.user.calorieGoal || 2200,
    goalSource: req.user.plan ? 'plan' : 'default',
    plan: req.user.plan || null,
    profile: req.user.plan || null,
  });
});

app.post('/api/nutrition/goal', requireAuth, async (req, res) => {
  const goal = Number(req.body.goal);
  if (!Number.isFinite(goal) || goal < 1000 || goal > 6000) {
    return res.status(400).json({ error: 'Daily calorie goal must be between 1,000 and 6,000 kcal.' });
  }
  await User.findByIdAndUpdate(req.user._id, { calorieGoal: Math.round(goal) });
  res.json({ ok: true, goal: Math.round(goal) });
});

app.get('/api/nutrition/foods', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const local = BUILTIN_FOODS.filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 25);
  const external = q.length >= 2 ? await searchExternalFoods(q) : [];
  const seen = new Set(local.map((f) => f.name.toLowerCase()));
  const merged = [...local];
  for (const f of external) {
    const k = f.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(f);
    if (merged.length >= 30) break;
  }
  res.json({ foods: merged, query: req.query.q || '', sources: ['builtin', 'openfoodfacts'] });
});

app.post('/api/nutrition/log', requireAuth, async (req, res) => {
  const bodyFood = req.body.food && typeof req.body.food === 'object' ? normalizeFood(req.body.food) : null;
  const f = bodyFood || BUILTIN_FOODS.find((x) => x.id === req.body.foodId);
  if (f) {
    await FoodLog.create({
      userId: req.user._id,
      day: req.body.day,
      name: f.name,
      calories: Number(f.calories || 0),
      protein: Number(f.protein || 0),
      carbs: Number(f.carbs || 0),
      fat: Number(f.fat || 0),
    });
  }
  res.json({ ok: true });
});
app.post('/api/nutrition/custom', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const calories = Number(req.body.calories);
  const protein = Number(req.body.protein || 0);
  const carbs = Number(req.body.carbs || 0);
  const fat = Number(req.body.fat || 0);
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a valid food name.' });
  if (!Number.isFinite(calories) || calories <= 0 || calories > 5000) {
    return res.status(400).json({ error: 'Calories must be between 1 and 5,000 kcal.' });
  }
  if ([protein, carbs, fat].some((m) => !Number.isFinite(m) || m < 0 || m > 500)) {
    return res.status(400).json({ error: 'Macros must be between 0g and 500g.' });
  }
  await FoodLog.create({ userId: req.user._id, day: req.body.day, name, calories, protein, carbs, fat });
  res.json({ ok: true });
});

// Profile: calorie plan (age/height/weight/...) and/or displayName + bio.
// Send any combination; only the parts you send are changed.
//   displayName: "" resets it to your username.   bio: "" clears it.
app.put('/api/profile', requireAuth, async (req, res) => {
  const b = req.body || {};
  const { age, heightIn, weightLb, sex, activity, goal } = b;
  const set = {};

  // --- displayName (1-40 chars; empty falls back to the username) ---
  if (b.displayName !== undefined) {
    if (b.displayName !== null && typeof b.displayName !== 'string') {
      return res.status(400).json({ error: 'Display name must be text.' });
    }
    const name = String(b.displayName ?? '').trim();
    if (name.length > 40) return res.status(400).json({ error: 'Display name must be 40 characters or fewer.' });
    
    if (name && !moderateComment(name).allowed) return res.status(400).json({ error: 'Please choose an appropriate display name.' });
    set.displayName = name || req.user.username;
  }

  // --- bio (empty clears it; otherwise clean, fitness-related, max 160) ---
  if (b.bio !== undefined) {
    const verdict = moderateBio(b.bio);
    if (!verdict.allowed) {
      return res.status(400).json({ error: BIO_MESSAGES[verdict.reason] || 'Use an appropriate bio.', reason: verdict.reason });
    }
    set.bio = typeof b.bio === 'string' ? b.bio.trim() : '';
  }

  // --- calorie plan (only when the plan inputs are sent) ---
  const hasPlan = [age, heightIn, weightLb].every((v) => v !== undefined && v !== null && v !== '');
  let plan;
  let calorieGoal;
  if (hasPlan) {
    if (![age, heightIn, weightLb].every((v) => Number.isFinite(Number(v)) && Number(v) > 0)) {
      return res.status(400).json({ error: 'Age, height and weight must be positive numbers.' });
    }
    const bmrBase = 10 * (Number(weightLb) * 0.453592) + 6.25 * (Number(heightIn) * 2.54) - 5 * Number(age);
    const bmr = sex === 'male' ? bmrBase + 5 : sex === 'female' ? bmrBase - 161 : bmrBase - 78;
    const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[activity] || 1.375;
    const tdee = Math.round(bmr * mult);
    const bmi = Math.round(((Number(weightLb) / (Number(heightIn) ** 2)) * 703) * 10) / 10;
    const usedGoal = goal === 'auto' ? (bmi >= 25 ? 'lose' : bmi < 18.5 ? 'gain' : 'maintain') : goal;
    calorieGoal = Math.max(1200, Math.min(5000, tdee + (usedGoal === 'lose' ? -400 : usedGoal === 'gain' ? 300 : 0)));
    set.calorieGoal = calorieGoal;
    plan = { bmi, category: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese', goalUsed: usedGoal };
    set.plan = { ...plan, age: Number(age), heightIn: Number(heightIn), weightLb: Number(weightLb), sex, activity, goal };
  }

  if (!Object.keys(set).length) return res.status(400).json({ error: 'Nothing to update.' });

  const u = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true, projection: PROFILE_FIELDS }).lean();
  res.json({
    ok: true,
    calorieGoal: u.calorieGoal || 2200,
    ...(plan ? { plan } : {}),
    user: toPublicUser(u),
  });
});

app.delete('/api/nutrition/log/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Entry not found.' });
  await FoodLog.deleteOne({ _id: req.params.id, userId: req.user._id });
  res.json({ ok: true });
});

app.delete('/api/nutrition/today', requireAuth, async (req, res) => {
  await FoodLog.deleteMany({ userId: req.user._id, day: String(req.query.day || '') });
  res.json({ ok: true });
});

// Workouts & Presets
app.get('/api/exercises/search', requireAuth, async (req, res) => {
  res.json({ exercises: await searchWgerExercises(req.query.q) });
});

app.get('/api/exercises/videos', requireAuth, async (req, res) => {
  const exercise = String(req.query.exercise || '').trim();
  const focus = String(req.query.focus || 'proper form tutorial').trim();
  if (!exercise || !moderateComment(exercise).allowed) {
    return res.status(400).json({ error: 'Select a valid workout activity first.' });
  }
  res.json(await searchFormVideos(exercise, focus));
});

app.get('/api/sessions', requireAuth, async (req, res) => res.json({ sessions: await WorkoutSession.find({ userId: req.user._id }).sort({ createdAt: -1 }) }));

app.get('/api/exercises/inspect', requireAuth, async (req, res) => {
  const exercise = String(req.query.exercise || '').trim();
  if (!exercise) return res.json({ valid: false, mode: 'weighted_strength', requiresWeight: true });
  res.json(await inspectExercise(exercise));
});

app.post('/api/sessions', requireAuth, async (req, res) => {
  const exercise = String(req.body.exercise || '').trim();
  if (!moderateComment(exercise).allowed) {
    return res.status(400).json({ error: 'Please enter a clean, appropriate exercise name.' });
  }
  const info = await inspectExercise(exercise);
  if (!info.valid) {
    return res.status(400).json({ error: `"${exercise}" was not recognized as a workout or physical activity.` });
  }

  const weight = Number(req.body.weight || 0);
  const reps = Number(req.body.reps || 0);
  const sets = Number(req.body.sets || 0);
  const minutes = Number(req.body.minutes || 0);
  const speedMph = Number(req.body.speedMph || 0);
  const mode = info.mode || 'weighted_strength';

  if (mode === 'cardio_speed' || mode === 'movement_duration') {
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) {
      return res.status(400).json({ error: `Enter duration in minutes (1–600) for ${exercise}.` });
    }
    if (speedMph < 0 || speedMph > 40) {
      return res.status(400).json({ error: 'Speed must be between 0 and 40 mph.' });
    }
    const session = await WorkoutSession.create({
      userId: req.user._id, exercise, activityType: mode, minutes, speedMph: speedMph || undefined,
    });
    return res.status(201).json({ session, isPR: false });
  }

  if (info.requiresWeight && weight <= 0) {
    return res.status(400).json({ error: `${exercise} uses weights — please enter Weight (lb).` });
  }
  if (weight < 0 || weight > 2000 || reps <= 0 || reps > 500 || sets <= 0 || sets > 100) {
    return res.status(400).json({ error: 'Enter realistic weight (0–2000), reps (1–500), and sets (1–100).' });
  }

  const prevBest = await WorkoutSession.findOne({ userId: req.user._id, exercise }).sort({ weight: -1 });
  const isPR = weight > 0 && (!prevBest || weight > (prevBest.weight || 0));
  const session = await WorkoutSession.create({ userId: req.user._id, exercise, activityType: mode, weight, reps, sets });
  res.status(201).json({ session, isPR });
});

app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Workout not found.' });
  await WorkoutSession.deleteOne({ _id: req.params.id, userId: req.user._id });
  res.json({ ok: true });
});

app.delete('/api/sessions', requireAuth, async (req, res) => {
  await WorkoutSession.deleteMany({ userId: req.user._id });
  res.json({ ok: true });
});

const DEFAULT_PRESETS = [
  { id: 'p1', name: 'Push Day (Bench, OHP, Triceps)' },
  { id: 'p2', name: 'Pull Day (Deadlift, Rows, Curls)' },
  { id: 'p3', name: 'Leg Day (Squat, RDL, Calf Raises)' },
];

app.get('/api/presets', requireAuth, async (req, res) => {
  const custom = await WorkoutPreset.find({ userId: req.user._id }).lean();
  res.json({ presets: [...DEFAULT_PRESETS, ...custom.map((c) => ({ id: String(c._id), name: c.name, custom: true }))] });
});

app.post('/api/presets', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 60 || !moderateComment(name).allowed) {
    return res.status(400).json({ error: 'Enter a clean preset name (1–60 chars).' });
  }
  const p = await WorkoutPreset.create({ userId: req.user._id, name });
  res.status(201).json({ id: String(p._id), name: p.name, custom: true });
});

app.delete('/api/presets/:id', requireAuth, async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) {
    await WorkoutPreset.deleteOne({ _id: req.params.id, userId: req.user._id });
  }
  res.json({ ok: true });
});

app.post('/api/presets/:id/start', requireAuth, async (req, res) => {
  const built = DEFAULT_PRESETS.find((p) => p.id === req.params.id);
  const custom = !built && mongoose.isValidObjectId(req.params.id)
    ? await WorkoutPreset.findOne({ _id: req.params.id, userId: req.user._id }).lean()
    : null;
  const label = built?.name || custom?.name || 'Preset Workout';
  await WorkoutSession.create({ userId: req.user._id, exercise: label, name: label });
  res.json({ ok: true, name: label });
});


// Body Metrics
app.get('/api/body', requireAuth, async (req, res) => res.json({ entries: await BodyMetric.find({ userId: req.user._id }).sort({ _id: -1 }) }));
app.post('/api/body', requireAuth, async (req, res) => {
  const weight = Number(req.body.weight);
  if (!Number.isFinite(weight) || weight < 50 || weight > 700) {
    return res.status(400).json({ error: 'Body weight must be between 50 and 700 lbs.' });
  }
  const entry = await BodyMetric.create({ ...req.body, userId: req.user._id, weight, day: new Date().toISOString().slice(0, 10) });
  res.status(201).json(entry);
});

app.delete('/api/body/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Entry not found.' });
  await BodyMetric.deleteOne({ _id: req.params.id, userId: req.user._id });
  res.json({ ok: true });
});

async function computeFitnessQuirks(userDocs) {
  const map = new Map();
  const optedIn = userDocs.filter((u) => u && u.allowStatsIndexing);
  if (!optedIn.length) return map;
  const ids = optedIn.map((u) => u._id);

  const [topLifts, topSteps] = await Promise.all([
    WorkoutSession.aggregate([
      { $match: { userId: { $in: ids }, weight: { $gt: 0 } } },
      { $sort: { weight: -1 } },
      { $group: { _id: '$userId', exercise: { $first: '$exercise' }, weight: { $first: '$weight' } } },
    ]),
    StepLog.aggregate([
      { $match: { userId: { $in: ids }, steps: { $gt: 0 } } },
      { $group: { _id: '$userId', maxSteps: { $max: '$steps' } } },
    ]),
  ]);

  const liftById = new Map(topLifts.map((r) => [String(r._id), r]));
  const stepById = new Map(topSteps.map((r) => [String(r._id), r]));

  for (const u of optedIn) {
    const k = String(u._id);
    const lift = liftById.get(k);
    const step = stepById.get(k);
    if (lift) map.set(k, `${lift.exercise} PR: ${lift.weight} lb`);
    else if (step) map.set(k, `Peak Day: ${Number(step.maxSteps).toLocaleString()} steps`);
    else map.set(k, 'Yet to hit the gym');
  }
  return map;
}

// ---------------- Friends ----------------
const stateFor = (f, meId) => (!f ? 'NONE' : f.status === 'FRIENDS' ? 'FRIENDS' : String(f.requester) === String(meId) ? 'REQUEST_SENT' : 'REQUEST_RECEIVED');
const brief = (u) => ({ id: String(u._id), username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl || null, isPublic: Boolean(u.isPublic) });
const friendIdsOf = async (meId) => (await Friendship.find({ users: meId, status: 'FRIENDS' }, 'users').lean())
  .map((f) => f.users.find((id) => String(id) !== String(meId)));
const areFriends = async (a, b) => Boolean(await Friendship.exists({ pairKey: pairKey(a, b), status: 'FRIENDS' }));

app.get('/api/friends', requireAuth, async (req, res) => {
  const me = req.user._id;
  const rows = await Friendship.find({ users: me }).populate('users', 'username displayName avatarUrl isPublic').lean();
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const f of rows) {
    const other = f.users.find((u) => u && String(u._id) !== String(me));
    if (!other) continue;
    const state = stateFor(f, me);
    if (state === 'FRIENDS') out.friends.push(brief(other));
    else if (state === 'REQUEST_RECEIVED') out.incoming.push(brief(other));
    else out.outgoing.push(brief(other));
  }
  res.json(out);
});

app.get('/api/friends/suggested', requireAuth, async (req, res) => {
  const me = req.user._id;
  const [rels, meDoc] = await Promise.all([
    Friendship.find({ users: me }, 'users').lean(),
    User.findById(me, 'dismissedSuggestions').lean(),
  ]);
  const exclude = [me, ...rels.flatMap((r) => r.users), ...(meDoc?.dismissedSuggestions || [])];
  const users = await User.find(
    { _id: { $nin: exclude }, $or: [{ isDemo: { $ne: true } }, { isPublic: true }] },
    'username displayName avatarUrl bio isPublic isDemo'
  ).sort({ isDemo: 1, _id: -1 }).limit(8).lean();
  res.json({
    users: users.map((u) => ({
      ...brief(u),
      ...(u.isPublic ? { bio: u.bio || '' } : {}),
      state: 'NONE',
    })),
  });
});

app.post('/api/friends/suggested/:id/dismiss', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'User not found.' });
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { dismissedSuggestions: id } });
  res.json({ ok: true });
});

// Searches username AND displayName (case-insensitive, partial match).
// `bio` is only included when the person's profile is public or you're already friends.

app.get('/api/friends/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '');
  const mode = req.query.mode === 'quirk' ? 'quirk' : 'name';
  if (q.length < 2) return res.json({ users: [] });
  const me = req.user._id;
  const rx = new RegExp(escapeRegExp(q), 'i');
  const lower = q.toLowerCase();

  let found = [];
  if (mode === 'quirk') {
    const bioHits = await User.find(
      { _id: { $ne: me }, isPublic: true, bio: rx },
      'username displayName avatarUrl bio isPublic allowStatsIndexing'
    ).limit(20).lean();
    if (bioHits.length >= 20) {
      found = bioHits;
    } else {
      const excludeIds = [me, ...bioHits.map((u) => u._id)];
      const candidates = await User.find(
        { _id: { $nin: excludeIds }, allowStatsIndexing: true },
        'username displayName avatarUrl bio isPublic allowStatsIndexing'
      ).limit(150).lean();
      const candQuirks = await computeFitnessQuirks(candidates);
      const prHits = candidates.filter((u) => rx.test(candQuirks.get(String(u._id)) || ''));
      found = [...bioHits, ...prHits].slice(0, 20);
    }
  } else {

    const rank = (u) => ((u.username || '').toLowerCase().startsWith(lower) ? 0 : (u.displayName || '').toLowerCase().startsWith(lower) ? 1 : 2);
    found = (await User.find({ $or: [{ username: rx }, { displayName: rx }], _id: { $ne: me } }, 'username displayName avatarUrl bio isPublic allowStatsIndexing').limit(100).lean())
      .sort((x, y) => rank(x) - rank(y) || (x.username || '').localeCompare(y.username || ''))
      .slice(0, 20);
  }

  const [rels, quirks] = await Promise.all([
    Friendship.find({ users: me, pairKey: { $in: found.map((u) => pairKey(me, u._id)) } }).lean(),
    computeFitnessQuirks(found),
  ]);

  const byKey = new Map(rels.map((f) => [f.pairKey, f]));
  res.json({
    users: found.map((u) => {
      const state = stateFor(byKey.get(pairKey(me, u._id)), me);
      const canSeeBio = Boolean(u.isPublic) || state === 'FRIENDS';
      return {
        ...brief(u),
        ...(canSeeBio ? { bio: u.bio || '' } : {}),
        ...(quirks.has(String(u._id)) ? { fitnessQuirk: quirks.get(String(u._id)) } : {}),
        state,
      };
    }),
  });
});

app.post('/api/friends/:id/send', requireAuth, async (req, res) => {
  const me = req.user._id;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'User not found.' });
  if (String(id) === String(me)) return res.status(400).json({ error: "You can't add yourself." });
  const other = await User.findById(id, 'isDemo').lean();
  if (!other) return res.status(404).json({ error: 'User not found.' });

  const key = pairKey(me, id);
  let f = await Friendship.findOneAndUpdate(
    { pairKey: key },
    { $setOnInsert: { users: [me, id], requester: me, status: 'PENDING' } },
    { upsert: true, new: true }
  );
  if (f.status === 'PENDING' && (String(f.requester) !== String(me) || other.isDemo)) {
    f = await Friendship.findOneAndUpdate({ pairKey: key }, { status: 'FRIENDS' }, { new: true });
  }
  res.json({ state: stateFor(f, me) });
});

app.post('/api/friends/:id/accept', requireAuth, async (req, res) => {
  const me = req.user._id;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Request not found.' });
  const f = await Friendship.findOneAndUpdate(
    { pairKey: pairKey(me, id), status: 'PENDING', requester: id },
    { status: 'FRIENDS' },
    { new: true }
  );
  if (!f) return res.status(404).json({ error: 'No pending request from that user.' });
  res.json({ state: 'FRIENDS' });
});

app.delete('/api/friends/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'User not found.' });
  await Friendship.deleteOne({ pairKey: pairKey(req.user._id, id) });
  res.json({ state: 'NONE' });
});

// ---------------- Messages (friends only) ----------------
const toMessageJson = (m, meId) => ({
  id: String(m._id),
  senderId: String(m.senderId),
  recipientId: String(m.recipientId),
  text: m.text,
  createdAt: m.createdAt,
  mine: String(m.senderId) === String(meId),
});

// Conversation with one friend, oldest first.
//   ?limit=50 (1-100)   ?before=<ISO date> to page back to older messages
app.get('/api/messages/:friendId', requireAuth, async (req, res) => {
  try {
    const me = req.user._id;
    const { friendId } = req.params;
    if (!mongoose.isValidObjectId(friendId)) return res.status(404).json({ error: 'User not found.' });
    if (!(await areFriends(me, friendId))) return res.status(403).json({ error: 'You can only message your friends.' });

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = { pairKey: pairKey(me, friendId) };
    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) return res.status(400).json({ error: 'Invalid "before" date.' });
      filter.createdAt = { $lt: before };
    }

    const rows = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ messages: rows.reverse().map((m) => toMessageJson(m, me)) });
  } catch (err) {
    console.error('get messages failed:', err);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

app.post('/api/messages/:friendId', requireAuth, async (req, res) => {
  try {
    const me = req.user._id;
    const { friendId } = req.params;
    if (!mongoose.isValidObjectId(friendId)) return res.status(404).json({ error: 'User not found.' });
    if (!(await areFriends(me, friendId))) return res.status(403).json({ error: 'You can only message your friends.' });

    if (typeof req.body?.text !== 'string') return res.status(400).json({ error: 'Message must be text.', reason: 'invalid_input' });
    const text = req.body.text.trim();
    if (!text) return res.status(400).json({ error: 'Write something to send.', reason: 'empty' });

    const verdict = moderateComment(text);
    if (!verdict.allowed) {
      return res.status(400).json({ error: MESSAGES[verdict.reason] || 'Use appropriate language.', reason: verdict.reason });
    }

    if (!(await isSupportiveText(text))) {
      return res.status(400).json({ error: MESSAGES.uncivil, reason: 'uncivil' });
    }


    const message = await Message.create({
      pairKey: pairKey(me, friendId),
      senderId: me,
      recipientId: friendId,
      text,
    });
    res.status(201).json({ message: toMessageJson(message, me) });
  } catch (err) {
    console.error('send message failed:', err);
    res.status(500).json({ error: 'Could not send the message.' });
  }
});

app.delete('/api/messages/:friendId', requireAuth, async (req, res) => {
  const { friendId } = req.params;
  if (!mongoose.isValidObjectId(friendId)) return res.status(404).json({ error: 'User not found.' });
  await Message.deleteMany({ pairKey: pairKey(req.user._id, friendId) });
  res.json({ ok: true });
});

app.post('/api/friends/:id/block', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'User not found.' });
  const key = pairKey(req.user._id, id);
  await Promise.all([
    Friendship.deleteOne({ pairKey: key }),
    Message.deleteMany({ pairKey: key }),
  ]);
  res.json({ ok: true, blocked: true });
});

const Report = mongoose.models.Report || mongoose.model('Report', new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reporterUsername: String,
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetUsername: String,
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
}));
app.post('/api/reports', requireAuth, async (req, res) => {
  const { targetUserId, targetUsername, reason } = req.body || {};
  const cleanReason = String(reason || '').trim();
  if (!cleanReason || cleanReason.length < 3) {
    return res.status(400).json({ error: 'Please explain why you are reporting this account.' });
  }
  const verdict = moderateComment(cleanReason);
  if (!verdict.allowed) {
    return res.status(400).json({ error: MESSAGES[verdict.reason] || 'Keep report descriptions clean and respectful.' });
  }

  await Report.create({
    reporterId: req.user._id,
    reporterUsername: req.user.username,
    targetUserId,
    targetUsername: String(targetUsername || '').trim(),
    reason: cleanReason.slice(0, 400),
  });
  if (mongoose.isValidObjectId(targetUserId)) {
    const key = pairKey(req.user._id, targetUserId);
    await Promise.all([
      Friendship.deleteOne({ pairKey: key }),
      Message.deleteMany({ pairKey: key }),
      User.findByIdAndUpdate(req.user._id, { $addToSet: { dismissedSuggestions: targetUserId } }),
    ]);
  }
  res.status(201).json({ ok: true });
});

app.get('/api/reports', requireAuth, async (req, res) => {
  const rows = await Report.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ reports: rows });
});

app.patch('/api/reports/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
  await Report.findByIdAndUpdate(req.params.id, { $set: { status } });
  res.json({ ok: true });
});

// ---------------- Feed (privacy-filtered: Home + Discover + Infinite Scroll + 20s Pulse) ----------------
let lastDiscoverPulseAt = 0;
let cachedPulsePools = null;

async function trimExcessPulsePosts() {
  try {
    const demoIds = await User.distinct('_id', { isDemo: true });
    if (!demoIds.length) return;
        const realUserIds = await User.distinct('_id', { isDemo: { $ne: true } });
    while (true) {
      const stale = await Post.find(
        { authorId: { $nin: realUserIds }, isSeededPhoto: { $ne: true } },
        '_id'
      ).sort({ createdAt: -1 }).skip(600).limit(2500).lean();

    if (!stale.length) break;
      await Post.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
    }
  } catch (e) {
    console.warn('pulse trim skipped:', e.message);
  }
}

mongoose.connection.once('open', () => { trimExcessPulsePosts(); });

app.get('/api/feed', requireAuth, async (req, res) => {
  const me = req.user._id;
  const scope = req.query.scope === 'discover' ? 'discover' : 'friends';
  const limit = Math.min(30, Math.max(5, parseInt(req.query.limit, 10) || 15));
  const before = req.query.before ? new Date(String(req.query.before)) : null;

  if (scope === 'discover' && !before && Date.now() - lastDiscoverPulseAt >= 20000) {
    lastDiscoverPulseAt = Date.now();
    const newestDemo = await Post.findOne({ audience: 'PUBLIC', authorPublic: true }, 'createdAt').sort({ createdAt: -1 }).lean();
    if (!newestDemo || Date.now() - new Date(newestDemo.createdAt).getTime() >= 20000) {
    const MALE_FIRST = new Set([
    'Liam', 'Noah', 'Ethan', 'Mason', 'Lucas', 'Logan', 'Caleb', 'Nathan', 'Ryan', 'Dylan',
    'Aiden', 'Jack', 'Owen', 'Gabriel', 'Carter', 'Julian', 'Mateo', 'Leo', 'Isaac', 'Daniel',
    'Henry', 'Miles', 'Gavin', 'Evan', 'Lukas', 'Soren', 'Matteo', 'Sebastian', 'Henrik', 'Nico',
    'Kenji', 'Hiroshi', 'Minho', 'Jihoon', 'Wei', 'Jun', 'Bao', 'Minh', 'Haruto', 'Ren',
    'Kaito', 'Seojun', 'Doyoon', 'Hao', 'Zhi', 'Tuan', 'Riku', 'Hyun', 'Cheng', 'Daiki',
    'Arjun', 'Rohan', 'Dev', 'Samir', 'Kabir', 'Aarav', 'Vikram', 'Nikhil', 'Siddharth', 'Karan',
    'Kwame', 'Kofi', 'Tariq', 'Malik', 'Idris', 'Chidi', 'Tunde', 'Zuri', 'Jelani', 'Jabari',
    ]);

      if (!cachedPulsePools) {
        const [demoAuthors, manPool, womanPool] = await Promise.all([
          User.find({ isDemo: true, isPublic: true }, '_id username displayName isPublic').limit(80).lean(),
          Post.find({ isSeededPhoto: true, gender: 'man' }, 'photo text').limit(127).lean(),
          Post.find({ isSeededPhoto: true, gender: 'woman' }, 'photo text').limit(127).lean(),
        ]);
        cachedPulsePools = { demoAuthors, manPool, womanPool };
      }
      const { demoAuthors, manPool, womanPool } = cachedPulsePools;
      if (demoAuthors.length > 0) {
        const rng = makeRng(`pulse-${Date.now()}`);
        const fresh = [];
        for (let i = 0; i < 12; i++) {
          const author = demoAuthors[Math.floor(rng() * demoAuthors.length)];
          const isMan = MALE_FIRST.has((author.displayName || '').split(' ')[0]);
          const pool = isMan ? manPool : womanPool;
          const [sample] = postsFor({ username: author.username, isPublic: true }, rng, Date.now(), demoAuthors);
          const picked = pool.length && i % 2 === 0 ? pool[Math.floor(rng() * pool.length)] : null;
          if (sample) {
            fresh.push({
              authorId: author._id,
              author: { username: author.username },
              audience: 'PUBLIC',
              text: picked ? picked.text : sample.text,
              comments: [],
              cvStatus: picked ? 'approved' : null,
              photoStatus: picked ? 'approved' : 'none',
              ...(picked ? { photo: picked.photo } : {}),
              authorPublic: true,
              createdAt: new Date(Date.now() - Math.floor(rng() * 5000)),
            });
          }
        }
        if (fresh.length) {
          await Post.insertMany(fresh).catch(() => {});
          trimExcessPulsePosts();
        }
      }

    }
  }

  const filter = {
    ...feedFilter(me, scope === 'friends' ? await friendIdsOf(me) : [], scope),
    ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { $lt: before } } : {}),
  };
  const raw = await Post.find(filter, { photo: 0 }).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = raw.length > limit;
  const posts = hasMore ? raw.slice(0, limit) : raw;

  const ids = [...new Set(posts.map((p) => p.authorId).filter(Boolean).map(String))];
  const authors = ids.length ? await User.find({ _id: { $in: ids } }, 'username displayName avatarUrl').lean() : [];
  const byId = new Map(authors.map((a) => [String(a._id), a]));
  const mapped = posts.map(({ authorId, authorPublic, ...p }) => {
    const a = byId.get(String(authorId));
    return {
      ...p,
      mine: String(authorId) === String(me),
      author: { username: a?.username || p.author?.username, displayName: a?.displayName, avatarUrl: a?.avatarUrl || null },
      hasPhoto: p.photoStatus !== 'none',
      photoUrl: p.photoStatus !== 'none' ? `/api/feed/${p._id}/photo` : null,
      comments: (p.comments || []).map((c) => ({ ...c, mine: String(c.authorId) === String(me) })),
    };
  });

  res.json({
    scope,
    posts: mapped,
    hasMore,
    nextCursor: mapped.length ? mapped[mapped.length - 1].createdAt : null,
  });
});


app.get('/api/feed/:id/photo', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  const p = await Post.findById(req.params.id);
  if (!p?.photo?.data) return res.sendStatus(404);
  const isFriend = ['FRIENDS', 'PUBLIC'].includes(p.audience) && p.authorId
    ? Boolean(await Friendship.exists({ pairKey: pairKey(req.user._id, p.authorId), status: 'FRIENDS' }))
    : false;
  if (!canViewPost(p, req.user._id, isFriend)) return res.sendStatus(404);
  res.set('Content-Type', p.photo.contentType || 'image/jpeg').set('Cache-Control', 'private, max-age=300').send(p.photo.data);
});

app.post('/api/feed', requireAuth, (req, res, next) => upload.single('photo')(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too large (max 10 MB).' : 'Could not read the upload.' });
  next();
}), async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    const verdict = moderateCaption(text);
    if (!verdict.allowed) {
      return res.status(400).json({ error: MESSAGES?.[verdict.reason] || 'Use appropriate language.' });
    }
    const audience = AUDIENCES.includes(req.body.audience) ? req.body.audience : (req.user.defaultAudience || 'FRIENDS');
    if (audience === 'PUBLIC' && !req.user.isPublic) {
      return res.status(400).json({ error: 'Switch to a public account in Profile & privacy to post publicly.' });
    }
    let cvStatus = null;
    let photoStatus = 'none';
    let photo;

    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only image files can be uploaded.' });
      const cv = await checkPhoto(req.file);
      if (cv.outcome === 'rejected') {
        return res.status(422).json({ error: `Oops, that doesn't look like a workout photo:).`, cvStatus: 'rejected' });
      }
      cvStatus = cv.note;
      photoStatus = cv.outcome;
      photo = { data: req.file.buffer, contentType: req.file.mimetype };
    }
    if (!text && !photo) return res.status(400).json({ error: 'Write something or attach a photo.' });

    const post = await Post.create({
      authorId: req.user._id,
      authorPublic: Boolean(req.user.isPublic),
      author: { username: req.user.username },
      audience,
      text,
      cvStatus,
      photoStatus,
      photo,
    });
    res.status(201).json({ post: { _id: post._id, text, audience, photoStatus }, cvStatus: cvStatus || undefined, photoStatus });
  } catch (err) {
    console.error('post failed:', err);
    res.status(500).json({ error: 'Could not save the post.' });
  }
});

app.delete('/api/feed/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (String(post.authorId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }
    await post.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error('delete post failed:', err);
    res.status(500).json({ error: 'Could not delete post.' });
  }
});

app.post('/api/feed/:id/comments', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const isFriend = Boolean(await Friendship.exists({ pairKey: pairKey(req.user._id, post.authorId), status: 'FRIENDS' }));
  if (!canViewPost(post, req.user._id, isFriend)) return res.status(404).json({ error: 'Post not found.' });

  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Write a comment first.' });
  const verdict = moderateComment(text);
  if (!verdict.allowed) return res.status(400).json({ error: MESSAGES[verdict.reason] || 'Keep comments clean and fitness-related.' });

  if (!(await isSupportiveText(text))) {
    return res.status(400).json({ error: MESSAGES.uncivil });
  }

  post.comments.push({ authorId: req.user._id, author: { username: req.user.username }, text });
  await post.save();
  const saved = post.comments[post.comments.length - 1];
  res.status(201).json({ comment: { _id: saved._id, author: saved.author, text: saved.text, createdAt: saved.createdAt, mine: true } });
});

app.delete('/api/feed/:id/comments/:cid', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const c = post.comments.id(req.params.cid);
  if (!c) return res.status(404).json({ error: 'Comment not found.' });
  if (String(c.authorId) !== String(req.user._id) && String(post.authorId) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  c.deleteOne();
  await post.save();
  res.json({ ok: true });
});

// ---------------- Instagram-style User Profile Lookup ----------------
app.get('/api/users/:username/profile', requireAuth, async (req, res) => {
  const uname = String(req.params.username || '').trim().replace(/^@/, '');
  const target = await User.findOne({ username: new RegExp(`^${escapeRegExp(uname)}$`, 'i') }, 'username displayName bio avatarUrl isPublic allowStatsIndexing').lean();
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const me = req.user._id;
  const isSelf = String(target._id) === String(me);
  const f = isSelf ? null : await Friendship.findOne({ pairKey: pairKey(me, target._id) }).lean();
  const state = isSelf ? 'SELF' : stateFor(f, me);
  const canView = isSelf || Boolean(target.isPublic) || state === 'FRIENDS';
  const quirks = await computeFitnessQuirks([target]);

  let posts = [];
  
    if (canView) {
    const allowedAudiences = isSelf ? ['PRIVATE', 'FRIENDS', 'PUBLIC'] : state === 'FRIENDS' ? ['FRIENDS', 'PUBLIC'] : ['PUBLIC'];
    const raw = await Post.find(
      { authorId: target._id, audience: { $in: allowedAudiences }, ...(isSelf ? {} : { photoStatus: { $in: ['none', 'approved'] } }) },
      { photo: 0 }
    ).sort({ createdAt: -1 }).limit(20).lean();
    posts = raw.map(({ authorId, authorPublic, ...p }) => ({
      ...p,
      hasPhoto: p.photoStatus !== 'none',
      photoUrl: p.photoStatus !== 'none' ? `/api/feed/${p._id}/photo` : null,
      comments: (p.comments || []).map((c) => ({ ...c, mine: String(c.authorId) === String(me) })),
    }));
  }

  res.json({
    user: {
      id: String(target._id),
      username: target.username,
      displayName: target.displayName || target.username,
      bio: canView ? (target.bio || '') : '',
      fitnessQuirk: quirks.get(String(target._id)) || null,
      avatarUrl: target.avatarUrl || null,
      isPublic: Boolean(target.isPublic),
    },
    state,
    canView,
    posts,
  });
});

// ---------------- 24-Hour Stories (FR-23..FR-26 + Viewers List) ----------------
app.get('/api/stories/mine', requireAuth, async (req, res) => {
  const rows = await Story.find({ authorId: req.user._id }, { photo: 0 }).sort({ createdAt: -1 }).lean();
  res.json({
    stories: rows.map((s) => ({
      id: String(s._id),
      audience: s.audience || 'FRIENDS',
      text: s.text,
      hasPhoto: Boolean(s.hasPhoto),
      photoUrl: s.hasPhoto ? `/api/stories/${s._id}/photo` : null,
      viewers: (s.viewers || []).map((v) => ({ username: v.username, viewedAt: v.viewedAt })),
      reactions: (s.reactions || []).map((r) => ({ username: r.username, emoji: r.emoji })),
      createdAt: s.createdAt,
    })),
  });
});

app.get('/api/stories/feed', requireAuth, async (req, res) => {
  const me = req.user._id;
  const fIds = await friendIdsOf(me);
  const rows = await Story.find(
    {
      $or: [
        { authorId: me },
        { authorId: { $in: fIds }, audience: { $in: ['FRIENDS', 'PUBLIC'] } },
        { audience: 'PUBLIC' },
      ],
    },
    { photo: 0 }
  ).sort({ createdAt: -1 }).limit(120).lean();

  const authorIds = [...new Set(rows.map((r) => String(r.authorId)))];
  const authors = authorIds.length
    ? await User.find({ _id: { $in: authorIds } }, 'username displayName avatarUrl isPublic').lean()
    : [];
  const byId = new Map(authors.map((a) => [String(a._id), a]));

  res.json({
    stories: rows.map((s) => {
      const a = byId.get(String(s.authorId));
      const mine = String(s.authorId) === String(me);
      return {
        id: String(s._id),
        mine,
        audience: s.audience || 'FRIENDS',
        author: {
          id: String(s.authorId),
          username: a?.username || 'user',
          displayName: a?.displayName || a?.username || 'User',
          avatarUrl: a?.avatarUrl || null,
        },
        text: s.text,
        hasPhoto: Boolean(s.hasPhoto),
        photoUrl: s.hasPhoto ? `/api/stories/${s._id}/photo` : null,
        viewers: mine ? (s.viewers || []).map((v) => ({ username: v.username, viewedAt: v.viewedAt })) : undefined,
        viewedByMe: (s.viewers || []).some((v) => String(v.userId) === String(me)),
        reactions: (s.reactions || []).map((r) => ({ username: r.username, emoji: r.emoji })),
        createdAt: s.createdAt,
      };
    }),
  });
});

app.post('/api/stories/:id/view', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  const s = await Story.findById(req.params.id);
  if (!s) return res.sendStatus(404);
  if (String(s.authorId) !== String(req.user._id)) {
    const already = (s.viewers || []).some((v) => String(v.userId) === String(req.user._id));
    if (!already) {
      s.viewers.push({ userId: req.user._id, username: req.user.username, viewedAt: new Date() });
      await s.save();
    }
  }
  res.json({ ok: true, count: (s.viewers || []).length });
});

app.post('/api/stories/:id/react', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  const emoji = ['💪', '🔥', '👏', '❤️'].includes(req.body?.emoji) ? req.body.emoji : null;
  if (!emoji) return res.status(400).json({ error: 'Invalid reaction.' });
  const s = await Story.findById(req.params.id);
  if (!s) return res.sendStatus(404);

  if (!Array.isArray(s.reactions)) s.reactions = [];
    const idx = s.reactions.findIndex(
      (r) => String(r.userId) === String(req.user._id) && r.emoji === emoji
    );
  if (idx >= 0) s.reactions.splice(idx, 1);
  else s.reactions.push({ userId: req.user._id, username: req.user.username, emoji });

  await s.save();
  res.json({ reactions: (s.reactions || []).map((r) => ({ username: r.username, emoji: r.emoji })) });
});

app.get('/api/stories/:id/photo', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  const s = await Story.findById(req.params.id);
  if (!s?.photo?.data) return res.sendStatus(404);
  res.set('Content-Type', s.photo.contentType || 'image/jpeg').set('Cache-Control', 'private, max-age=300').send(s.photo.data);
});

app.post('/api/stories', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const audience = req.body?.audience === 'PUBLIC' && req.user.isPublic ? 'PUBLIC' : 'FRIENDS';
    if (text) {
      const verdict = moderateCaption(text);
      if (!verdict.allowed) return res.status(400).json({ error: MESSAGES[verdict.reason] || 'Keep stories fitness-related.' });
    }
    let photo;
    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only image files allowed.' });
      const cv = await checkPhoto(req.file);
      if (cv.outcome === 'rejected') return res.status(422).json({ error: 'Please upload a valid workout/fitness photo.' });
      photo = { data: req.file.buffer, contentType: req.file.mimetype };
    }
    if (!text && !photo) return res.status(400).json({ error: 'Add a workout win or photo for your 24h story.' });

    const s = await Story.create({ authorId: req.user._id, audience, text, hasPhoto: Boolean(photo), photo });
    res.status(201).json({
      id: String(s._id),
      audience: s.audience,
      text: s.text,
      hasPhoto: s.hasPhoto,
      photoUrl: s.hasPhoto ? `/api/stories/${s._id}/photo` : null,
      viewers: [],
      createdAt: s.createdAt,
    });
  } catch (err) {
    console.error('story failed:', err);
    res.status(500).json({ error: 'Could not post story.' });
  }
});

app.delete('/api/stories/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  await Story.deleteOne({ _id: req.params.id, authorId: req.user._id });
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`Express running on http://localhost:${PORT}`));
