import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { compressImage } from '../lib/image';

const AUDIENCE_HINT = {
  PRIVATE: 'Only you can see this post.',
  FRIENDS: 'Only you and your accepted friends can see this post.',
  PUBLIC: 'Everyone can see this post, and it appears in Discover.',
};

/** "Share Progress" form: privacy lock + photo dropzone + ML CV check (FR-21, FR-22). */
export default function PostComposer({ user, onOpenSettings, onPosted }) {
  const [postText, setPostText] = useState('');
  const [audience, setAudience] = useState(user?.defaultAudience || 'FRIENDS');
  const [photo, setPhoto] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [cvNotice, setCvNotice] = useState('');
  const [posting, setPosting] = useState(false);

  // Preview URL is derived from the photo; revoke it when the photo changes or the form unmounts
  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleSelectFile = (selected) => {
    if (!selected || !selected.type.startsWith('image/')) return;
    setPhoto(selected);
    setCvNotice('');
  };

  const handleClearPhoto = () => {
    setPhoto(null);
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    setPosting(true);
    setCvNotice('');
    try {
      const fd = new FormData();
      fd.append('text', postText);
      fd.append('audience', audience);
      if (photo) {
        const compressed = await compressImage(photo);
        fd.append('photo', compressed, photo.name || 'workout.jpg');
      }
      const res = await api.post('/feed', fd);
      if (res.photoStatus === 'review') setCvNotice(`Posted. Your photo is waiting for a moderator before others can see it. (${res.cvStatus})`);
      else if (res.photoStatus === 'approved') setCvNotice(`Photo approved. ${res.cvStatus}`);
      setPostText('');
      handleClearPhoto();
      onPosted(); // parent decides: switch to Home or reload it
    } catch (err) {
      setCvNotice(err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <form onSubmit={handleCreatePost} className="card stack">
      <div className="row spread">
        <h2 className="card-title">Share Progress</h2>

        <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
          <option value="PRIVATE">Only me</option>
          <option value="FRIENDS">Friends</option>
          <option value="PUBLIC" disabled={!user?.isPublic}>Public</option>
        </select>
      </div>
            <div className="small muted" style={{ lineHeight: 1.45 }}>
        {AUDIENCE_HINT[audience]}
        {!user?.isPublic && (
          <> Want to post publicly?{' '}
            <button
              type="button"
              className="link-btn"
              style={{ fontSize: 'inherit', fontWeight: 700, padding: 0, textDecoration: 'underline' }}
              onClick={onOpenSettings}
            >
              Switch to a public account
            </button>
          </>
        )}
      </div>

      <textarea
        rows={3}
        placeholder="What's your workout win?"
        value={postText}
        onChange={(e) => setPostText(e.target.value)}
        required={!photo}
      />

      {/* DASHED DROPZONE + LIVE PREVIEW */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleSelectFile(e.dataTransfer.files?.[0]);
        }}
        style={{
          border: `2px dashed ${dragOver ? 'var(--navy, #101544)' : 'rgba(16, 21, 68, 0.25)'}`,
          borderRadius: 18,
          padding: previewUrl ? 14 : '24px 16px',
          textAlign: 'center',
          background: dragOver ? 'rgba(254, 221, 90, 0.25)' : 'rgba(255, 247, 224, 0.65)',
          transition: 'all 0.2s ease',
        }}
      >
        {!previewUrl ? (
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(16, 21, 68, 0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.35rem', marginBottom: 4
            }}>
              🏋️
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--navy, #101544)' }}>
              Drop Workout or Progress Photo
            </span>
            <span className="small muted" style={{ letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.72rem' }}>
              PNG, JPG, JPEG • Click or Drag &amp; Drop
            </span>
            <span className="small muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
              🔒 Checked by AI Pose Verification before sharing
            </span>
          </label>
        ) : (
          <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
            <img
              src={previewUrl}
              alt="Selected progress preview"
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: 320,
                borderRadius: 12,
                display: 'block',
                margin: '0 auto',
                boxShadow: '0 4px 14px rgba(16, 21, 68, 0.1)'
              }}
            />
            <div className="row spread" style={{ width: '100%', padding: '0 4px' }}>
              <span className="small" style={{ fontWeight: 700, color: 'var(--navy, #101544)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                Target: {photo?.name}
              </span>
              <button
                type="button"
                onClick={handleClearPhoto}
                className="btn small dark-navy"
                style={{ background: '#101544', color: '#ffffff', fontWeight: 700 }}
              >
                Clear Image
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={posting}
        className="btn"
        style={{ width: '100%', padding: '12px 16px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        {posting
          ? (photo ? 'Running Computer Vision Model...' : 'Sharing Progress...')
          : (photo ? 'Verify & Share Progress' : 'Share Progress')}
      </button>

      {cvNotice && <div className="notice">{cvNotice}</div>}
    </form>
  );
}
