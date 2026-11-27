// express-server/src/fitnessCalc.js
// Soham's work
// The app's fitness math: calorie plan, personal records (PRs) and food totals.
// There is no database or network code here, so test/unit/fitness_calc.test.js can test it directly.
// server.js uses these functions.
import { escapeRegExp } from './visibility.js';

// ---------- Calorie plan: BMR (Mifflin-St Jeor) x activity level = TDEE, then adjust for the goal ----------

// The screen sends 'very' for "Very active". 'active' is also kept because the server already accepted it.
const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, active: 1.725 };

export function calcCaloriePlan({ age, heightIn, weightLb, sex, activity, goal }) {
  const bmrBase = 10 * (Number(weightLb) * 0.453592) + 6.25 * (Number(heightIn) * 2.54) - 5 * Number(age);
  const bmr = sex === 'male' ? bmrBase + 5 : sex === 'female' ? bmrBase - 161 : bmrBase - 78;
  const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[activity] || 1.375));

  const bmi = Math.round(((Number(weightLb) / (Number(heightIn) ** 2)) * 703) * 10) / 10;
  const category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const goalUsed = goal === 'auto' ? (bmi >= 25 ? 'lose' : bmi < 18.5 ? 'gain' : 'maintain') : goal;

  const adjust = goalUsed === 'lose' ? -400 : goalUsed === 'gain' ? 300 : 0;
  const calorieGoal = Math.max(1200, Math.min(5000, tdee + adjust));

  return { bmr, tdee, calorieGoal, plan: { bmi, category, goalUsed } };
}

// ---------- Personal records (FR-7) ----------

// A database filter for "the same exercise": capital letters and spaces at the ends do not matter.
// "bench press" matches "Bench Press", but not "Incline Bench Press".
export function exerciseNameMatcher(name) {
  return new RegExp(`^${escapeRegExp(String(name || '').trim())}$`, 'i');
}

// previousBest is the heaviest earlier log of this exercise (null if there is none).
// With no earlier weight to beat, this log is only the starting record, not a PR.
export function isPersonalRecord(previousBest, weight) {
  if (previousBest?.weight == null) return false;
  return Number(weight) > previousBest.weight;
}

// ---------- Food totals ----------

// Adds up calories and macros for a list of food entries. A missing value counts as 0.
export function sumNutrition(entries) {
  return entries.reduce((a, b) => ({
    calories: a.calories + (b.calories || 0),
    protein: a.protein + (b.protein || 0),
    carbs: a.carbs + (b.carbs || 0),
    fat: a.fat + (b.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}
