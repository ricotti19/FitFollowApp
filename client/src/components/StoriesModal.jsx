import React, { useState, useEffect, useRef } from 'react';
import { api, photoUrl } from '../lib/api';
import { compressImage } from '../lib/image';
import { timeAgo } from '../lib/format';
import Avatar from './Avatar';

function StoryPhoto({ path }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    photoUrl(path.replace(/^\/api/, '')).then((u) => live && setSrc(u)).catch(() => {});
    return () => { live = false; };
  }, [path]);
  if (!src) return null;
  return (
    <img
      src={src}
      alt="Story"
      style={{
        display: 'block',
        width: 'auto',
        height: 'auto',
        maxWidth: '100%',
        maxHeight: 460,
        margin: '0 auto 12px',
        borderRadius: 16,
        boxShadow: '0 6px 20px rgba(20, 20, 31, 0.08)',
      }}
    />
  );
}

export default function StoriesModal({ user, focusUsername = null, onClearFocus, onClose, onOpenProfile }) {
    const [stories, setStories] = useState([]);
  const [feedStories, setFeedStories] = useState([]);
  const [pendingStories, setPendingStories] = useState([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const dialogRef = useRef(null);
  const storySentinelRef = useRef(null);

  useEffect(() => {
    const el = storySentinelRef.current;
    const root = dialogRef.current;
    if (!el || !root || visibleCount >= feedStories.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + 12);
      },
      { root, rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, feedStories.length]);
  const [openViewersId, setOpenViewersId] = useState(null);
  const [confirmDeleteStoryId, setConfirmDeleteStoryId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyStatus, setReplyStatus] = useState({});
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/stories/mine').then((d) => setStories(d.stories || [])).catch(() => {});
    api.get('/stories/feed').then((d) => {
      setFeedStories((d.stories || []).filter((s) => !s.mine));
      setPendingStories([]);
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const id = setInterval(() => {
      api.get('/stories/feed').then((d) => {
        const incoming = (d.stories || []).filter((s) => !s.mine);
        setFeedStories((current) => {
          const seen = new Set(current.map((x) => x.id));
          const fresh = incoming.filter((x) => !seen.has(x.id));
          if (fresh.length > 0) setPendingStories(fresh);
          return current;
        });
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!photo) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const handleSelectFile = (f) => {
    if (f && f.type.startsWith('image/')) setPhoto(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('audience', 'PUBLIC');
      if (photo) fd.append('photo', await compressImage(photo), photo.name || 'story.jpg');
      await api.post('/stories', fd);
      setText('');
      setPhoto(null);
      setMsg('Added to your 24-hour story!');
      load();
    } catch (err) {
      setMsg(err.message || 'Could not post story.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20, 20, 31, 0.52)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="stack"
        style={{
          width: 'min(760px, 94vw)',
          maxHeight: '88vh',
          overflowY: 'auto',

          background: 'rgba(255, 255, 255, 0.96)',
          color: 'var(--ink-strong, #14141f)',
          border: '2px solid rgba(20, 20, 31, 0.16)',
          borderRadius: 28,
          padding: '36px 40px',
          boxShadow: '0 24px 60px rgba(20, 20, 31, 0.24)',
        }}
      >
        <div className="row spread">
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            {focusUsername ? `@${focusUsername}’s 24h Story` : 'Your 24h Fitness Story'}
          </h2>
          <div className="row" style={{ gap: 8 }}>
            {focusUsername && (
              <button type="button" className="btn small ghost" onClick={onClearFocus}>
                All Stories
              </button>
            )}
            <button type="button" className="btn small ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        {!focusUsername && (
        <form onSubmit={submit} className="stack" style={{ gap: 16 }}>

          <textarea
            rows={2}
            placeholder="Quick 24h workout win (e.g., 5am leg day done!)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required={!photo}
          />

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleSelectFile(e.dataTransfer.files?.[0]); }}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'rgba(20, 20, 31, 0.25)'}`,
              borderRadius: 18,
              padding: previewUrl ? 14 : '24px 16px',
              textAlign: 'center',
              background: dragOver ? 'var(--accent-soft)' : 'rgba(247, 244, 255, 0.75)',
            }}
          >
            {!previewUrl ? (
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                <input type="file" accept="image/*" onChange={(e) => handleSelectFile(e.target.files?.[0])} style={{ display: 'none' }} />
                <span style={{ fontSize: '1.6rem' }}>📸</span>
                <span style={{ fontWeight: 700 }}>Drop Story Photo (Optional)</span>
                <span className="small muted">PNG, JPG, JPEG • Click or Drag &amp; Drop</span>
              </label>
            ) : (
              <div className="stack" style={{ alignItems: 'center', gap: 10 }}>
                <img src={previewUrl} alt="Story preview" style={{ maxHeight: 260, borderRadius: 12 }} />
                <button type="button" className="btn small ghost" onClick={() => setPhoto(null)}>Remove Photo</button>
              </div>
            )}
          </div>

          <button type="submit" className="btn block" disabled={busy}>
            {busy ? 'Posting Story...' : 'Add to Story (24h)'}
          </button>
        </form>
        )}

        {msg && <div className="notice ok">{msg}</div>}

      {!focusUsername && (
      <div className="stack" style={{ gap: 14 }}>
        {stories.length === 0 ? (
          <p className="empty">No active stories in the last 24 hours.</p>

                    ) : stories.map((st) => {
            const viewers = st.viewers || [];
            const showViewers = openViewersId === st.id;
            return (
              <div key={st.id} style={{ background: '#ffffff', borderRadius: 18, overflow: 'hidden', border: '1.5px solid rgba(20, 20, 31, 0.12)' }}>
                <div className="row spread" style={{ padding: '12px 16px' }}>
                  <span className="small muted">{st.createdAt ? timeAgo(st.createdAt) : 'Active'} • Expires in 24h</span>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={async () => {
                        const next = showViewers ? null : st.id;
                        setOpenViewersId(next);
                        if (next) await load();
                      }}
                    >
                      👁️ Seen by {viewers.length}
                    </button>

                    <button type="button" className="btn small ghost" onClick={() => setConfirmDeleteStoryId(st.id)}>Delete</button>
                    {(st.reactions || []).length > 0 && (
                      <span className="chip accent">
                        {st.reactions.map((r) => r.emoji).join(' ')} ({st.reactions.length})
                      </span>
                    )}
                  </div>
                </div>
                {st.text && <div style={{ padding: '0 16px 14px', fontSize: '1.1rem', fontWeight: 600 }}>{st.text}</div>}
                {st.photoUrl && <StoryPhoto path={st.photoUrl} />}
                {showViewers && (
                  <div style={{ padding: '10px 16px', background: 'rgba(247, 244, 255, 0.85)', borderTop: '1px solid var(--line)' }}>
                    {viewers.length === 0
                      ? <span className="small muted">No views yet.</span>
                      : <span className="small"><strong>Viewed by:</strong> {viewers.map((v) => `@${v.username}`).join(', ')}</span>}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      )}

      {(feedStories.length > 0 || (focusUsername === user?.username && stories.length > 0)) && (
          <div id="ff-stories-feed" className="stack" style={{ gap: 12, marginTop: 8 }}>
            {pendingStories.length > 0 && (
              <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn small"
                  style={{ background: '#e14b63', color: '#ffffff', boxShadow: '0 8px 22px rgba(225, 75, 99, 0.35)' }}
                  onClick={() => {
                    setFeedStories((prev) => {
                      const seen = new Set(prev.map((x) => x.id));
                      return [...pendingStories.filter((x) => !seen.has(x.id)), ...prev];
                    });
                    setPendingStories([]);
                    document.getElementById('ff-stories-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  ❤️ See {pendingStories.length} new {pendingStories.length === 1 ? 'story' : 'stories'}
                </button>
              </div>
            )}
            
            {!focusUsername && (
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Friends &amp; Public Stories ({feedStories.length})</h3>
            )}
            
                        {(focusUsername
              ? (focusUsername === user?.username ? stories.map((s) => ({ ...s, mine: true, author: user })) : feedStories.filter((s) => s.author?.username === focusUsername))
              : feedStories)
              .slice(0, visibleCount)
              .map((st) => (

              <div
                key={st.id}
                onClick={async () => {
                  if (!st.mine && !st.viewedByMe) {
                    await api.post(`/stories/${st.id}/view`).catch(() => {});
                    setFeedStories((prev) => prev.map((x) => (x.id === st.id ? { ...x, viewedByMe: true } : x)));
                  }
                }}
                style={{ cursor: 'pointer', background: '#ffffff', borderRadius: 18, overflow: 'hidden', border: '1.5px solid rgba(20, 20, 31, 0.12)' }}
              >
                <div className="row spread" style={{ padding: '12px 16px' }}>
                                    <div
                    className="row"
                    role="button"
                    tabIndex={0}
                    style={{ gap: 10, cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      onOpenProfile?.(st.author?.username);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        onClose();
                        onOpenProfile?.(st.author?.username);
                      }
                    }}
                  >
                    <Avatar user={st.author} size={34} />
                    <div className="person-names">
                      <div className="name" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{st.author?.displayName || st.author?.username}</div>
                      <div className="handle">@{st.author?.username} • {st.createdAt ? timeAgo(st.createdAt) : 'Active'}</div>
                    </div>
                  </div>
                                    {st.mine ? (
                    <button
                      type="button"
                      className="btn small dark-navy"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteStoryId(st.id);
                      }}
                    >
                      Delete
                    </button>
                  ) : (
                    <span className={`chip ${st.viewedByMe ? '' : 'accent'}`}>{st.viewedByMe ? 'Viewed' : 'New'}</span>
                  )}
                </div>            
              {st.text && <div style={{ padding: '0 16px 14px', fontSize: '1.1rem', fontWeight: 600 }}>{st.text}</div>}
                {st.photoUrl && <StoryPhoto path={st.photoUrl} />}

                                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {['💪', '🔥', '👏', '❤️'].map((emoji) => {
                      const list = (st.reactions || []).filter((r) => r.emoji === emoji);
                      const active = list.some((r) => r.username === user?.username);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={`btn small ${active ? '' : 'ghost'}`}
                          style={{ padding: '4px 10px', borderRadius: 999 }}
                          onClick={async () => {
                            const d = await api.post(`/stories/${st.id}/react`, { emoji }).catch(() => null);
                            if (d) {
                              setFeedStories((prev) =>
                                prev.map((x) => (x.id === st.id ? { ...x, reactions: d.reactions } : x))
                              );
                            }
                          }}
                        >
                          {emoji} {list.length > 0 ? list.length : ''}
                        </button>
                      );
                    })}
                  </div>

                  <div className="row" style={{ gap: 8 }}>
                    <input
                      type="text"
                      placeholder={`Reply to @${st.author.username}'s story...`}
                      value={replyDrafts[st.id] || ''}
                      onChange={(e) => setReplyDrafts((p) => ({ ...p, [st.id]: e.target.value }))}
                      onKeyDown={async (e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const txt = (replyDrafts[st.id] || '').trim();
                        if (!txt) return;
                        try {
                          await api.post(`/messages/${st.author.id}`, { text: `Replied to your story: "${txt}"` });
                          setReplyDrafts((p) => ({ ...p, [st.id]: '' }));
                          setReplyStatus((p) => ({ ...p, [st.id]: 'Sent to DMs!' }));
                        } catch (err) {
                          setReplyStatus((p) => ({ ...p, [st.id]: err.message || 'Add as friend first to reply.' }));
                        }
                      }}
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
                    />
                    <button
                      type="button"
                      className="btn small"
                      onClick={async () => {
                        const txt = (replyDrafts[st.id] || '').trim();
                        if (!txt) return;
                        try {
                          await api.post(`/messages/${st.author.id}`, { text: `Replied to your story: "${txt}"` });
                          setReplyDrafts((p) => ({ ...p, [st.id]: '' }));
                          setReplyStatus((p) => ({ ...p, [st.id]: 'Sent to DMs!' }));
                        } catch (err) {
                          setReplyStatus((p) => ({ ...p, [st.id]: err.message || 'Add as friend first to reply.' }));
                        }
                      }}
                    >
                      Reply
                    </button>
                  </div>
                                    {replyStatus[st.id] && <span className="small muted">{replyStatus[st.id]}</span>}
                </div>

              </div>
            ))}
            {visibleCount < feedStories.length && (
              <div ref={storySentinelRef} style={{ height: 24 }} aria-hidden="true" />
            )}
          </div>
        )}
      </div>

      {confirmDeleteStoryId && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDeleteStoryId(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(20, 20, 31, 0.52)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="stack"
            style={{
              width: 'min(420px, 92vw)',
              background: '#ffffff',
              color: '#14141f',
              border: '2px solid rgba(20, 20, 31, 0.16)',
              borderRadius: 24,
              padding: '26px 28px',
              boxShadow: '0 22px 50px rgba(20, 20, 31, 0.25)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Delete this 24h story?</h3>
            <p className="small muted" style={{ margin: 0 }}>
              This will permanently remove your story from FitFollow.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button type="button" className="btn small ghost" onClick={() => setConfirmDeleteStoryId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={async () => {
                  const targetId = confirmDeleteStoryId;
                  setConfirmDeleteStoryId(null);
                  setStories((prev) => prev.filter((x) => x.id !== targetId));
                  await api.del(`/stories/${targetId}`).catch(() => {});
                  load();
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
