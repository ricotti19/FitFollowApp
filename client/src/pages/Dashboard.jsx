import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, setToken } from '../lib/api';
import { ACTIVITY, GOALS, SEXES, computeGoals, validateProfile } from '../lib/plan';
import './Dashboard.css';

/* =====================================================================================================
   FitFollow landing hero.
   ===================================================================================================== */

const HEXES = [
  {
    id: 'pr',
    pts: [[181, 693], [230, 638], [351, 638], [399, 693], [351, 748], [230, 748]],
    cx: 290,
    size: 28,
    lines: [['NEW', 668, 40], ['PERSONAL', 700, 103], ['RECORD', 731, 96]],
  },
  {
    id: 'tea',
    pts: [[224, 821], [273, 772], [395, 772], [444, 821], [395, 870.5], [273, 870.5]],
    cx: 334,
    size: 28,
    lines: [['LATEST', 809, 88], ['UPDATES', 848, 72]],
  },
  {
    id: 'diet',
    pts: [[84, 923], [131, 874], [256, 874], [303, 923], [256, 971.5], [131, 971.5]],
    cx: 193.5,
    size: 28,
    lines: [['TRACK', 911, 82], ['YOUR DIET', 950, 132]],
  },
];

// [from dot, to dot]: the black connectors from the orange circle to each call-out
const LINKS = [
  [[106, 742.3], [218, 693.3]],
  [[120.7, 786.7], [257.7, 803.3]],
  [[103.3, 826.7], [130, 897.3]],
];

const CIRCLE = { cx: 101, cy: 787.3, r: 64.3 };

/* ---------- auth dialog ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function emailProblem(value) {
  const email = value.trim();
  if (!email) return 'Email is required.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email, e.g. you@example.com.';
  return null;
}

function usernameProblem(value) {
  const username = value.trim();
  if (!username) return 'Username is required.';
  if (!USERNAME_RE.test(username)) return 'Use 3-20 letters, numbers or underscores.';
  return null;
}

const SELECT_STYLE = {
  width: '100%', padding: '10px 12px', font: 'inherit', color: 'inherit',
  background: '#fff', border: '1px solid rgba(0,0,0,.35)', borderRadius: 10,
};
const fmt = (n) => Number(n).toLocaleString('en-US');
const GOAL_TEXT = {
  gain: 'Suggested focus: lean muscle surplus',
  maintain: 'Suggested focus: maintenance and strength PRs',
  lose: 'Suggested focus: steady deficit plus 10k steps',
};

/** Esc closes the dialog, the first field gets focus on open, focus goes back to the opener on close. */
function useDialogKeys(onClose, firstRef) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    firstRef?.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [firstRef]);
}

function AuthDialog({ mode, plan, onClose, onSwitch, onSuccess, onForgot }) {
  const titleId = useId();
  const firstRef = useRef(null);

  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '', phone: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === 'login';
  const planGoals = plan ? computeGoals(plan) : null;

  useDialogKeys(onClose, firstRef);

  const updateField = (field) => (e) => {
    const { value } = e.target;
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const validate = () => {
    const next = {};

    const emailErr = emailProblem(form.email);
    if (emailErr) next.email = emailErr;

    if (!form.password) {
      next.password = 'Password is required.';
    } else if (!isLogin) {
      if (form.password.length < 8) next.password = 'Use at least 8 characters.';
      else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
        next.password = 'Include at least one letter and one number.';
      }
    }

    if (!isLogin) {
      if (!form.username.trim()) next.username = 'Username is required.';
      else if (!USERNAME_RE.test(form.username.trim())) {
        next.username = 'Use 3-20 letters, numbers or underscores.';
      }
    }

    return next;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const next = validate();
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: form.email.trim().toLowerCase(), password: form.password }
        : {
            email: form.email.trim().toLowerCase(),
            username: form.username.trim(),
            displayName: form.displayName.trim(),
            password: form.password,
            phone: form.phone.trim(),
            ...(plan ? { profile: plan } : {}), // the BMI-form answers: the server turns them into the calorie goal
          };
      const res = await api.post(endpoint, payload);
      setToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="dash-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dash-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="dash-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id={titleId}>{isLogin ? 'Sign In' : 'Create Account'}</h2>
        {!isLogin && planGoals && (
          <p className="dash-result">
            Your plan is attached: about {fmt(planGoals.calories)} kcal a day (BMI {planGoals.bmi}, {planGoals.category}).
          </p>
        )}

         <form className="dash-form" onSubmit={submit} noValidate>
          <div className="dash-field">
            <label htmlFor={`${titleId}-email`}>Email</label>
            <input
              ref={firstRef}
              id={`${titleId}-email`}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="email"
              value={form.email}
              onChange={updateField('email')}
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              aria-describedby={fieldErrors.email ? `${titleId}-email-err` : undefined}
              required
            />
            {fieldErrors.email && (
              <span className="dash-field-error" id={`${titleId}-email-err`}>
                {fieldErrors.email}
              </span>
            )}
          </div>

          {!isLogin && (
            <>
              <div className="dash-field">
                <label htmlFor={`${titleId}-username`}>Username</label>
                <input
                  id={`${titleId}-username`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  value={form.username}
                  onChange={updateField('username')}
                  aria-invalid={fieldErrors.username ? 'true' : undefined}
                  aria-describedby={fieldErrors.username ? `${titleId}-username-err` : undefined}
                  required
                />
                {fieldErrors.username && (
                  <span className="dash-field-error" id={`${titleId}-username-err`}>
                    {fieldErrors.username}
                  </span>
                )}
              </div>
              <div className="dash-field">
                <label htmlFor={`${titleId}-display`}>Display name</label>
                <input
                  id={`${titleId}-display`}
                  autoComplete="name"
                  value={form.displayName}
                  onChange={updateField('displayName')}
                />
              </div>
              <div className="dash-field">
                <label htmlFor={`${titleId}-phone`}>Phone (optional, for SMS reset)</label>
                <input
                  id={`${titleId}-phone`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+1 555 123 4567"
                  value={form.phone}
                  onChange={updateField('phone')}
                />
              </div>
            </>
          )}

          <div className="dash-field">
            <label htmlFor={`${titleId}-password`}>Password</label>
            <input
              id={`${titleId}-password`}
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={updateField('password')}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? `${titleId}-password-err` : undefined}
              required
            />
            {fieldErrors.password ? (
              <span className="dash-field-error" id={`${titleId}-password-err`}>
                {fieldErrors.password}
              </span>
            ) : (
              !isLogin && (
                <span className="dash-hint">At least 8 characters, with a letter and a number.</span>
              )
            )}
            {isLogin && (
              <button
                type="button"
                className="dash-link"
                onClick={() => onForgot(form.email)}
              >
                Forgot password?
              </button>
            )}
          </div>

          <div className="dash-error" role="alert" aria-live="polite">
            {error}
          </div>
          <button type="submit" className="dash-submit" disabled={submitting}>
            {submitting ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="dash-alt">
          {isLogin ? (
            <>
              Need an account?{' '}
              <button type="button" onClick={() => onSwitch('register')}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => onSwitch('login')}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResetPasswordDialog({ initialEmail = '', onClose, onDone }) {
  const titleId = useId();
  const [step, setStep] = useState('request'); // request | verify | done
  const [email, setEmail] = useState(initialEmail);
  const [channel, setChannel] = useState('email');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const requestCode = async (e) => {
    e.preventDefault();
    setError('');
    const emailErr = emailProblem(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/auth/forgot', {
        email: email.trim().toLowerCase(),
        channel,
      });
      setDevCode(res?.devCode || '');
      setStep('verify');
    } catch (err) {
      setError(err.message || 'Could not send a code.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password needs 8+ characters with a letter and a number.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset', {
        email: email.trim().toLowerCase(),
        channel,
        code: code.trim(),
        password,
      });
      setStep('done');
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dash-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dash-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="dash-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {step === 'request' && (
          <>
            <h2 id={titleId}>Reset password</h2>
            <p className="dash-sub">We’ll send you a 6-digit code to confirm it’s you.</p>

            <form className="dash-form" onSubmit={requestCode} noValidate>
              <div className="dash-field">
                <label htmlFor={`${titleId}-email`}>Email</label>
                <input
                  id={`${titleId}-email`}
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="dash-field">
                <label>Send the code to</label>
                <div className="dash-channels">
                  <button
                    type="button"
                    className="dash-channel"
                    aria-pressed={channel === 'email'}
                    onClick={() => setChannel('email')}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    className="dash-channel"
                    aria-pressed={channel === 'sms'}
                    onClick={() => setChannel('sms')}
                  >
                    SMS
                  </button>
                </div>
              </div>

              <div className="dash-error" role="alert">{error}</div>
              <button type="submit" className="dash-submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          </>
        )}

        {step === 'verify' && (
          <>
            <h2 id={titleId}>Enter your code</h2>
            <p className="dash-sub">
              Sent by {channel === 'sms' ? 'text message' : 'email'} to{' '}
              <strong>{email.trim()}</strong>.
            </p>

            {devCode && (
              <p className="dash-devcode">
                No mail provider is configured, so nothing was actually sent. Your code is{' '}
                <strong>{devCode}</strong>.
              </p>
            )}

            <form className="dash-form" onSubmit={submitCode} noValidate>
              <div className="dash-field">
                <label htmlFor={`${titleId}-code`}>6-digit code</label>
                <input
                  id={`${titleId}-code`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div className="dash-field">
                <label htmlFor={`${titleId}-new`}>New password</label>
                <input
                  id={`${titleId}-new`}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="dash-field">
                <label htmlFor={`${titleId}-confirm`}>Confirm password</label>
                <input
                  id={`${titleId}-confirm`}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              <div className="dash-error" role="alert">{error}</div>
              <button type="submit" className="dash-submit" disabled={busy}>
                {busy ? 'Updating…' : 'Reset password'}
              </button>
            </form>

            <div className="dash-alt">
              <button type="button" onClick={() => setStep('request')}>
                Use a different email
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2 id={titleId}>Password updated</h2>
            <p className="dash-sub">You can now sign in with your new password.</p>
            <button type="button" className="dash-submit" onClick={onDone}>
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const LANDING_TABS = [
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

function InfoDialog({ tab, bmiForm, onBmiChange, onClose, onCreatePlan }) {
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

/* ---------- landing hero ---------- */



// REPLACE LandingHero WITH THIS:
function LandingHero({ onRegister, onLogin, onOverview, onTestimonials }) {
  return (
    <section className="hero" aria-label="FitFollow">
      <div className="hero-copy">
        <p className="hero-eyebrow">Social fitness, simplified</p>
        <h1 className="hero-title">FitFollow</h1>
        <p className="hero-lede">
          Do you follow your health as much as you follow your friends?
        </p>

        {/* SINGLE SURGICAL SWAP ON THE LEFT */}
        <div className="hero-actions">
          <button
            type="button"
            className="hero-cta hero-cta-primary"
            onClick={onTestimonials}
          >
            See what our customers say →
          </button>
        </div>

        <button type="button" className="hero-link" onClick={onOverview}>
          Overview <span aria-hidden="true">→</span>
        </button>

        <ul className="hero-points">
          <li>Track workouts, meals, and progress photos</li>
          <li>Follow friends and share real results</li>
          <li>Get a plan tuned to your BMI</li>
        </ul>
      </div>

      <div className="hero-art">
        <svg
          className="hero-art-svg"
          viewBox="0 550 800 500"
          role="img"
          aria-label="FitFollow feature artwork: create an account, sign in, and explore the app."
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="poster-hex" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--hex-from)" />
              <stop offset="100%" stopColor="var(--hex-to)" />
            </linearGradient>
          </defs>

          <g stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" fill="none">
            {LINKS.map(([a, b], i) => (
              <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
            ))}
          </g>

          <circle
            cx={CIRCLE.cx}
            cy={CIRCLE.cy}
            r={CIRCLE.r}
            fill="url(#poster-hex)"
            stroke="var(--ink)"
            strokeWidth="2.5"
          />
          <g transform={`translate(${CIRCLE.cx} ${CIRCLE.cy})`} fill="var(--ink)" aria-hidden="true">
            <rect x="-30" y="-4.5" width="60" height="9" rx="4.5" />
            <rect x="-24" y="-15" width="9" height="30" rx="3" />
            <rect x="15" y="-15" width="9" height="30" rx="3" />
            <rect x="-38" y="-21" width="9" height="42" rx="3" />
            <rect x="29" y="-21" width="9" height="42" rx="3" />
          </g>

          {HEXES.map((h) => (
            <g
              key={h.id}
              className="hex-btn"
              role="button"
              tabIndex={0}
              onClick={onRegister}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRegister();
                }
              }}
            >
              <polygon
                points={h.pts.map((p) => p.join(',')).join(' ')}
                fill="url(#poster-hex)"
                stroke="var(--ink)"
                strokeWidth="2.5"
              />
              <text className="t-hex" textAnchor="middle" fontSize={h.size}>
                {h.lines.map(([text, y], i) => (
                  <tspan key={i} x={h.cx} y={y}>
                    {text}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
          {/* Sleek Action Badge: Create Account */}
          </svg>

        {/* HTML Action Buttons */}
        <div className="hero-art-actions">
          <button type="button" className="art-badge-btn" onClick={onRegister}>
            CREATE ACCOUNT
          </button>
          <button type="button" className="art-badge-btn" onClick={onLogin}>
            SIGN IN
          </button>
        </div>
      </div>
    </section>
  );
}


/* ---------- OVERVIEW page (full-bleed collage) ---------- */
const OVERVIEW_ITEMS = [

  { id: 'learn',     x: 18,   y: 11.5, fs: 2.7, lines: ['LEARN', 'MORE'] },
  { id: 'different', x: 77,   y: 19.5, fs: 2.4, lines: ['WHAT', 'MAKES US', 'DIFFERENT?'] },
  { id: 'bmi',       x: 33,   y: 51,   fs: 2.3, lines: ['BMI & PLAN TAILORING'] },
  { id: 'tiers',     x: 15,   y: 85,   fs: 2.7, lines: ['ACCOUNT', 'TIERS'] },
  { id: 'why',       x: 76,   y: 80,   fs: 2.4, lines: ['WHY', 'TAKE', 'CARE OF', 'YOUR', 'HEALTH?'] },
];
function starPath(cx, cy, spikes, rx, ry, inner = 0.26) {
  const a0 = -Math.PI / 2;
  const step = (2 * Math.PI) / spikes;
  const pt = (i, r) => [
    (cx + rx * r * Math.cos(a0 + i * step)).toFixed(1),
    (cy + ry * r * Math.sin(a0 + i * step)).toFixed(1),
  ];
  let d = `M${pt(0, 1).join(' ')}`;
  for (let i = 0; i < spikes; i++) {
    const c = pt(i + 0.5, inner);
    const p = pt(i + 1, 1);
    d += `Q${c.join(' ')} ${p.join(' ')}`;
  }
  return `${d}Z`;
}

const FLOWER = Array.from({ length: 5 }, (_, i) => {
  const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return { cx: 800 + Math.cos(a) * 160, cy: 235 + Math.sin(a) * 160 };
});

function OverviewShape({ id, label, onSelect, children }) {
  return (
    <g
      className="overview-shape"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(id);
        }
      }}
    >
      {children}
    </g>
  );
}

const DIRECTORY_ITEMS = [
  { id: 'learn', 
    label: 'Learn More', 
    subtitle: 'How FitFollow works' },
  { id: 'different', 
    label: 'What Makes Us Different?', 
    subtitle: 'Our core approach' 
  },
  { id: 'bmi', 
    label: 'BMI & Plan Tailoring', 
    subtitle: 'Custom metrics & goals' },
  {
    id: 'tiers',
    label: 'Account Tiers',
    title: 'Free vs. FitFollow Pro',
    body: 'Free Tier: Unlimited workout/PR logs, macro & step tracking, friends, and privacy-locked posts.\n\nPro Tier: Advanced body trend analytics, custom workout presets, and priority CV verification.',
    icon: () => (
      <TabIcon>
        <path d="M12 3l2.5 4.8L20 8.7l-4 3.8.9 5.5-4.9-2.6L7.1 18l.9-5.5-4-3.8 5.5-.9L12 3Z" />
      </TabIcon>
    ),
  },
  { id: 'why', label: 'Why Take Care of Your Health?', subtitle: 'Long-term benefits' },
];

function LandingDirectory({ onSelect, onBack }) {
  return (
    <section className="overview-page" aria-label="FitFollow overview">
      <header className="overview-header">
        <button type="button" className="overview-back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="overview-title">Explore FitFollow</h1>
      </header>

      <div className="overview-grid">
        {DIRECTORY_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="overview-circle"
            onClick={() => onSelect(item.id)}
          >
            <span className="overview-circle-title">{item.label}</span>
            <span className="overview-circle-sub">{item.subtitle}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

  const TESTIMONIALS = [
  {
    name: 'Jordan M.',
    tag: 'Lost 12 lbs • 8-Week Streak',
    quote: 'Logging meals used to feel like a chore, but seeing my friends hit their daily protein goals keeps me consistent every single day.',
    banner: '/banners/banner-1.jpg', // update filename as needed in client/dist/banners/
  },
  {
    name: 'Marcus T.',
    tag: 'Bench PR +25 lbs • 14 Weeks',
    quote: 'Having my personal records and workout logs in one clean feed—without bloated ads—made tracking progressive overload effortless.',
    banner: '/banners/banner-2.jpg',
  },
  {
    name: 'Kat Z.',
    tag: 'Half-Marathon Prep • BMI Plan',
    quote: 'The BMI-tuned calorie baseline gave me an actual starting point instead of guessing my macros before long runs.',
    banner: '/banners/banner-3.jpg',
  },
  {
    name: 'Alex R.',
    tag: 'Daily 10k Steps • Habit Builder',
    quote: 'The database privacy locks give me peace of mind knowing my workout logs are shared only with the people I choose.',
    banner: '/banners/banner-4.jpg',
  },
];

function TestimonialsView({ onBack, onRegister }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  return (
    <section className="overview-page testimonials-page" aria-label="Customer stories">
      <header className="overview-header">
        <button type="button" className="overview-back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="overview-title">What Our Members Say</h1>
      </header>

      {/* Slider Container */}
      <div className="testimonials-slider-container">
        <button type="button" className="slider-nav-btn prev" onClick={prevSlide} aria-label="Previous testimonial">
          ‹
        </button>

        <div className="testimonials-track-wrapper">
          <div
            className="testimonials-track"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {TESTIMONIALS.map((item, idx) => (
              <div className="testimonial-slide-card" key={idx}>
                <div className="testimonial-banner-wrapper">
                  <img src={item.banner} alt={item.name} className="testimonial-banner-img" />
                  <div className="testimonial-gradient-overlay" />
                </div>
                <div className="testimonial-content-box">
                  <span className="testimonial-tag">{item.tag}</span>
                  <h2 className="testimonial-name">{item.name}</h2>
                  <p className="testimonial-quote">“{item.quote}”</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="slider-nav-btn next" onClick={nextSlide} aria-label="Next testimonial">
          ›
        </button>
      </div>

      {/* Centered Dots Indicator */}
      <div className="testimonials-dots">
        {TESTIMONIALS.map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={`testimonial-dot ${currentIndex === idx ? 'active' : ''}`}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>

      {/* Single Bottom CTA */}
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <button
          type="button"
          className="hero-cta hero-cta-primary"
          style={{ fontSize: '1.15rem', padding: '18px 34px' }}
          onClick={onRegister}
        >
          Start your own streak — Create Account
        </button>
      </div>
    </section>
  );
}

/* ---------- dashboard ---------- */
export default function Dashboard({ onAuthSuccess }) {
  const [dialog, setDialog] = useState(null); // 'login' | 'register' | null
  const [landingView, setLandingView] = useState('poster'); // 'poster' | 'directory' | 'testimonials'
  const [infoTab, setInfoTab] = useState(null);
  const [bmiForm, setBmiForm] = useState({ age: '', heightIn: '', weightLb: '', sex: '', activity: 'light', goal: 'auto' });
  const [plan, setPlan] = useState(null); // validated BMI-form answers, sent along with the sign-up
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const open = useCallback((mode) => setDialog(mode), []);
  const close = useCallback(() => setDialog(null), []);

  const currentInfo = LANDING_TABS.find((t) => t.id === infoTab) || null;

  const handleBmiChange = (field, value) => {
    setBmiForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDirectoryBack = () => {
    setLandingView('poster');
    setInfoTab(null);
  };

  return (
    <div className="dashboard-stage">
      {landingView === 'directory' && (
        <LandingDirectory onSelect={setInfoTab} onBack={handleDirectoryBack} />
      )}

      {currentInfo && (
        <InfoDialog
          tab={currentInfo}
          bmiForm={bmiForm}
          onBmiChange={handleBmiChange}
          onClose={() => setInfoTab(null)}
          onCreatePlan={(profile) => {
            setPlan(profile);
            setInfoTab(null);
            open('register');
          }}
        />
      )}


      {landingView === 'testimonials' && (
        <TestimonialsView
          onBack={() => setLandingView('poster')}
          onRegister={() => open('register')}
        />
      )}

      {landingView === 'poster' && (
        <LandingHero
          onRegister={() => open('register')}
          onLogin={() => open('login')}
          onOverview={() => setLandingView('directory')}
          onTestimonials={() => setLandingView('testimonials')}
        />
      )}

      {dialog && (
        <AuthDialog
          mode={dialog}
          plan={plan}
          onClose={close}
          onSwitch={setDialog}
          onSuccess={(user) => {
            close();
            onAuthSuccess(user);
          }}
          onForgot={(email) => {
            setResetEmail(email);
            close();
            setResetOpen(true);
          }}
        />
      )}

      {resetOpen && (
        <ResetPasswordDialog
          initialEmail={resetEmail}
          onClose={() => setResetOpen(false)}
          onDone={() => {
            setResetOpen(false);
            open('login');
          }}
        />
      )}
    </div>
  );
}