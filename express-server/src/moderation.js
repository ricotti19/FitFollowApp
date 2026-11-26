/**
 * moderation.js
 * Text moderation for FitFollow captions (posts, stories, messages) and profile bios.
 * Tested by test/moderation.test.js (run: npx jest moderation.test.js)
 *
 * Profanity words come from the bad-words package (npm install bad-words).
 * On top of that, this file catches tricks bad-words misses ("$hit", "shiiiiit",
 * hidden characters), plus spam, off-topic text, length, and bad input.
 *
 * moderateCaption(text) returns: { allowed: boolean, reason: string }   (max 2000 chars)
 * moderateBio(bio)      returns: { allowed: boolean, reason: string }   (max 160 chars)
 * reason is one of: ok, profanity, spam, off_topic, too_long, invalid_input
 *
 * Empty input is allowed for both (a photo-only post, or clearing your bio).
 *
 * If text breaks more than one rule, the reason follows this order:
 *   invalid_input > too_long > profanity > spam > off_topic
 */

const MAX_CAPTION_LENGTH = 2000;
const MAX_BIO_LENGTH = 160;

const REASONS = Object.freeze({
  OK: "ok",
  PROFANITY: "profanity",
  UNCIVIL: "uncivil",
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

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
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
const squish = (word) => word.replace(/(.)\1{2,}/g, "$1");
const PROFANITY_SQUISHED = new Set([...PROFANITY].map(squish));

const FITNESS_WORDS = new Set([
  // training, splits & gym culture
  "workout", "workouts", "train", "training", "trained", "gym", "gymrat", "gymlife", "fitness", "fit",
  "lift", "lifts", "lifting", "lifted", "lifter", "lifters", "weights", "weightlifting", "powerlifting",
  "powerlifter", "bodybuilding", "bodybuilder", "olympic", "weightlifter", "strongman", "crossfit", "crossfitter",
  "hypertrophy", "strength", "conditioning", "metcon", "amrap", "emom", "tabata", "circuit", "circuits",
  "ppl", "push", "pull", "upper", "lower", "fullbody", "split", "splits", "bro", "routine", "program",
  "rep", "reps", "set", "sets", "superset", "supersets", "dropset", "dropsets", "failure", "rpe", "rir",
  "pr", "prs", "pb", "pbs", "max", "1rm", "orm", "volume", "intensity", "overload", "deload",
  "form", "cue", "cues", "spot", "spotter", "coach", "coaching", "trainer", "session", "sessions",
  // specific exercises & equipment
  "squat", "squats", "squatting", "frontsquat", "goblet", "hacksquat", "bench", "benching", "incline", "decline",
  "deadlift", "deadlifts", "deadlifting", "rdl", "rdls", "sumo", "conventional", "trapbar", "rackpull",
  "press", "pressing", "ohp", "overhead", "arnold", "fly", "flies", "flyes", "crossover", "pec",
  "curl", "curls", "curling", "hammer", "preacher", "concentration", "extension", "extensions", "skullcrusher",
  "row", "rows", "rowing", "rower", "pendlay", "tbar", "lat", "lats", "pulldown", "pulldowns",
  "pullup", "pullups", "chinup", "chinups", "muscleup", "muscleups", "pushup", "pushups", "dips", "dip",
  "plank", "planks", "planking", "crunch", "crunches", "situp", "situps", "legraise", "flutter", "hollow",
  "lunge", "lunges", "lunging", "bulgarian", "stepup", "stepups", "hipthrust", "thrust", "bridge", "calf",
  "shrug", "shrugs", "raise", "raises", "lateral", "facepull", "facepulls", "burpee", "burpees", "thruster",
  "snatch", "clean", "jerk", "swing", "swings", "turkish", "getup", "farmer", "carry", "carries", "sled",
  "calisthenics", "kettlebell", "kettlebells", "dumbbell", "dumbbells", "barbell", "barbells", "plate", "plates",
  "cable", "cables", "machine", "rack", "squatrack", "smith", "treadmill", "stairmaster", "elliptical", "erg",
  "band", "bands", "resistance", "trx", "bosu", "foam", "roller", "chalk", "belt", "straps", "sleeves", "wraps",
  // anatomy & muscle groups
  "leg", "legs", "legday", "arm", "arms", "chest", "back", "shoulder", "shoulders", "delts", "rear",
  "abs", "core", "obliques", "glute", "glutes", "bicep", "biceps", "tricep", "triceps", "forearm", "forearms",
  "quad", "quads", "hamstring", "hamstrings", "calves", "trap", "traps", "rhomboids", "hip", "hips", "flexors",
  "muscle", "muscles", "muscular", "physique", "vascular", "pump", "pumped", "swole", "jacked", "toned", "toning",
  // cardio, running, cycling & endurance
  "cardio", "aerobic", "anaerobic", "vo2", "zone2", "heartrate", "bpm", "sweat", "sweating", "sweaty",
  "hiit", "liss", "run", "ran", "running", "runner", "runners", "jog", "jogging", "jogger",
  "sprint", "sprints", "sprinting", "sprinter", "strides", "fartlek", "intervals", "tempo", "threshold",
  "mile", "miles", "mileage", "km", "kilometers", "5k", "10k", "15k", "half", "marathon", "marathoner",
  "ultra", "ultramarathon", "ultrarunner", "triathlon", "triathlete", "ironman", "duathlon", "biathlon",
  "track", "trail", "trails", "trailrun", "roadrun", "pace", "pacing", "splits", "cadence", "endurance", "stamina",
  "walk", "walked", "walking", "walker", "walkers", "steps", "10ksteps", "ruck", "rucking", "rucksack",
  "hike", "hiked", "hiking", "hiker", "hikers", "summit", "elevation", "incline", "trek", "trekking",
  "bike", "biked", "biking", "bicycle", "cyclist", "cyclists", "cycling", "ride", "riding", "rider",
  "spin", "spinning", "peloton", "zwift", "gravel", "mtb", "mountainbike", "watt", "watts", "ftp",
  // swimming & water sports
  "swim", "swam", "swimming", "swimmer", "swimmers", "laps", "pool", "freestyle", "backstroke", "breaststroke",
  "butterfly", "openwater", "surf", "surfer", "surfing", "paddle", "paddleboard", "kayak", "kayaking", "crew",
  // mind-body, flexibility & dance
  "yoga", "yogi", "yogis", "vinyasa", "hatha", "ashtanga", "yin", "bikram", "hotyoga", "asana", "flow",
  "pilates", "reformer", "mat", "stretch", "stretching", "stretched", "mobility", "flexibility", "flexible",
  "warm", "warmup", "cooldown", "posture", "alignment", "balance", "stability", "breathwork", "meditation",
  "dance", "dancing", "dancer", "dancers", "choreo", "choreography", "zumba", "barre", "ballet", "ballerina",
  "hiphop", "salsa", "bachata", "bharatanatyam", "kathak", "kuchipudi", "bollywood", "contemporary", "jazz", "tap",
  // combat & martial arts
  "box", "boxing", "boxer", "kickboxing", "kickboxer", "muaythai", "mma", "ufc", "martial", "karate",
  "taekwondo", "judo", "bjj", "jiujitsu", "grappling", "wrestling", "wrestler", "sparring", "heavybag", "shadowbox",
  // team, court & outdoor sports
  "sport", "sports", "athlete", "athletes", "athletic", "athletics", "varsity", "intramural", "rec", "league",
  "basketball", "hoops", "hooper", "soccer", "futbol", "football", "rugby", "lacrosse", "hockey", "baseball", "softball",
  "tennis", "pickleball", "badminton", "squash", "racquetball", "pingpong", "tabletennis", "volleyball", "beach",
  "cricket", "golf", "golfer", "golfing", "skate", "skating", "skateboard", "rollerblade", "iceskate",
  "climb", "climbing", "climber", "climbers", "bouldering", "boulder", "belay", "toprope", "crag",
  "ski", "skiing", "skier", "snowboard", "snowboarding", "snowshoe", "cross", "country",
  // recovery, sleep & wellness
  "rest", "restday", "recovery", "recover", "recovering", "sore", "soreness", "doms", "fatigue",
  "sauna", "coldplunge", "icebath", "massage", "theragun", "physio", "pt", "rehab", "prehab", "injury",
  "sleep", "sleeping", "slept", "circadian", "wellness", "health", "healthy", "active", "lifestyle", "longevity",
  // goals, mindset & gym slang
  "gains", "gainz", "shred", "shredded", "lean", "leaning", "bulk", "bulking", "cut", "cutting", "recomp",
  "consistency", "consistent", "discipline", "disciplined", "dedication", "grind", "grinding", "hustle",
  "mindset", "focus", "habit", "habits", "streak", "daily", "morning", "5am", "earlybird", "noexcuses",
  "personal", "best", "progress", "transformation", "journey", "milestone", "milestones", "goal", "goals",
  // food, macros & nutrition
  "meal", "meals", "mealprep", "prep", "prepping", "prepped", "food", "foods", "fuel", "fueling", "fueled",
  "protein", "proteins", "carbs", "carb", "carbohydrates", "fats", "fat", "lipids", "fiber", "macros", "macro", "micros",
  "kcal", "calories", "calorie", "caloric", "deficit", "surplus", "maintenance", "tdee", "bmr",
  "diet", "dieting", "dietary", "nutrition", "nutritious", "wholefoods", "clean", "cleaneating", "cheat", "cheatmeal", "refeed",
  "breakfast", "lunch", "dinner", "snack", "snacks", "snacking", "ate", "eat", "eating", "fast", "fasting", "if",
  "chicken", "breast", "turkey", "beef", "steak", "sirloin", "salmon", "tuna", "tilapia", "cod", "shrimp", "fish",
  "egg", "eggs", "eggwhites", "tofu", "tempeh", "edamame", "lentils", "beans", "chickpeas", "quinoa",
  "rice", "brownrice", "basmati", "oats", "oatmeal", "overnight", "pasta", "bread", "sourdough", "sweetpotato", "potato",
  "broccoli", "spinach", "kale", "asparagus", "avocado", "veggies", "vegetables", "greens", "salad", "bowl",
  "fruit", "fruits", "banana", "bananas", "berries", "blueberries", "strawberries", "apple", "apples",
  "yogurt", "greek", "cottage", "cheese", "milk", "almond", "soy", "peanut", "butter", "nuts", "almonds", "chia",
  "shake", "shakes", "smoothie", "smoothies", "whey", "casein", "isolate", "creatine", "bcaa", "eaa",
  "preworkout", "pre", "postworkout", "electrolytes", "sodium", "potassium", "magnesium", "zinc", "vitamin", "vitamins",
  "omega", "fishoil", "collagen", "caffeine", "espresso", "matcha", "hydrate", "hydration", "hydrated", "water", "gallon",
  // body metrics & measurements
  "weight", "weigh", "weighing", "weighin", "weighins", "scale", "lb", "lbs", "kg", "kgs", "pounds", "kilos",
  "bodyweight", "waist", "chest", "hip", "hips", "thigh", "thighs", "neck", "inches", "cm", "bmi", "bodyfat", "bf",
  // Spanish fitness & nutrition
  "pierna", "piernas", "sentadilla", "sentadillas", "gimnasio", "entrenamiento", "entrenar",
  "entreno", "rutina", "pesas", "levantar", "correr", "corredor", "corredora", "caminar", "nadar",
  "comida", "comidas", "dieta", "nutricion", "proteina", "carbohidratos", "calorias", "agua",
  "salud", "saludable", "fuerza", "cardio", "récord", "record", "progreso", "meta", "metas",
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
// (U+200B-U+200F, U+2060-U+2064, U+FEFF, and the soft hyphen U+00AD)
const INVISIBLE = /[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/g;

// Letters people swap for numbers or symbols
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "@": "a", "!": "i", "|": "i" };

const clean = (text) => text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase();

const words = (text) => text.match(/[\p{L}\p{N}]+/gu) || [];

// Turns "sh1t", "$hit", "a$$" into plain letters, one token at a time
const deLeet = (token) =>
  token.replace(/(?<=\p{L})!(?=\p{L})/gu, "i").replace(/[013457$@|]/g, (c) => LEET[c]);


const SEVERE_ROOTS = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "retard",
  "whore", "slut", "dickhead", "motherfuck", "bullshit", "asshole", "dumbass",
];

const SAFE_SIMILAR = new Set(["duck", "luck", "puck", "tuck", "buck", "muck", "suck", "huck", "ruck", "yuck", "shot", "shut", "ship", "shin", "shop", "show", "shoe", "shed", "chef", "shift", "shirt", "short", "shoot", "shout", "sheet", "batch", "catch", "hatch", "latch", "match", "patch", "watch", "pitch", "ditch", "hitch", "witch", "stitch", "switch", "cant", "hunt", "punt", "runt", "aunt", "mint", "tint", "hint", "lint", "pint", "bent", "cent", "dent", "lent", "rent", "sent", "tent", "vent", "went"]);

function editDist1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let diffs = 0, i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diffs > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return diffs + (a.length - i) + (b.length - j) <= 1;
}

const OBFUSCATED_REGEX = /(f+u+[ck]{2,}|f+[ck]{2,}[a-z]*|s+h+[i1!*x]+[t7]+|b+[i1!*]+t+c+h+)/i;

function matchesFuzzyRoot(word) {
  if (OBFUSCATED_REGEX.test(word)) return true;
  for (const root of SEVERE_ROOTS) {
    if (word.includes(root)) return true;
    if (word.length < root.length) continue;
    for (let i = 0; i <= word.length - root.length; i++) {
      const slice = word.slice(i, i + root.length);
      if (!SAFE_SIMILAR.has(slice) && editDist1(slice, root)) return true;
    }
  }
  return false;
}

function hasProfanity(text) {
  // Split on spaces only first, so symbols inside a word ("$hit", "sh1t", "f.u.c.k") stay attached
  const rawTokens = text.split(/\s+/).filter(Boolean);

  // Also catch spaced-out words like "s h i t" or "f u c k"
  const joinedSingles = text.replace(/\b(\w)\s(?=\w\b)/g, "$1");

  const candidates = [...rawTokens, ...joinedSingles.split(/\s+/)];

  return candidates.some((raw) => {
    // Strip outer punctuation ("shit!!!" -> "shit") AND internal separators ("f.u.c.k" -> "fuck")
    const trimmed = raw
      .replace(/^[^\p{L}\p{N}$@]+|[^\p{L}\p{N}$@]+$/gu, "")
      .replace(/[._\-*]+/g, "");
    const plain = deLeet(trimmed).replace(/[^\p{L}]/gu, "");
    if (!plain) return false;
    const squished = squish(plain);
    if (matchesFuzzyRoot(plain) || matchesFuzzyRoot(squished)) return true;
    return PROFANITY.has(plain) || PROFANITY_SQUISHED.has(squished);
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

// Emoji-only text (💪🔥) is fine as long as there's no real text
const isOnlyEmoji = (text) => words(text).length === 0 && /\p{Extended_Pictographic}/u.test(text);

// ─────────────────────────────────────────────────────────────
// Main checks (used by the tests)
// ─────────────────────────────────────────────────────────────

// Shared pipeline for captions and bios; only the length limit differs.
function moderateText(text, maxLength) {
  // Nothing at all is fine (photo-only post, or clearing a bio)
  if (text === null || text === undefined) return result(REASONS.OK);
  if (typeof text !== "string") return result(REASONS.INVALID_INPUT);

  const trimmed = text.trim();
  if (trimmed === "") return result(REASONS.OK);

  // Count real characters, so one emoji counts as 1, not 2
  if ([...trimmed].length > maxLength) return result(REASONS.TOO_LONG);

  const cleaned = clean(trimmed);

  if (hasProfanity(cleaned)) return result(REASONS.PROFANITY);

  const tokens = words(cleaned);
  if (isSpam(cleaned, tokens)) return result(REASONS.SPAM);

  if (isOnlyEmoji(cleaned)) return result(REASONS.OK);
  if (!isOnTopic(cleaned)) return result(REASONS.OFF_TOPIC);

  return result(REASONS.OK);
}

function moderateCaption(text) {
  return moderateText(text, MAX_CAPTION_LENGTH);
}

// Bio: "" (or whitespace) is allowed so people can clear it. Max 160 characters.
// Must be clean and workout/fitness related.
function moderateBio(bio) {
  return moderateText(bio, MAX_BIO_LENGTH);
}


const INSULT_WORDS = new Set([
  "suck", "sucks", "sucked", "sucking", "loser", "losers", "idiot", "idiots",
  "stupid", "dumb", "pathetic", "trash", "garbage", "ugly", "fat", "fatty",
  "weakling", "quitter", "stfu", "kys",
]);
const INSULT_PHRASES = /\b(shut\s*up|kill\s+yourself)\b/i;

function hasInsult(cleaned) {
  if (INSULT_PHRASES.test(cleaned)) return true;
  return cleaned.split(/\s+/).some((raw) => {
    const plain = deLeet(raw.replace(/[._\-*]+/g, "")).replace(/[^\p{L}]/gu, "");
    if (!plain) return false;
    const squished = squish(plain).replace(/(ck){2,}/g, "ck");
    return INSULT_WORDS.has(plain) || INSULT_WORDS.has(squished);
  });
}

function moderateComment(text) {
  if (typeof text !== "string") return result(REASONS.INVALID_INPUT);
  const trimmed = text.trim();
  if (trimmed === "") return result(REASONS.INVALID_INPUT);
  if ([...trimmed].length > 500) return result(REASONS.TOO_LONG);
  const cleaned = clean(trimmed);
  if (hasProfanity(cleaned)) return result(REASONS.PROFANITY);
  if (hasInsult(cleaned)) return result(REASONS.UNCIVIL);
  const tokens = words(cleaned);
  if (isSpam(cleaned, tokens)) return result(REASONS.SPAM);
  return result(REASONS.OK);
}

// ─────────────────────────────────────────────────────────────
// Express middleware
// ─────────────────────────────────────────────────────────────
// Use on any route that saves a caption:
//   app.post("/api/posts", auth, captionModeration, createPost);

const MESSAGES = {
  profanity: "Please keep it clean. Your caption has language that isn't allowed.",
  uncivil: "Please keep comments supportive and respectful.",
  spam: "Links, ads, and contact info aren't allowed in captions.",
  off_topic: "Keep captions about your fitness journey: workouts, food, steps, or progress.",
  too_long: `Captions can be up to ${MAX_CAPTION_LENGTH} characters.`,
  invalid_input: "Caption must be text.",
};

const BIO_MESSAGES = {
  profanity: "Please keep it clean. Your bio has language that isn't allowed.",
  spam: "Links, ads, and contact info aren't allowed in bios.",
  off_topic: "Keep your bio about fitness: workouts, food, steps, or progress.",
  too_long: `Bios can be up to ${MAX_BIO_LENGTH} characters.`,
  invalid_input: "Bio must be text.",
};

function captionModeration(req, res, next) {
  const verdict = moderateCaption(req.body?.caption);
  if (verdict.allowed) return next();
  return res.status(400).json({ error: MESSAGES[verdict.reason], reason: verdict.reason });
}

export {
  moderateCaption,
  moderateBio,
  moderateComment,
  captionModeration,
  REASONS,
  MAX_CAPTION_LENGTH,
  MAX_BIO_LENGTH,
  MESSAGES,
  BIO_MESSAGES,
};
