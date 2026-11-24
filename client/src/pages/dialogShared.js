import { useEffect, useRef } from 'react';

/* ---------- auth dialog ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export function emailProblem(value) {
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

export const SELECT_STYLE = {
  width: '100%', padding: '10px 12px', font: 'inherit', color: 'inherit',
  background: '#fff', border: '1px solid rgba(0,0,0,.35)', borderRadius: 10,
};
export const fmt = (n) => Number(n).toLocaleString('en-US');
export const GOAL_TEXT = {
  gain: 'Suggested focus: lean muscle surplus',
  maintain: 'Suggested focus: maintenance and strength PRs',
  lose: 'Suggested focus: steady deficit plus 10k steps',
};

/** Esc closes the dialog, the first field gets focus on open, focus goes back to the opener on close. */
export function useDialogKeys(onClose, firstRef) {
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

