import React, { useState } from 'react';
import { api } from '../lib/api';
import { compressImage } from '../lib/image';
import Avatar from '../components/Avatar';

const AVATAR_LIMIT = 60000; // characters of data URL the server accepts (see AVATAR_MAX_CHARS in visibility.js)

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Could not read that file.'));
  r.readAsDataURL(blob);
});

// Shrink a photo until it fits the server limit (a profile photo only needs to be tiny).
async function shrinkToAvatar(file) {
  for (const [width, quality] of [[256, 0.82], [160, 0.7], [96, 0.6]]) {
    const url = await readAsDataUrl(await compressImage(file, width, quality));
    if (url.length <= AVATAR_LIMIT && /^data:image\/(jpeg|png|webp);base64,/.test(url)) return url;
  }
  throw new Error("Couldn't shrink that photo enough. Try a different image (JPEG, PNG or WebP).");
}

function Msg({ m }) {
  if (!m) return null;
  return <div className={`notice ${m.ok ? 'ok' : ''}`}>{m.text}</div>;
}

export default function SettingsPage({ user, onUserChange, onBack }) {
  const [name, setName] = useState(user.displayName || user.username);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({}); // { profile, privacy, password }: each { ok, text }
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  const flash = (section, ok, text) => setMsg((m) => ({ ...m, [section]: { ok, text } }));

  const save = async (section, body, okText = 'Saved.') => {
    setBusy(true);
    setMsg((m) => ({ ...m, [section]: null }));
    try {
      const res = await api.patch('/me', body);
      onUserChange(res.user);
      flash(section, true, okText);
    } catch (err) {
      flash(section, false, err.message);
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    try {
      await save('profile', { avatarUrl: await shrinkToAvatar(file) }, 'Photo updated.');
    } catch (err) {
      flash('profile', false, err.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setMsg((m) => ({ ...m, password: null }));
    if (pw.next !== pw.confirm) return flash('password', false, "The new passwords don't match.");
    setBusy(true);
    try {
      await api.post('/me/password', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      flash('password', true, 'Password changed.');
    } catch (err) {
      flash('password', false, err.message);
    } finally {
      setBusy(false);
    }
  };

  const nameChanged = name.trim() && name.trim() !== (user.displayName || user.username);

  return (
    <div className="stack">
      <button type="button" className="settings-back" onClick={onBack}>← Back</button>
      <h1 className="card-title" style={{ fontSize: '1.25rem' }}>Profile &amp; privacy</h1>

      {/* PROFILE (FR-4) */}
      <section className="card stack">
        <h2 className="card-title">Profile</h2>
        <div className="row">
          <Avatar user={user} size={72} />
          <div className="stack" style={{ gap: 8 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="btn small ghost" style={{ cursor: 'pointer' }}>
                {user.avatarUrl ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickPhoto} disabled={busy} />
              </label>
              {user.avatarUrl && (
                <button type="button" className="btn small ghost" disabled={busy} onClick={() => save('profile', { avatarUrl: null }, 'Photo removed.')}>Remove</button>
              )}
            </div>
            <span className="small muted">@{user.username}</span>
          </div>
        </div>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); save('profile', { displayName: name.trim() }); }}>
          <label className="field">
            Display name
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <div><button type="submit" className="btn small" disabled={busy || !nameChanged}>Save name</button></div>
        </form>
        <Msg m={msg.profile} />
      </section>

      {/* PRIVACY (FR-4, FR-21, FR-22; Conflict 1) */}
      <section className="card stack">
        <h2 className="card-title">Privacy</h2>
        <label className={`choice ${!user.isPublic ? 'on' : ''}`}>
          <input type="radio" name="visibility" checked={!user.isPublic} disabled={busy} onChange={() => save('privacy', { isPublic: false })} />
          <div>
            <div className="t">Private account <span className="chip">default</span></div>
            <div className="small muted">Only your friends can see your posts. Nothing you post appears in Discover.</div>
          </div>
        </label>
        <label className={`choice ${user.isPublic ? 'on' : ''}`}>
          <input type="radio" name="visibility" checked={user.isPublic} disabled={busy} onChange={() => save('privacy', { isPublic: true })} />
          <div>
            <div className="t">Public account</div>
            <div className="small muted">Posts you mark Public appear in Discover for everyone. Friends-only and Only-me posts stay protected.</div>
          </div>
        </label>
        <label className="field">
          Default audience for new posts
          <select value={user.defaultAudience} disabled={busy} onChange={(e) => save('privacy', { defaultAudience: e.target.value })}>
            <option value="PRIVATE">Only me</option>
            <option value="FRIENDS">Friends</option>
            <option value="PUBLIC" disabled={!user.isPublic}>Public{user.isPublic ? '' : ' (needs a public account)'}</option>
          </select>
        </label>
        <div className="small muted">When people search for you they see only your name, username and photo, never your posts. You can still change the audience on each post.</div>
        <Msg m={msg.privacy} />
      </section>

      {/* SECURITY */}
      <section className="card stack">
        <h2 className="card-title">Password</h2>
        <div className="small muted">For your security, passwords are stored hashed and can never be displayed, only changed.</div>
        <form className="stack" onSubmit={changePassword}>
          <label className="field">Current password
            <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </label>
          <label className="field">New password
            <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </label>
          <label className="field">Confirm new password
            <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
          </label>
          <span className="small muted">At least 8 characters, with a letter and a number.</span>
          <div><button type="submit" className="btn small" disabled={busy || !pw.current || !pw.next || !pw.confirm}>Change password</button></div>
        </form>
        <Msg m={msg.password} />
      </section>
    </div>
  );
}