/**
 * FitFollow plan maths. ONE file, used in two places (keep the copies identical):
 *   client/src/lib/plan.js         (BMI preview + form validation in the browser)
 *   express-server/src/plan.js     (the server re-validates everything and decides the real calorie goal)
 * Pure functions, no dependencies.
 *
 * Calorie goal = Mifflin-St Jeor BMR x activity multiplier + goal adjustment (the same +300 / 0 / -400 the
 * landing page already promised), rounded to 10 and kept inside a safe range.
 */
export const ACTIVITY = [
  { id: 'sedentary', label: 'Mostly sitting', mult: 1.2 },
  { id: 'light', label: 'Light: 1-3 workouts a week', mult: 1.375 },
  { id: 'moderate', label: 'Moderate: 3-5 workouts a week', mult: 1.55 },
  { id: 'very', label: 'Very active: 6-7 workouts a week', mult: 1.725 },
];
export const SEXES = [
  { id: 'female', label: 'Female', constant: -161 },
  { id: 'male', label: 'Male', constant: 5 },
  { id: 'other', label: 'Prefer not to say', constant: -78 }, // midpoint of the two
];
export const GOALS = [
  { id: 'auto', label: 'Recommended for my BMI' },
  { id: 'lose', label: 'Lose fat (-400 kcal/day)', adjust: -400 },
  { id: 'maintain', label: 'Maintain (+0 kcal/day)', adjust: 0 },
  { id: 'gain', label: 'Build muscle (+300 kcal/day)', adjust: 300 },
];

export const LIMITS = {
  age: { min: 13, max: 100, label: 'Age', unit: ' years' },
  heightIn: { min: 48, max: 96, label: 'Height', unit: ' inches' },
  weightLb: { min: 66, max: 660, label: 'Weight', unit: ' lbs' },
};
export const CAL_MIN = 1200;
export const CAL_MAX = 4500;
export const DEFAULT_CALORIES = 2200; // only used until the user has a plan

const NUMBER_RE = /^\s*\d+(\.\d+)?\s*$/;
const toNumber = (v) => (typeof v === 'number' ? v : typeof v === 'string' && NUMBER_RE.test(v) ? Number(v) : NaN);
const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const has = (list, id) => list.some((x) => x.id === id);

/** -> { ok, errors: {field: message}, value: cleaned profile }.  Works on form strings or JSON numbers. */
export function validateProfile(input) {
  const p = input || {};
  const errors = {};
  const value = {};

  for (const key of ['age', 'heightIn', 'weightLb']) {
    const { min, max, label, unit } = LIMITS[key];
    if (blank(p[key])) {
      errors[key] = `${label} is required.`;
      continue;
    }
    const n = toNumber(p[key]);
    if (!Number.isFinite(n)) errors[key] = `${label} must be a number.`;
    else if (key === 'age' && !Number.isInteger(n)) errors[key] = 'Age must be a whole number.';
    else if (n < min || n > max) errors[key] = `${label} must be between ${min} and ${max}${unit}.`;
    else value[key] = key === 'age' ? n : Math.round(n * 10) / 10;
  }

  if (!has(SEXES, p.sex)) errors.sex = 'Choose one option.';
  else value.sex = p.sex;

  if (!has(ACTIVITY, p.activity)) errors.activity = 'Choose how active you are.';
  else value.activity = p.activity;

  const goal = blank(p.goal) ? 'auto' : p.goal;
  if (!has(GOALS, goal)) errors.goal = 'Choose a goal.';
  else value.goal = goal;

  return { ok: Object.keys(errors).length === 0, errors, value };
}

export const bmi = (heightIn, weightLb) => Math.round(((weightLb / heightIn ** 2) * 703) * 10) / 10;

export function bmiCategory(b) {
  if (b < 18.5) return 'Underweight';
  if (b < 25) return 'Healthy';
  if (b < 30) return 'Overweight';
  return 'Obese';
}

/** -> null when the profile is incomplete/invalid, else { bmi, category, bmr, tdee, goalUsed, adjust, calories } */
export function computeGoals(profile) {
  const v = validateProfile(profile);
  if (!v.ok) return null;
  const { age, heightIn, weightLb, sex, activity, goal } = v.value;

  const kg = weightLb * 0.45359237;
  const cm = heightIn * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + SEXES.find((s) => s.id === sex).constant;
  const tdee = bmr * ACTIVITY.find((a) => a.id === activity).mult;

  const b = bmi(heightIn, weightLb);
  const goalUsed = goal === 'auto' ? (b < 18.5 ? 'gain' : b < 25 ? 'maintain' : 'lose') : goal;
  const adjust = GOALS.find((g) => g.id === goalUsed).adjust;

  const raw = Math.round((tdee + adjust) / 10) * 10;
  return {
    bmi: b,
    category: bmiCategory(b),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    goalUsed,
    adjust,
    calories: Math.min(CAL_MAX, Math.max(CAL_MIN, raw)),
  };
}