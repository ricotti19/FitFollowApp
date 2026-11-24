import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api';
import { emailProblem } from './dialogShared';

export default function ResetPasswordDialog({ initialEmail = '', onClose, onDone }) {
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
