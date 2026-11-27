/**
 * fitness_calc.test.js
 * Soham's work 
 * Unit tests for the calorie plan (BMR/TDEE), personal records (PRs) and food totals.
 * No database, server or internet is needed.
 *
 * Run it from the express-server folder:
 *   node --test test/unit/fitness_calc.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calcCaloriePlan, exerciseNameMatcher, isPersonalRecord, sumNutrition } from '../../src/fitnessCalc.js';

// For numbers with decimals, which computers can't always store exactly.
const assertClose = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 0.001, `expected ${expected}, got ${actual}`);

// ─────────────────────────────────────────────────────────────
// 1. Calorie plan
// ─────────────────────────────────────────────────────────────

// The example person: 25 years old, 70 inches, 170 lb (BMI 24.4).
// plan() calculates for this person. Pass only what you want to change.
const person = { age: 25, heightIn: 70, weightLb: 170, sex: 'male', activity: 'moderate', goal: 'maintain' };
const plan = (changes = {}) => calcCaloriePlan({ ...person, ...changes });

describe('BMR and TDEE math', () => {
  test('BMR for a man (Mifflin-St Jeor formula, +5)', () => {
    assertClose(plan({ sex: 'male' }).bmr, 1762.3564);
  });

  test('BMR for a woman (-161)', () => {
    assertClose(plan({ sex: 'female' }).bmr, 1596.3564);
  });

  test('BMR for "prefer not to say" is in between (-78)', () => {
    assertClose(plan({ sex: 'other' }).bmr, 1679.3564);
  });

  for (const [activity, tdee] of [['sedentary', 2115], ['light', 2423], ['moderate', 2732], ['very', 3040]]) {
    test(`TDEE for activity level "${activity}" is ${tdee}`, () => {
      assert.equal(plan({ activity }).tdee, tdee);
    });
  }

  test('"active" gives the same TDEE as "very"', () => {
    assert.equal(plan({ activity: 'active' }).tdee, 3040);
  });

  test('a missing or unknown activity level counts as "light"', () => {
    assert.equal(plan({ activity: undefined }).tdee, 2423);
    assert.equal(plan({ activity: 'something-else' }).tdee, 2423);
  });

  test('numbers sent as text (like from a web form) give the same result', () => {
    assert.deepEqual(plan({ age: '25', heightIn: '70', weightLb: '170' }), plan());
  });
});

describe('Goals: lose, maintain, gain', () => {
  test('"maintain" keeps the calorie goal equal to TDEE', () => {
    assert.equal(plan({ goal: 'maintain' }).calorieGoal, 2732);
  });

  test('"lose" takes away 400 kcal', () => {
    assert.equal(plan({ goal: 'lose' }).calorieGoal, 2332);
  });

  test('"gain" adds 300 kcal', () => {
    assert.equal(plan({ goal: 'gain' }).calorieGoal, 3032);
  });

  test('a goal the user picks is kept, whatever their BMI is', () => {
    assert.equal(plan({ weightLb: 250, goal: 'gain' }).plan.goalUsed, 'gain'); // BMI 35.9
    assert.equal(plan({ weightLb: 120, goal: 'lose' }).plan.goalUsed, 'lose'); // BMI 17.2
  });

  test('the calorie goal never goes below 1200', () => {
    const result = calcCaloriePlan({ age: 80, heightIn: 58, weightLb: 90, sex: 'female', activity: 'sedentary', goal: 'lose' });
    assert.equal(result.tdee, 922);
    assert.equal(result.calorieGoal, 1200);
  });

  test('the calorie goal never goes above 5000', () => {
    const result = calcCaloriePlan({ age: 20, heightIn: 84, weightLb: 400, sex: 'male', activity: 'very', goal: 'gain' });
    assert.equal(result.tdee, 5266);
    assert.equal(result.calorieGoal, 5000);
  });
});

describe('"auto" goal: BMI thresholds (height 70 in)', () => {
  // Each row: weight, BMI, category, goal the app should choose, calorie change.
  // The thresholds use the BMI rounded to 1 decimal.
  const cases = [
    [128, 18.4, 'Underweight', 'gain', 300],
    [129, 18.5, 'Normal', 'maintain', 0],
    [173, 24.8, 'Normal', 'maintain', 0],
    [174, 25.0, 'Overweight', 'lose', -400],
    [208, 29.8, 'Overweight', 'lose', -400],
    [209, 30.0, 'Obese', 'lose', -400],
  ];

  for (const [weightLb, bmi, category, goalUsed, change] of cases) {
    test(`BMI ${bmi.toFixed(1)} (${category}) chooses "${goalUsed}"`, () => {
      const result = plan({ weightLb, goal: 'auto' });
      assert.deepEqual(result.plan, { bmi, category, goalUsed });
      assert.equal(result.calorieGoal - result.tdee, change);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Personal record (PR) detection
// ─────────────────────────────────────────────────────────────

// Does the same steps as POST /api/sessions, with a plain list instead of the database:
// find the heaviest earlier log of the same exercise, then ask if the new weight is a PR.
function logSet(history, exercise, weight) {
  const sameExercise = exerciseNameMatcher(exercise);
  const previousBest = history
    .filter((set) => sameExercise.test(set.exercise))
    .sort((a, b) => b.weight - a.weight)[0];
  history.push({ exercise, weight });
  return isPersonalRecord(previousBest, weight);
}

describe('PR detection: first log (baseline)', () => {
  test('the first log of an exercise is not a PR', () => {
    assert.equal(isPersonalRecord(null, 225), false);
    assert.equal(isPersonalRecord(undefined, 225), false);
    assert.equal(logSet([], 'Deadlift', 225), false);
  });

  test('a new exercise starts fresh, even after logging other exercises', () => {
    const history = [];
    logSet(history, 'Bench Press', 135);
    assert.equal(logSet(history, 'Deadlift', 225), false);
  });

  test('an earlier entry with no weight (like a started preset) is not a record to beat', () => {
    assert.equal(isPersonalRecord({ exercise: 'Bench Press' }, 135), false);
  });
});

describe('PR detection: comparing weights', () => {
  test('heavier than the previous best is a PR', () => {
    assert.equal(isPersonalRecord({ weight: 135 }, 140), true);
  });

  test('the same weight or lighter is not a PR', () => {
    assert.equal(isPersonalRecord({ weight: 135 }, 135), false);
    assert.equal(isPersonalRecord({ weight: 135 }, 130), false);
  });

  test('after a bodyweight set (0 lb), adding weight is a PR', () => {
    const history = [];
    assert.equal(logSet(history, 'Pull Up', 0), false);
    assert.equal(logSet(history, 'Pull Up', 25), true);
  });
});

describe('PR detection: case-insensitive exercise matching', () => {
  test('capital letters do not matter', () => {
    const matcher = exerciseNameMatcher('Bench Press');
    for (const typed of ['bench press', 'BENCH PRESS', 'bEnCh PrEsS']) {
      assert.equal(matcher.test(typed), true, typed);
    }
  });

  test('spaces at the start or end of the typed name do not matter', () => {
    assert.equal(exerciseNameMatcher('  bench press  ').test('Bench Press'), true);
  });

  test('a different exercise with a similar name is not matched', () => {
    const matcher = exerciseNameMatcher('Bench Press');
    for (const other of ['Incline Bench Press', 'Bench Press Machine', 'Bench', 'Leg Press']) {
      assert.equal(matcher.test(other), false, other);
    }
  });

  test('brackets and symbols in a name are read as normal text', () => {
    assert.equal(exerciseNameMatcher('Squat (Barbell)').test('squat (barbell)'), true);
    assert.equal(exerciseNameMatcher('Pull.Up').test('PullXUp'), false);
  });

  test('changing capitals does not create a false PR', () => {
    const history = [];
    logSet(history, 'Bench press', 135);
    assert.equal(logSet(history, 'Bench Press', 135), false);
  });

  test('team test case TC-UI-05', () => {
    const history = [];
    assert.equal(logSet(history, 'Bench press', 135), false, 'starting record');
    assert.equal(logSet(history, 'Bench press', 130), false, 'lighter');
    assert.equal(logSet(history, 'Bench press', 135), false, 'same as the best');
    assert.equal(logSet(history, 'bench PRESS', 145), true, 'new best with different capitals');
    assert.equal(logSet(history, 'Deadlift', 225), false, 'first Deadlift');
  });
});

// ─────────────────────────────────────────────────────────────
// 3. Macro and calorie totals
// ─────────────────────────────────────────────────────────────
describe('Macro and calorie totals', () => {
  const banana = { name: 'Banana', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 };
  const shake = { name: 'Protein Shake', calories: 320, protein: 30, carbs: 25, fat: 10 };
  const chicken = { name: 'Chicken breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 };

  test('no food gives all zeros', () => {
    assert.deepEqual(sumNutrition([]), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  test('one food gives the numbers of that food', () => {
    assert.deepEqual(sumNutrition([banana]), { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 });
  });

  test('adds up calories, protein, carbs and fat for several foods', () => {
    const totals = sumNutrition([banana, shake, chicken]);
    assert.equal(totals.calories, 590);
    assertClose(totals.protein, 62.3);
    assert.equal(totals.carbs, 52);
    assertClose(totals.fat, 14);
  });

  test('the same food logged twice is counted twice', () => {
    const totals = sumNutrition([shake, shake]);
    assert.deepEqual(totals, { calories: 640, protein: 60, carbs: 50, fat: 20 });
  });

  test('a missing or empty value counts as 0', () => {
    const totals = sumNutrition([{ calories: 100 }, { protein: 5, carbs: null }]);
    assert.deepEqual(totals, { calories: 100, protein: 5, carbs: 0, fat: 0 });
  });
});
