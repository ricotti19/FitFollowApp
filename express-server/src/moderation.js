/**
 * moderation.js
 * Caption moderation for FitFollow posts and stories.
 * Tested by test/moderation.test.js (run: npx jest moderation.test.js)
 *
 * No API key or .env needed. Everything runs locally.
 * Profanity words come from the bad-words package (npm install bad-words).
 * On top of that, this file catches tricks bad-words misses ("$hit", "shiiiiit",
 * hidden characters), plus spam, off-topic captions, length, and bad input.
 *
 * moderateCaption(text) returns: { allowed: boolean, reason: string }
 * reason is one of: ok, profanity, spam, off_topic, too_long, invalid_input
 *
 * If a caption breaks more than one rule, the reason follows this order:
 *   invalid_input > too_long > profanity > spam > off_topic
 */

const MAX_CAPTION_LENGTH = 500;

const REASONS = Object.freeze({
  OK: "ok",
  PROFANITY: "profanity",
  SPAM: "spam",
  OFF_TOPIC: "off_topic",
  TOO_LONG: "too_long",
  INVALID_INPUT: "invalid_input",
});

const result = (reason) => ({ allowed: reason === REASONS.OK, reason });

// ─────────────────────────────────────────────────────────────
// Word lists
// ─────────────────────────────────────────────────────────────

// Word list from the bad-words package (about 900 words).
// Matched as WHOLE words only, so "class", "assistant", "Essex", and
// "cocktail" don't get blocked. To allow a word, add it to ALLOWED_WORDS.
let BadWords = require("bad-words");
BadWords = BadWords.Filter || BadWords; // works with old and new versions of the package

const ALLOWED_WORDS = []; // example: ["damn", "hell"] if we decide those are OK

const PROFANITY = new Set(
  new BadWords().list
    .map((w) => w.toLowerCase())
    .filter((w) => !ALLOWED_WORDS.includes(w))
);

// Same list with doubled letters squished ("ass" -> "as"), so stretched
// words like "shiiiiit" still match after we squish them too.
const squish = (word) => word.replace(/(.)\1+/g, "$1");
const PROFANITY_SQUISHED = new Set([...PROFANITY].map(squish));

// Words that make a caption count as fitness, food, body, or progress related.
const FITNESS_WORDS = new Set([
  // training
  "workout", "workouts", "train", "training", "trained", "gym", "lift", "lifts", "lifting", "lifted",
  "squat", "squats", "bench", "deadlift", "deadlifts", "press", "curl", "curls", "row", "rows",
  "rower", "pullup", "pullups", "pushup", "pushups", "plank", "lunge", "lunges", "dips",
  "rep", "reps", "set", "sets", "pr", "prs", "pb", "max", "form", "coach", "trainer",
  "leg", "legs", "arm", "arms", "chest", "back", "shoulders", "abs", "core", "glutes", "biceps", "triceps",
  "cardio", "hiit", "run", "ran", "running", "jog", "jogging", "sprint", "mile", "miles",
  "marathon", "walk", "walked", "walking", "steps", "hike", "hiked", "bike", "biked", "ride",
  "cycling", "spin", "swim", "swam", "swimming", "yoga", "pilates", "stretch", "stretching",
  "rest", "recovery", "sore", "gains", "shredded", "bulk", "bulking", "cut", "cutting",
  "personal", "best", "fitness", "fit", "athlete", "sport", "sports",
  // food tracking
  "meal", "meals", "prep", "protein", "carbs", "carb", "macros", "macro", "kcal", "calories",
  "calorie", "diet", "nutrition", "chicken", "rice", "broccoli", "oats", "oatmeal", "eggs",
  "salad", "shake", "whey", "veggies", "cheat",
  // body
  "weight", "weigh", "weighin", "lb", "lbs", "kg", "kgs", "pounds", "bodyweight",
  "progress", "transformation",
  // Spanish (some of our users)
  "pierna", "piernas", "sentadilla", "sentadillas", "gimnasio", "entrenamiento",
  "entreno", "rutina", "pesas", "correr", "comida", "proteina", "récord", "record",
]);

// Number patterns that are clearly lifting or tracking: 185x5, 3x10, 5k, 225lb, 250kcal, 10k
const FITNESS_PATTERN = /\b\d+\s*x\s*\d+|\b\d+(\.\d+)?\s*(k|lb|lbs|kg|kgs|kcal|cal|mi|km)\b/i;

// Fitness emoji: 💪 🔥 🏋 🏃 🚴 🏊 🧘 🥗 🍗 🥦 🥚 ⚖ 🦵 🏆 🥇
const FITNESS_EMOJI = /[\u{1F4AA}\u{1F525}\u{1F3CB}\u{1F3C3}\u{1F6B4}\u{1F3CA}\u{1F9D8}\u{1F957}\u{1F357}\u{1F966}\u{1F95A}\u{2696}\u{1F9B5}\u{1F3C6}\u{1F947}]/u;

const SPAM_PHRASES = [
  /\bbuy\b.*\bfollowers?\b/i,
  /\bfree followers?\b/i,
  /\bdm me\b/i,
  /\b(promo|discount|coupon) code\b/i,
  /\bclick (the )?link\b/i,
  /\bmake \$?\d+.*\b(day|week|from home)\b/i,
];

// ─────────────────────────────────────────────────────────────
// Text cleanup helpers
// ─────────────────────────────────────────────────────────────

// Zero-width and other invisible characters people use to hide words
const INVISIBLE = /[​-‏⁠-⁤﻿­]/g;

// Letters people swap for numbers or symbols
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "@": "a", "!": "i", "|": "i" };

const clean = (text) => text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase();

const words = (text) => text.match(/[\p{L}\p{N}]+/gu) || [];

// Turns "sh1t", "$hit", "a$$" into plain letters, one token at a time
const deLeet = (token) => token.replace(/[013457$@!|]/g, (c) => LEET[c]);

// ─────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────

function hasProfanity(text) {
  // Split on spaces only first, so symbols inside a word ("$hit", "sh1t") stay attached
  const rawTokens = text.split(/\s+/).filter(Boolean);

  // Also catch spaced-out words like "s h i t"
  const joinedSingles = text.replace(/\b(\w)\s(?=\w\b)/g, "$1");

  const candidates = [...rawTokens, ...joinedSingles.split(/\s+/)];

  return candidates.some((raw) => {
    // Strip punctuation at the edges ("shit!!!" -> "shit"), then undo leetspeak
    const trimmed = raw.replace(/^[^\p{L}\p{N}$@]+|[^\p{L}\p{N}$@]+$/gu, "");
    const plain = deLeet(trimmed).replace(/[^\p{L}]/gu, "");
    if (!plain) return false;
    return PROFANITY.has(plain) || PROFANITY_SQUISHED.has(squish(plain));
  });
}

function isSpam(text, tokens) {
  // Links
  if (/https?:\/\/|www\./i.test(text)) return true;
  if (/\b[\w-]+\.(com|net|org|io|ly|co|me|gg|xyz|shop|biz|info)\b(\/\S*)?/i.test(text)) return true;

  // Emails and phone numbers
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) return true;
  if (/(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(text)) return true;

  // Ad-style phrases
  if (SPAM_PHRASES.some((re) => re.test(text))) return true;

  // Same character over and over ("!!!!!!!!!!", "aaaaaaaaaaaa")
  if (/(.)\1{9,}/u.test(text)) return true;

  // Same word 5+ times in a row ("gains gains gains gains gains")
  let streak = 1;
  for (let i = 1; i < tokens.length; i++) {
    streak = tokens[i] === tokens[i - 1] ? streak + 1 : 1;
    if (streak >= 5) return true;
  }

  // One word is more than half of a long caption
  if (tokens.length >= 10) {
    const counts = {};
    for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
    if (Math.max(...Object.values(counts)) / tokens.length > 0.5) return true;
  }

  return false;
}

function isOnTopic(text) {
  // Hashtags don't count, so "#fitness" can't sneak an off-topic caption through
  const noTags = text.replace(/#[\p{L}\p{N}_]+/gu, " ");

  if (FITNESS_PATTERN.test(noTags)) return true;
  if (FITNESS_EMOJI.test(noTags)) return true;

  // Squish stretched words ("goooo", "legggs") before looking them up
  return words(noTags).some((w) => FITNESS_WORDS.has(w) || FITNESS_WORDS.has(squish(w)));
}

// Emoji-only captions (💪🔥) are fine as long as there's no real text
const isOnlyEmoji = (text) => words(text).length === 0 && /\p{Extended_Pictographic}/u.test(text);

// ─────────────────────────────────────────────────────────────
// Main check (used by the tests)
// ─────────────────────────────────────────────────────────────

function moderateCaption(text) {
  // No caption at all is fine (photo-only post)
  if (text === null || text === undefined) return result(REASONS.OK);
  if (typeof text !== "string") return result(REASONS.INVALID_INPUT);

  const trimmed = text.trim();
  if (trimmed === "") return result(REASONS.OK);

  // Count real characters, so one emoji counts as 1, not 2
  if ([...trimmed].length > MAX_CAPTION_LENGTH) return result(REASONS.TOO_LONG);

  const cleaned = clean(trimmed);

  if (hasProfanity(cleaned)) return result(REASONS.PROFANITY);

  const tokens = words(cleaned);
  if (isSpam(cleaned, tokens)) return result(REASONS.SPAM);

  if (isOnlyEmoji(cleaned)) return result(REASONS.OK);
  if (!isOnTopic(cleaned)) return result(REASONS.OFF_TOPIC);

  return result(REASONS.OK);
}

// ─────────────────────────────────────────────────────────────
// Express middleware
// ─────────────────────────────────────────────────────────────
// Use on any route that saves a caption:
//   app.post("/api/posts", auth, captionModeration, createPost);

const MESSAGES = {
  profanity: "Please keep it clean. Your caption has language that isn't allowed.",
  spam: "Links, ads, and contact info aren't allowed in captions.",
  off_topic: "Keep captions about your fitness journey: workouts, food, steps, or progress.",
  too_long: `Captions can be up to ${MAX_CAPTION_LENGTH} characters.`,
  invalid_input: "Caption must be text.",
};

function captionModeration(req, res, next) {
  const verdict = moderateCaption(req.body?.caption);
  if (verdict.allowed) return next();
  return res.status(400).json({ error: MESSAGES[verdict.reason], reason: verdict.reason });
}

module.exports = {
  moderateCaption,
  captionModeration,
  REASONS,
  MAX_CAPTION_LENGTH,
};