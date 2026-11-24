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
import { moderateCaption, MESSAGES } from './moderation.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' })); // room for a small profile-photo data URL

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
  password: String,
  phone: String,
  calorieGoal: { type: Number, default: 2200 },
  role: { type: String, default: 'user' },
  isPublic: { type: Boolean, default: false },
  defaultAudience: { type: String, enum: AUDIENCES, default: 'FRIENDS' },
  avatarUrl: String,
  isDemo: { type: Boolean, default: false },
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
  exercise: String, name: String, weight: Number, reps: Number, sets: Number, createdAt: { type: Date, default: Date.now }
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
  createdAt: { type: Date, default: Date.now }
}));


// One document per PAIR of users, whichever direction the request went (see pairKey in visibility.js).
//   PENDING = `requester` asked, the other person hasn't answered. FRIENDS = accepted.
//   Declining, cancelling and unfriending all just delete the document.
const Friendship = mongoose.model('Friendship', new mongoose.Schema({
  pairKey: { type: String, required: true, unique: true },
  users: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], index: true }, // [a, b]
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['PENDING', 'FRIENDS'], default: 'PENDING' },
}, { timestamps: true }));

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
const CV_URL = (process.env.CV_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
const CV_APPROVE = Number(process.env.CV_APPROVE ?? 0.6);
const CV_REVIEW = Number(process.env.CV_REVIEW ?? 0.4);

// -> { outcome: 'approved' | 'review' | 'rejected', confidence, mode, note }
async function checkPhoto(file) {
  if (process.env.CV_ENABLED === 'false') return { outcome: 'approved', note: 'CV check disabled' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
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
  email: u.email, 
  calorieGoal: u.calorieGoal || 2200,
  avatarUrl: u.avatarUrl || null,
  isPublic: Boolean(u.isPublic),
  defaultAudience: u.defaultAudience || 'FRIENDS',
});
const PROFILE_FIELDS = 'username displayName email calorieGoal avatarUrl isPublic defaultAudience';
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
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await User.create({ email, username, displayName, password: hashedPassword, phone: phone || undefined, calorieGoal });
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
  const transport = getMailer();
  if (!transport) return false;
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: `Your FitFollow code: ${code}`,
    text: `Your FitFollow password reset code is ${code}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;color:#101544">
        <p>Your FitFollow password reset code is</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:12px 0">${code}</p>
        <p style="color:#555">It expires in 10 minutes. If this wasn't you, ignore this email.</p>
      </div>`,
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
    set.displayName = name;
  }
  if (b.isPublic !== undefined) set.isPublic = b.isPublic === true;
  if (b.defaultAudience !== undefined) {
    if (!AUDIENCES.includes(b.defaultAudience)) return res.status(400).json({ error: 'Unknown audience.' });
    set.defaultAudience = b.defaultAudience;
  }
  if (b.avatarUrl !== undefined) {
    if (b.avatarUrl !== null && !isValidAvatar(b.avatarUrl)) {
      return res.status(400).json({ error: 'That photo is too large or not a JPEG/PNG/WebP image.' });
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
  res.json({ entries, foods: BUILTIN_FOODS, totals, goal: req.user.calorieGoal || 2200 });
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

app.put('/api/profile', requireAuth, async (req, res) => {
  const { age, heightIn, weightLb, sex, activity, goal } = req.body || {};
  const bmrBase = 10 * (Number(weightLb) * 0.453592) + 6.25 * (Number(heightIn) * 2.54) - 5 * Number(age);
  const bmr = sex === 'male' ? bmrBase + 5 : sex === 'female' ? bmrBase - 161 : bmrBase - 78;
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[activity] || 1.375;
  const tdee = Math.round(bmr * mult);
  const bmi = Math.round(((Number(weightLb) / (Number(heightIn) ** 2)) * 703) * 10) / 10;
  const usedGoal = goal === 'auto' ? (bmi >= 25 ? 'lose' : bmi < 18.5 ? 'gain' : 'maintain') : goal;
  const calorieGoal = Math.max(1200, Math.min(5000, tdee + (usedGoal === 'lose' ? -400 : usedGoal === 'gain' ? 300 : 0)));
  await User.findByIdAndUpdate(req.user._id, { calorieGoal });
  res.json({ ok: true, calorieGoal, plan: { bmi, category: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese', goalUsed: usedGoal } });
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
app.get('/api/sessions', requireAuth, async (req, res) => res.json({ sessions: await WorkoutSession.find({ userId: req.user._id }).sort({ createdAt: -1 }) }));
app.post('/api/sessions', requireAuth, async (req, res) => {
  const weight = Number(req.body.weight || 0);
  const reps = Number(req.body.reps || 0);
  const sets = Number(req.body.sets || 0);
  if (weight < 0 || weight > 2000 || reps <= 0 || reps > 500 || sets <= 0 || sets > 100) {
    return res.status(400).json({ error: 'Enter realistic weight (0–2000), reps (1–500), and sets (1–100).' });
  }
  const prevBest = await WorkoutSession.findOne({ userId: req.user._id, exercise: req.body.exercise }).sort({ weight: -1 });
  const isPR = !prevBest || weight > (prevBest.weight || 0);
  const session = await WorkoutSession.create({ ...req.body, userId: req.user._id, weight, reps, sets });
  res.status(201).json({ session, isPR });
});
app.get('/api/presets', requireAuth, (req, res) => res.json({
  presets: [
    { id: 'p1', name: 'Push Day (Bench, OHP, Triceps)' },
    { id: 'p2', name: 'Pull Day (Deadlift, Rows, Curls)' },
    { id: 'p3', name: 'Leg Day (Squat, RDL, Calf Raises)' }
  ]
}));
app.post('/api/presets/:id/start', requireAuth, async (req, res) => {
  const names = { p1: 'Push Day', p2: 'Pull Day', p3: 'Leg Day' };
  await WorkoutSession.create({ userId: req.user._id, name: names[req.params.id] || 'Preset Workout' });
  res.json({ ok: true });
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

// ---------------- Friends ----------------
const stateFor = (f, meId) => (!f ? 'NONE' : f.status === 'FRIENDS' ? 'FRIENDS' : String(f.requester) === String(meId) ? 'REQUEST_SENT' : 'REQUEST_RECEIVED');
const brief = (u) => ({ id: String(u._id), username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl || null });
const friendIdsOf = async (meId) => (await Friendship.find({ users: meId, status: 'FRIENDS' }, 'users').lean())
  .map((f) => f.users.find((id) => String(id) !== String(meId)));

app.get('/api/friends', requireAuth, async (req, res) => {
  const me = req.user._id;
  const rows = await Friendship.find({ users: me }).populate('users', 'username displayName avatarUrl').lean();
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

app.get('/api/friends/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '');
  if (q.length < 2) return res.json({ users: [] });
  const me = req.user._id;
  const rx = new RegExp(escapeRegExp(q), 'i');
  const lower = q.toLowerCase();
  const rank = (u) => (u.username.toLowerCase().startsWith(lower) ? 0 : (u.displayName || '').toLowerCase().startsWith(lower) ? 1 : 2);
  const found = (await User.find({ $or: [{ username: rx }, { displayName: rx }], _id: { $ne: me } }, 'username displayName avatarUrl').limit(100).lean())
    .sort((x, y) => rank(x) - rank(y) || x.username.localeCompare(y.username))
    .slice(0, 20);
  const rels = await Friendship.find({ users: me, pairKey: { $in: found.map((u) => pairKey(me, u._id)) } }).lean();
  const byKey = new Map(rels.map((f) => [f.pairKey, f]));
  res.json({ users: found.map((u) => ({ ...brief(u), state: stateFor(byKey.get(pairKey(me, u._id)), me) })) });
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

// ---------------- Feed (privacy-filtered: Home + Discover) ----------------
app.get('/api/feed', requireAuth, async (req, res) => {
  const me = req.user._id;
  const scope = req.query.scope === 'discover' ? 'discover' : 'friends';
  const filter = feedFilter(me, scope === 'friends' ? await friendIdsOf(me) : [], scope);
  const posts = await Post.find(filter, { photo: 0 }).sort({ createdAt: -1 }).limit(60).lean();

  const ids = [...new Set(posts.map((p) => p.authorId).filter(Boolean).map(String))];
  const authors = ids.length ? await User.find({ _id: { $in: ids } }, 'username displayName avatarUrl').lean() : [];
  const byId = new Map(authors.map((a) => [String(a._id), a]));
  res.json({
    scope,
    posts: posts.map(({ authorId, authorPublic, ...p }) => {
      const a = byId.get(String(authorId));
      return {
        ...p,
        mine: String(authorId) === String(me),
        author: { username: a?.username || p.author?.username, displayName: a?.displayName, avatarUrl: a?.avatarUrl || null },
        hasPhoto: p.photoStatus !== 'none',
        photoUrl: p.photoStatus !== 'none' ? `/api/feed/${p._id}/photo` : null,
      };
    }),
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



const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`Express running on http://localhost:${PORT}`));