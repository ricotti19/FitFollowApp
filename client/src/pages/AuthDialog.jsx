import { useId, useRef, useState } from 'react';
import { api, setToken } from '../lib/api';
import { computeGoals } from '../lib/plan';
import { emailProblem, USERNAME_RE, useDialogKeys, fmt } from './dialogShared';

export default function AuthDialog({ mode, plan, onClose, onSwitch, onSuccess, onForgot }) {
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