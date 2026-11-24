import { useState } from 'react';
import { ACTIVITY, GOALS, SEXES, computeGoals, validateProfile } from '../lib/plan';
import { useDialogKeys, SELECT_STYLE, GOAL_TEXT, fmt } from './dialogShared';

function TabIcon({ children }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const LANDING_TABS = [
  {
    id: 'learn',
    label: 'Learn More',
    title: 'How FitFollow Works',
    body: 'Track workouts with automatic PR detection, log daily calories and steps, share 24-hour stories, and keep every post locked to Private, Friends, or Public.',
    icon: () => (
      <TabIcon>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6" />
        <circle cx="12" cy="7.2" r=".7" fill="#111" stroke="none" />
      </TabIcon>
    ),
  },
  {
    id: 'why',
    label: 'Why Take Care of Your Health?',
    title: 'Consistency Beats Intensity',
    body: 'Daily movement, balanced macros, and progressive strength training lower long-term cardiovascular risk, boost energy, and turn small habits into measurable milestones.',
    icon: () => (
      <TabIcon>
        <path d="M20.5 8.5c0-2.2-1.8-4-4-4-1.3 0-2.5.6-3.3 1.6L12 7.4l-1.2-1.3A4.2 4.2 0 0 0 7.5 4.5c-2.2 0-4 1.8-4 4 0 1.2.5 2.3 1.4 3.1l7.1 7 7.1-7c.9-.8 1.4-1.9 1.4-3.1Z" />
        <path d="M4 12h3l1.5-2 2.5 4 2-3 1 1h6" />
      </TabIcon>
    ),
  },
  {
    id: 'different',
    label: 'What Makes Us Different',
    title: 'Privacy Locks + AI Photo Verification',
    body: 'Unlike lonely calorie counters or spam-filled public feeds, FitFollow enforces database-level audience locks on every post and uses MediaPipe + PyTorch CV to verify real workout photos.',
    icon: () => (
      <TabIcon>
        <path d="M12 3l7 3v5c0 4.5-3 7.7-7 10-4-2.3-7-5.5-7-10V6l7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </TabIcon>
    ),
  },
  {
    id: 'tiers',
    label: 'Account Tiers',
    title: 'Free vs. FitFollow Pro',
    body: 'Free Tier: Unlimited workout/PR logs, macro & step tracking, friends, and privacy-locked posts. \n Pro Tier: Advanced body trend analytics, custom workout presets, and priority CV verification.',
    icon: () => (
      <TabIcon>
        <path d="M12 3l2.5 4.8L20 8.7l-4 3.8.9 5.5-4.9-2.6L7.1 18l.9-5.5-4-3.8 5.5-.9L12 3Z" />
      </TabIcon>
    ),
  },
  {
    id: 'bmi',
    label: 'BMI & Plan Tailoring',
    title: 'Personalize Your Baseline',
    isBmi: true,
    icon: () => (
      <TabIcon>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 8h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h4" />
      </TabIcon>
    ),
  },
];

export default function InfoDialog({ tab, bmiForm, onBmiChange, onClose, onCreatePlan }) {
  const [submitted, setSubmitted] = useState(false);
  const check = validateProfile(bmiForm);
  const goals = check.ok ? computeGoals(check.value) : null;
  const err = (field) => (submitted && check.errors[field] ? check.errors[field] : null);
  useDialogKeys(onClose);

  const submit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (check.ok) onCreatePlan(check.value);
  };

  const numberField = (field, label, placeholder, inputMode) => (
    <div className="dash-field">
      <label htmlFor={`bmi-${field}`}>{label}</label>
      <input
        id={`bmi-${field}`}
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        value={bmiForm[field]}
        onChange={(e) => onBmiChange(field, e.target.value)}
        aria-invalid={err(field) ? 'true' : undefined}
        aria-describedby={err(field) ? `bmi-${field}-err` : undefined}
      />
      {err(field) && (
        <span className="dash-field-error" id={`bmi-${field}-err`}>
          {err(field)}
        </span>
      )}
    </div>
  );

  return (
    <div
      className="dash-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dash-dialog" role="dialog" aria-modal="true" aria-label={tab.title}>
        <button type="button" className="dash-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{tab.title}</h2>

        {!tab.isBmi ? (
          <p className="dash-copy">{tab.body}</p>
        ) : (
          <form className="dash-form" style={{ marginTop: 12 }} onSubmit={submit} noValidate>
            {numberField('age', 'Age', 'e.g. 21', 'numeric')}
            {numberField('heightIn', 'Height (inches)', 'e.g. 66', 'decimal')}
            {numberField('weightLb', 'Weight (lbs)', 'e.g. 140', 'decimal')}

            <div className="dash-field">
              <label id="bmi-sex-label">Sex (used only for the calorie formula)</label>
              <div className="dash-channels" role="group" aria-labelledby="bmi-sex-label">
                {SEXES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="dash-channel"
                    aria-pressed={bmiForm.sex === o.id}
                    onClick={() => onBmiChange('sex', o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {err('sex') && <span className="dash-field-error">{err('sex')}</span>}
            </div>

            <div className="dash-field">
              <label htmlFor="bmi-activity">Activity level</label>
              <select
                id="bmi-activity"
                style={SELECT_STYLE}
                value={bmiForm.activity}
                onChange={(e) => onBmiChange('activity', e.target.value)}
              >
                {ACTIVITY.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="dash-field">
              <label htmlFor="bmi-goal">Goal</label>
              <select
                id="bmi-goal"
                style={SELECT_STYLE}
                value={bmiForm.goal}
                onChange={(e) => onBmiChange('goal', e.target.value)}
              >
                {GOALS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>

            {goals ? (
              <div className="dash-result" aria-live="polite">
                Estimated BMI: {goals.bmi} ({goals.category}). {GOAL_TEXT[goals.goalUsed]}.
                <br />
                Daily calorie goal: <strong>{fmt(goals.calories)} kcal</strong>
                <span className="dash-hint"> (maintenance is about {fmt(goals.tdee)} kcal)</span>
              </div>
            ) : (
              submitted && (
                <div className="dash-error" role="alert">
                  Fix the highlighted fields to see your plan.
                </div>
              )
            )}
            <button type="submit" className="dash-submit">
              Create Account With This Plan
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
