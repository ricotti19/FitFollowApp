import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { localDay, fmtNum, pct } from '../lib/format';
import { ACTIVITY, GOALS, SEXES, validateProfile } from '../lib/plan';

/* ---------- input rules (the server enforces the same limits, so these are only for fast feedback) ---------- */
const MAX_STEPS_PER_ENTRY = 50000;
const MAX_STEPS_PER_DAY = 100000;
const MAX_FOOD_KCAL = 5000;
const MAX_MACRO_G = 500;
const DEC_RE = /^\d+(\.\d{1,2})?$/;

function stepsProblem(raw, current) {
  const t = String(raw).trim();
  if (!t) return 'Enter a number of steps.';
  if (!/^\d+$/.test(t)) return 'Whole numbers only, e.g. 2500.';
  const n = Number(t);
  if (n < 1) return 'Enter at least 1 step.';
  if (n > MAX_STEPS_PER_ENTRY) return `That is more than ${fmtNum(MAX_STEPS_PER_ENTRY)} steps in one entry. Check the number.`;
  if (current + n > MAX_STEPS_PER_DAY) return `That would put today over ${fmtNum(MAX_STEPS_PER_DAY)} steps.`;
  return null;
}

/** -> { errors: {field: msg}, value } for the "Log custom food" form */
function validateFood(f) {
  const errors = {};
  const name = f.name.trim();
  if (!name) errors.name = 'Food name is required.';
  else if (name.length > 80) errors.name = 'Keep the name under 80 characters.';

  const read = (key, label, max, required) => {
    const t = String(f[key]).trim();
    if (!t) {
      if (required) errors[key] = `${label} is required.`;
      return 0;
    }
    if (!DEC_RE.test(t)) {
      errors[key] = `${label} must be a positive number.`;
      return 0;
    }
    const n = Number(t);
    if (n > max) errors[key] = `${label} can't be more than ${fmtNum(max)}.`;
    return n;
  };
  const calories = read('calories', 'Calories', MAX_FOOD_KCAL, true);
  const protein = read('protein', 'Protein', MAX_MACRO_G);
  const carbs = read('carbs', 'Carbs', MAX_MACRO_G);
  const fat = read('fat', 'Fat', MAX_MACRO_G);
  if (!errors.calories && !errors.protein && !errors.carbs && !errors.fat && 4 * protein + 4 * carbs + 9 * fat > calories * 1.5 + 50) {
    errors.calories = 'Protein, carbs and fat add up to more calories than you entered. Check the numbers.';
  }
  return { errors, value: { name, calories, protein, carbs, fat } };
}

const ErrorText = ({ id, children }) =>
  children ? (
    <span id={id} className="small" role="alert" style={{ color: 'var(--danger, #b3261e)', fontWeight: 600 }}>
      {children}
    </span>
  ) : null;

const SELECT_STYLE = { width: '100%' };

/* ---------- "Your plan": the body stats the calorie goal is calculated from ---------- */
function PlanEditor({ profile, onSaved }) {
  const [form, setForm] = useState({
    age: profile?.age ?? '',
    heightIn: profile?.heightIn ?? '',
    weightLb: profile?.weightLb ?? '',
    sex: profile?.sex ?? '',
    activity: profile?.activity ?? 'light',
    goal: profile?.goal ?? 'auto',
  });
  const [submitted, setSubmitted] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // the saved profile arrives after the first request: fill the form once it does
  useEffect(() => {
    if (!profile) return;
    setForm({ age: profile.age, heightIn: profile.heightIn, weightLb: profile.weightLb, sex: profile.sex, activity: profile.activity, goal: profile.goal });
  }, [JSON.stringify(profile)]); // eslint-disable-line react-hooks/exhaustive-deps
  const check = validateProfile(form);
  const err = (k) => (submitted ? check.errors[k] : null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setMsg('');
    if (!check.ok) return;
    setBusy(true);
    try {
      await api.put('/profile', check.value);
      setMsg('Saved. Your calorie goal is updated.');
      onSaved();
    } catch (e2) {
      setMsg(e2.message || 'Could not save your plan.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setForm({ age: '', heightIn: '', weightLb: '', sex: '', activity: 'light', goal: 'auto' });
    setSubmitted(false);
    setMsg('');
  };

  const num = (k, label, ph, mode) => (
    <label className="field" style={{ flex: '1 1 110px' }}>
      <span>{label}</span>
      <input type="text" inputMode={mode} placeholder={ph} value={form[k]} onChange={set(k)} aria-invalid={err(k) ? 'true' : undefined} />
      <ErrorText>{err(k)}</ErrorText>
    </label>
  );

  return (
    <form onSubmit={save} className="stack" style={{ marginTop: 12 }} noValidate>
      <div className="row wrap">
        {num('age', 'Age', '21', 'numeric')}
        {num('heightIn', 'Height (in)', '66', 'decimal')}
        {num('weightLb', 'Weight (lbs)', '140', 'decimal')}
      </div>
      <div className="field">
        <span>Gender</span>
        <div className="row wrap">
          {SEXES.map((o) => (
            <button key={o.id} type="button" className="btn" style={{ opacity: form.sex === o.id ? 1 : 0.5 }} aria-pressed={form.sex === o.id} onClick={() => setForm((f) => ({ ...f, sex: o.id }))}>
              {o.label}
            </button>
          ))}
        </div>
        <ErrorText>{err('sex')}</ErrorText>
      </div>
      <label className="field">
        <span>Activity level</span>
        <select style={SELECT_STYLE} value={form.activity} onChange={set('activity')}>
          {ACTIVITY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Goal</span>
        <select style={SELECT_STYLE} value={form.goal} onChange={set('goal')}>
          {GOALS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <div className="row spread wrap">
        <span className="small muted" role="status">{msg}</span>
        <div className="row">
          <button type="button" className="btn ghost" onClick={handleReset}>
            Reset
          </button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save plan'}</button>
        </div>
      </div>
    </form>
  );
}

export default function TodayTab() {
  const day = localDay();
  const [steps, setSteps] = useState(0);
  const [stepGoal, setStepGoal] = useState(10000);
  const [stepHistory, setStepHistory] = useState([]);
  const [stepInput, setStepInput] = useState('');
  const [stepErr, setStepErr] = useState('');
  const [nutrition, setNutrition] = useState({ entries: [], foods: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, goal: 2200, goalSource: 'default', plan: null, profile: null });
  const [foodQuery, setFoodQuery] = useState('');
  const [foodResults, setFoodResults] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [foodLoading, setFoodLoading] = useState(false);
  const [foodMsg, setFoodMsg] = useState('');
  const [customFood, setCustomFood] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [customErrors, setCustomErrors] = useState({});
  const [customMsg, setCustomMsg] = useState('');
  const [goalInput, setGoalInput] = useState('');
  const [goalMsg, setGoalMsg] = useState('');
  const searchSeq = useRef(0);

  const loadData = async () => {
    try {
      const [sRes, nRes] = await Promise.all([api.get(`/steps?day=${day}`), api.get(`/nutrition?day=${day}`)]);
      setSteps(sRes.steps ?? sRes.total ?? 0);
      if (sRes.goal) setStepGoal(sRes.goal);
      if (Array.isArray(sRes.history)) setStepHistory(sRes.history);
      setNutrition((prev) => ({ ...prev, ...nRes }));
    } catch (e) {
      console.error(e);
    }
  };

  const searchFoods = async (q) => {
    const seq = ++searchSeq.current;
    setFoodLoading(true);
    setFoodMsg('');
    try {
      const res = await api.get(`/nutrition/foods?q=${encodeURIComponent(q || '')}`);
      if (seq !== searchSeq.current) return;
      setFoodResults(res.foods || []);
      if ((res.foods || []).length === 0) setFoodMsg(q ? 'No foods found. Try another search or log custom food.' : 'No foods available.');
    } catch (e) {
      if (seq !== searchSeq.current) return;
      setFoodResults([]);
      setFoodMsg('Could not load food options.');
    } finally {
      if (seq === searchSeq.current) setFoodLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    searchFoods('');
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchFoods(foodQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [foodQuery]);

  const addSteps = async (e) => {
    e.preventDefault();
    const problem = stepsProblem(stepInput, steps);
    setStepErr(problem || '');
    if (problem) return;
    try {
      await api.post('/steps', { day, steps: stepInput.trim() });
      setStepInput('');
      loadData();
    } catch (err) {
      setStepErr(err.message || 'Could not save steps.');
    }
  };

  const logSelectedFood = async () => {
    if (!selectedFood) return;
    setFoodMsg('');
    try {
      await api.post('/nutrition/log', { day, foodId: selectedFood.id, food: selectedFood });
      setSelectedFood(null);
      setFoodQuery('');
      await loadData();
      searchFoods('');
    } catch (e) {
      setFoodMsg(e.message || 'Failed to log food');
    }
  };

  const logCustomFood = async (e) => {
    e.preventDefault();
    setCustomMsg('');
    const { errors, value } = validateFood(customFood);
    setCustomErrors(errors);
    if (Object.keys(errors).length) return;
    try {
      await api.post('/nutrition/custom', { day, ...value });
      setCustomFood({ name: '', calories: '', protein: '', carbs: '', fat: '' });
      setCustomErrors({});
      setCustomMsg(`Logged ${value.name}.`);
      loadData();
    } catch (err) {
      setCustomMsg(err.message || 'Could not log that food.');
    }
  };

  const resetCustomFood = () => {
    setCustomFood({ name: '', calories: '', protein: '', carbs: '', fat: '' });
    setCustomErrors({});
    setCustomMsg('');
  };

  const setCustom = (k) => (e) => {
    setCustomFood((f) => ({ ...f, [k]: e.target.value }));
    if (customErrors[k]) setCustomErrors((c) => ({ ...c, [k]: undefined }));
  };

  const t = nutrition.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const calGoal = nutrition.goal || 2200;
  const hasPlan = nutrition.goalSource === 'plan';
  const over = Math.round(t.calories - calGoal);

  const stepsPct = pct(steps, stepGoal);
  const caloriesPct = pct(t.calories, calGoal);

  return (
    <div className="stack">
      {/* STEPS CARD (FR-14, FR-16) */}
      <section className="card stack">
        <div className="row spread">
          <h2 className="card-title">Steps</h2>
          <span className="small muted">{fmtNum(steps)} / {fmtNum(stepGoal)}</span>
        </div>
        <div className="big">{fmtNum(steps)}<small>steps</small></div>
        <div className="track" aria-hidden="true">
          <i style={{ width: `${stepsPct}%` }} />
        </div>
                <div className="small muted">{stepsPct}% of daily goal</div>
        {stepHistory.length > 0 && (() => {
          const maxVal = Math.max(stepGoal, ...stepHistory.map((h) => h.steps), 1);
          const avg = Math.round(stepHistory.reduce((s, h) => s + h.steps, 0) / stepHistory.length);
          const daysHit = stepHistory.filter((h) => h.steps >= stepGoal).length;
          const pts = stepHistory.map((h, i) => `${(i / Math.max(stepHistory.length - 1, 1)) * 280 + 10},${62 - (h.steps / maxVal) * 52}`).join(' ');
          return (
            <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 14, background: 'rgba(247, 244, 255, 0.85)', border: '1px solid var(--line)' }}>
              <div className="row spread" style={{ marginBottom: 6 }}>
                <span className="small" style={{ fontWeight: 700 }}>Last 7 Days Trend</span>
                <span className="small muted">Avg: {fmtNum(avg)}/day · {daysHit}/7 goals hit</span>
              </div>
              <svg viewBox="0 0 300 72" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 72, overflow: 'visible' }} aria-label="7-day step trend chart">
                <line x1="10" y1={62 - (stepGoal / maxVal) * 52} x2="290" y2={62 - (stepGoal / maxVal) * 52} stroke="rgba(16,21,68,0.18)" strokeDasharray="4 4" strokeWidth="1.2" />
                <polyline fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={pts} />
                {stepHistory.map((h, i) => {
                  const cx = (i / Math.max(stepHistory.length - 1, 1)) * 280 + 10;
                  const cy = 62 - (h.steps / maxVal) * 52;
                  return <circle key={h.day} cx={cx} cy={cy} r="4" fill={h.steps >= stepGoal ? '#10b981' : 'var(--accent)'} />;
                })}
              </svg>
              <div className="row spread" style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                {stepHistory.map((h) => <span key={h.day}>{h.day.slice(5)}</span>)}
              </div>
              <div className="small" style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#fff', fontWeight: 600 }}>
                💡 {avg >= stepGoal
                  ? `Strong consistency! You averaged ${fmtNum(avg)} steps/day this week.`
                  : `Where to improve: You averaged ${fmtNum(avg)} steps/day (${fmtNum(stepGoal - avg)} below goal) — try adding one 15-min walk (~1,500 steps) daily.`}
              </div>
            </div>
          );
        })()}
        <form onSubmit={addSteps} className="stack" style={{ gap: 6 }} noValidate>
          <div className="row">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Add steps..."
              value={stepInput}
              onChange={(e) => { setStepInput(e.target.value); if (stepErr) setStepErr(''); }}
              className="grow"
              aria-invalid={stepErr ? 'true' : undefined}
            />
            <button type="submit" className="btn">Save</button>
          </div>
          <ErrorText>{stepErr}</ErrorText>
        </form>
      </section>

      {/* NUTRITION CARD (FR-8, FR-9, FR-10, FR-11) */}
      <section className="card stack">
        <div className="row spread">
          <h2 className="card-title">Calories &amp; Macros</h2>
          <span className="small muted">{fmtNum(t.calories)} / {fmtNum(calGoal)} kcal</span>
        </div>
        <div className="track" aria-hidden="true">
          <i style={{ width: `${caloriesPct}%` }} />
        </div>
        <div className="small muted">
          {over > 0 ? `${fmtNum(over)} kcal over your goal` : `${fmtNum(-over)} kcal left`}
          {hasPlan ? ` · goal from your plan (BMI ${nutrition.plan.bmi}, ${nutrition.plan.category})` : ''}
        </div>
        {!hasPlan && (
          <div className="notice">
            This is a generic {fmtNum(calGoal)} kcal goal. Add your age, height and weight under "Your plan" below to get one that fits you.
          </div>
        )}

     <form
       onSubmit={async (e) => {
         e.preventDefault();
         setGoalMsg('');
         const val = Number(goalInput);
         if (!Number.isFinite(val) || val < 1000 || val > 6000) {
           setGoalMsg('Enter a daily goal between 1,000 and 6,000 kcal.');
           return;
         }
         try {
           await api.post('/nutrition/goal', { goal: Math.round(val) });
           setGoalInput('');
           setGoalMsg(`Daily calorie goal set to ${fmtNum(Math.round(val))} kcal.`);
           loadData();
         } catch (err) {
           setGoalMsg(err.message || 'Could not update calorie goal.');
         }
       }}
       className="row"
       style={{ gap: 8 }}
     >
       <input
         type="number"
         min="1000"
         max="6000"
         placeholder={`Set custom goal (current: ${calGoal} kcal)`}
         value={goalInput}
         onChange={(e) => { setGoalInput(e.target.value); if (goalMsg) setGoalMsg(''); }}
         style={{ flex: 1 }}
       />
       <button type="submit" className="btn small">Set goal</button>
     </form>
     {goalMsg && <div className="small muted" role="status">{goalMsg}</div>}

        <div className="macros">
          <div><span className="small muted">Protein</span><b>{t.protein}g</b></div>
          <div><span className="small muted">Carbs</span><b>{t.carbs}g</b></div>
          <div><span className="small muted">Fat</span><b>{t.fat}g</b></div>
        </div>

                {nutrition.entries?.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row spread">
              <span className="small muted">Logged today ({nutrition.entries.length})</span>
              <button
                type="button"
                className="btn small ghost"
                onClick={async () => {
                  await api.del(`/nutrition/today?day=${encodeURIComponent(day)}`);
                  loadData();
                }}
              >
                Clear today
              </button>
            </div>
            <div className="list">
              {nutrition.entries.map((entry) => (
                <div key={entry._id} className="item spread">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{entry.name}</div>
                    <div className="small muted">{entry.calories} kcal • P {entry.protein}g • C {entry.carbs}g • F {entry.fat}g</div>
                  </div>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={async () => {
                      await api.del(`/nutrition/log/${entry._id}`);
                      loadData();
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stack" style={{ gap: 8 }}>
          <label className="field">
            <span>Search food</span>
            <input
              value={foodQuery}
              onChange={(e) => setFoodQuery(e.target.value)}
              placeholder="Search 100+ foods or external database..."
            />
          </label>

          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
            {foodLoading ? (
              <div className="small muted" style={{ padding: 12 }}>Searching foods...</div>
            ) : foodResults.length === 0 ? (
              <div className="small muted" style={{ padding: 12 }}>{foodMsg || 'No foods found.'}</div>
            ) : (
              foodResults.map((f) => {
                const active = selectedFood?.id === f.id && selectedFood?.name === f.name;
                return (
                  <button
                    key={`${f.source || 'food'}-${f.id}`}
                    type="button"
                    onClick={() => setSelectedFood(f)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 0,
                      borderBottom: '1px solid var(--line-soft)',
                      background: active ? 'var(--accent-soft)' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.name}</div>
                    <div className="small muted">
                      {f.calories} kcal • P {f.protein}g • C {f.carbs}g • F {f.fat}g
                      {f.source === 'openfoodfacts' ? ' • external' : ''}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="row spread wrap">
            <div className="small muted">
              {selectedFood ? `Selected: ${selectedFood.name}` : 'Select a food to log'}
            </div>
            <button type="button" onClick={logSelectedFood} className="btn" disabled={!selectedFood}>Add selected</button>
          </div>
          {foodMsg && !foodLoading && foodResults.length > 0 && <div className="small muted">{foodMsg}</div>}
        </div>

        <details>
          <summary>Log custom food</summary>
          <form onSubmit={logCustomFood} className="stack" style={{ marginTop: 12 }} noValidate>
            <label className="field">
              <span>Food name</span>
              <input placeholder="Food name" value={customFood.name} onChange={setCustom('name')} aria-invalid={customErrors.name ? 'true' : undefined} />
              <ErrorText>{customErrors.name}</ErrorText>
            </label>
            <div className="row wrap">
              {[
                ['calories', 'kcal', 'Calories'],
                ['protein', 'Protein (g)', 'Protein'],
                ['carbs', 'Carbs (g)', 'Carbs'],
                ['fat', 'Fat (g)', 'Fat'],
              ].map(([k, ph, label]) => (
                <label key={k} className="field" style={{ flex: '1 1 90px' }}>
                  <span className="small muted">{label}</span>
                  <input type="text" inputMode="decimal" placeholder={ph} value={customFood[k]} onChange={setCustom(k)} aria-invalid={customErrors[k] ? 'true' : undefined} />
                  <ErrorText>{customErrors[k]}</ErrorText>
                </label>
              ))}
            </div>
            <div className="row spread wrap">
              <button type="button" className="btn ghost" onClick={resetCustomFood}>Reset</button>
              <button type="submit" className="btn">Log food</button>
            </div>
            {customMsg && <div className="small muted" role="status">{customMsg}</div>}
          </form>
        </details>
        <div className="divider" />
          
          <details className="plan-section" open={!hasPlan}>
          <summary>Your plan{hasPlan ? `: ${fmtNum(calGoal)} kcal/day` : ' (not set yet)'}</summary>
          <PlanEditor profile={nutrition.profile} onSaved={loadData} />
        </details>

      </section>
    </div>
  );
}


