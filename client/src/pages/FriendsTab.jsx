import React, { useState, useEffect } from 'react';
import { api, photoUrl } from '../lib/api';
import { compressImage } from '../lib/image';
import { timeAgo, AUDIENCE_LABEL } from '../lib/format';
import Avatar from '../components/Avatar';

const AUDIENCE_HINT = {
  PRIVATE: 'Only you can see this post.',
  FRIENDS: 'Only you and your accepted friends can see this post.',
  PUBLIC: 'Everyone can see this post, and it appears in Discover.',
};

// Photos sit behind the privacy filter, so <img src> can't send our token: fetch as a blob (see lib/api.js).
function PostPhoto({ path }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    photoUrl(path.replace(/^\/api/, '')).then((u) => live && setSrc(u)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [path]);
  if (failed) return null;
  if (!src) return <div className="skeleton" style={{ height: 240 }} />;
  return <img src={src} alt="Workout" style={{ display: 'block', width: '100%', maxHeight: 480, objectFit: 'cover' }} />;
}

function Person({ u }) {
  return (
    <div className="person">
      <Avatar user={u} size={36} />
      <div className="person-names">
        <div className="name">{u.displayName || u.username}</div>
        <div className="handle">@{u.username}</div>
        {u.bio && <div className="small muted" style={{ marginTop: 2 }}>{u.bio}</div>}
      </div>
    </div>
  );
}

export default function FriendsTab({ user, onOpenSettings }) {
  const [feed, setFeed] = useState([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [scope, setScope] = useState('friends'); // 'friends' = Home (me + friends), 'discover' = public posts from public accounts
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [searched, setSearched] = useState(false);
  const [friendMsg, setFriendMsg] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [postText, setPostText] = useState('');
  const [audience, setAudience] = useState(user?.defaultAudience || 'FRIENDS');
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [cvNotice, setCvNotice] = useState('');
  const [posting, setPosting] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { title, body, confirmLabel, onConfirm }
  const [suggested, setSuggested] = useState([]);
  const [showSuggested, setShowSuggested] = useState(true);
  const [activeChat, setActiveChat] = useState(null); // { id, username, displayName, avatarUrl }
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [msgErr, setMsgErr] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({}); // { [postId]: string }
  const [commentErrs, setCommentErrs] = useState({});

    const loadFeed = async () => {
    try {
      const res = await api.get(`/feed?scope=${scope}`);
      setFeed(res.posts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setFeedLoaded(true);
    }
  };
  const loadFriends = async () => {
    try {
      const res = await api.get('/friends');
      setFriends(res.friends || []);
      setIncoming(res.incoming || []);
      setOutgoing(res.outgoing || []);
    } catch (e) {
      console.error(e);
    }
  };

  // 1. Load suggested people immediately on mount
  useEffect(() => {
    api.get('/friends/suggested').then((d) => setSuggested(d.users || [])).catch(() => {});
  }, []);

  // 2. Live debounced typeahead search (250ms after typing 2+ chars)
  useEffect(() => {
    const clean = searchQ.trim().replace(/^@/, '');
    if (clean.length < 2) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/friends/search?q=${encodeURIComponent(clean)}`)
        .then((d) => { setSearchResults(d.users || []); setSearched(true); })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQ]);

  // 3. Poll active DM thread every 3 seconds when open
  useEffect(() => {
    if (!activeChat) return;
    let cancelled = false;
    const loadChat = () =>
      api.get(`/messages/${activeChat.id}`)
        .then((d) => { if (!cancelled) setMessages(d.messages || []); })
        .catch(() => {});
    loadChat();
    const id = setInterval(loadChat, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeChat]);

  const loadSocial = () => Promise.all([loadFeed(), loadFriends()]);

  useEffect(() => { setFeedLoaded(false); loadFeed(); }, [scope]);
  useEffect(() => { loadFriends(); }, []);


  // Clean up object URL when photo changes or unmounts
  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const handleSelectFile = (selected) => {
    if (!selected || !selected.type.startsWith('image/')) return;
    setPhoto(selected);
    setCvNotice('');
  };

  const handleClearPhoto = () => {
    setPhoto(null);
    setPreviewUrl(null);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const q = searchQ.trim();
    setFriendMsg('');
    if (q.length < 2) { setSearchResults([]); setSearched(false); setFriendMsg('Type at least 2 characters.'); return; }
    try {
      const res = await api.get(`/friends/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.users || []);
      setSearched(true);
    } catch (err) {
      setFriendMsg(err.message);
    }
  };

  // One helper for every friend action: run it, show any error, then refresh requests/friends/feed
  const friendAction = async (userId, call, nextState) => {
    setFriendMsg('');
    try {
      const res = await call();
      const state = res?.state || nextState;
      setSearchResults((rows) => rows.map((u) => (u.id === userId ? { ...u, state } : u)));
      setSuggested((rows) => rows.map((u) => (u.id === userId ? { ...u, state } : u)));
      await loadSocial();
    } catch (err) {
      setFriendMsg(err.message);
    }
  };
  const sendRequest = (id) => friendAction(id, () => api.post(`/friends/${id}/send`));
  const acceptRequest = (id) => friendAction(id, () => api.post(`/friends/${id}/accept`), 'FRIENDS');
  const removeRelation = (id) => friendAction(id, () => api.del(`/friends/${id}`), 'NONE');

    const sendDm = async (e) => {
    e.preventDefault();
    const text = msgText.trim();
    if (!text || !activeChat) return;
    setMsgErr('');
    try {
      const d = await api.post(`/messages/${activeChat.id}`, { text });
      setMessages((prev) => [...prev, d.message]);
      setMsgText('');
    } catch (err) {
      setMsgErr(err.message || 'Could not send message.');
    }
  };

  const addComment = async (postId) => {
    const text = (commentDrafts[postId] || '').trim();
    if (!text) return;
    setCommentErrs((p) => ({ ...p, [postId]: '' }));
    try {
      const d = await api.post(`/feed/${postId}/comments`, { text });
      setFeed((prev) => prev.map((p) => (p._id === postId ? { ...p, comments: [...(p.comments || []), d.comment] } : p)));
      setCommentDrafts((p) => ({ ...p, [postId]: '' }));
    } catch (err) {
      setCommentErrs((p) => ({ ...p, [postId]: err.message || 'Could not post comment.' }));
    }
  };

  const deleteComment = async (postId, cid) => {
    try {
      await api.del(`/feed/${postId}/comments/${cid}`);
      setFeed((prev) => prev.map((p) => (p._id === postId ? { ...p, comments: (p.comments || []).filter((c) => c._id !== cid) } : p)));
    } catch {}
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
      if (scope !== 'friends')
        setScope('friends'); // one's own post lives on Home
      else loadFeed();

    } catch (err) {
      setCvNotice(err.message);
    } finally {
      setPosting(false);
    }
  };

    const handleDeletePost = (postId) => {
    setConfirmModal({
      title: 'Delete Post?',
      body: 'This will permanently remove your post from FitFollow.',
      confirmLabel: 'Delete Post',
      onConfirm: async () => {
        setConfirmModal(null);
        setCvNotice('');
        try {
          await api.del(`/feed/${postId}`);
          setFeed((prev) => prev.filter((p) => p._id !== postId));
        } catch (err) {
          setCvNotice(err.message);
        }
      },
    });
  };



  return (
    <div className="stack">
      {/* CREATE PROGRESS POST WITH PRIVACY LOCK + ML CV CHECK (FR-21, FR-22) */}
      <form onSubmit={handleCreatePost} className="card stack">
        <div className="row spread">
          <h2 className="card-title">Share Progress</h2>

          <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
            <option value="PRIVATE">Only me</option>
            <option value="FRIENDS">Friends</option>
            <option value="PUBLIC" disabled={!user?.isPublic}>Public</option>
          </select>
        </div>
        <div className="small muted">
          {AUDIENCE_HINT[audience]}
          {!user?.isPublic && (
            <> Want to post publicly?{' '}
              <button type="button" className="settings-back" style={{ fontSize: 'inherit' }} onClick={onOpenSettings}>Switch to a public account</button>
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

      {/* FRIEND REQUESTS waiting on me */}
      {incoming.length > 0 && (
        <section className="card stack">
          <h2 className="card-title">Friend requests</h2>
          <div className="list">
            {incoming.map((u) => (
              <div key={u.id} className="item spread">
                <Person u={u} />
                <span className="row">
                  <button type="button" className="btn small" onClick={() => acceptRequest(u.id)}>Accept</button>
                  <button type="button" className="btn small ghost" onClick={() => removeRelation(u.id)}>Decline</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* USER SEARCH & FRIEND REQUESTS (FR-17, FR-18) */}
      <section className="card stack">
        <div className="row spread">
          <h2 className="card-title">Find Friends</h2>
          <span className="chip">{friends.length} connected</span>
        </div>
        <form onSubmit={handleSearch} className="row">
          <input placeholder="Search by name or username..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} className="grow" />
          <button type="submit" className="btn">Search</button>
        </form>
        {friendMsg && <div className="notice">{friendMsg}</div>}
        {searched && searchResults.length === 0 && !friendMsg && <div className="small muted">No users found for “{searchQ.trim()}”.</div>}
        {searchResults.length > 0 && (
          <div className="list">
            {searchResults.map((u) => (
              <div key={u.id} className="item spread">
                <Person u={u} />
                {u.state === 'NONE' && <button type="button" className="btn small" onClick={() => sendRequest(u.id)}>Add</button>}
                {u.state === 'REQUEST_SENT' && <button type="button" className="btn small ghost" onClick={() => removeRelation(u.id)} title="Cancel request">Requested · Cancel</button>}
                {u.state === 'REQUEST_RECEIVED' && <button type="button" className="btn small" onClick={() => acceptRequest(u.id)}>Accept</button>}
                {u.state === 'FRIENDS' && <span className="chip accent">Friends</span>}
              </div>
            ))}
          </div>
        )}
        
        {searchQ.trim().length < 2 && suggested.length > 0 && (
        <>
         <div className="row spread">
           <span className="small muted">Suggested people</span>
           <button
             type="button"
             className="btn small ghost"
             style={{ padding: '2px 10px', fontSize: '0.78rem' }}
             onClick={() => setShowSuggested((s) => !s)}
           >
             {showSuggested ? 'Hide' : `Show (${suggested.length})`}
           </button>
         </div>
         {showSuggested && (
           <div className="list">
             {suggested.map((u) => (
               <div key={u.id} className="item spread">
                 <Person u={u} />
                 {u.state === 'NONE' && <button type="button" className="btn small" onClick={() => sendRequest(u.id)}>Add</button>}
                 {u.state === 'REQUEST_SENT' && <button type="button" className="btn small ghost" onClick={() => removeRelation(u.id)}>Requested · Cancel</button>}
                 {u.state === 'FRIENDS' && <span className="chip accent">Friends</span>}
               </div>
             ))}
           </div>
         )}
       </>
     )}

        {friends.length > 0 && (
          <>
            <div className="small muted">Your friends</div>
            <div className="list">
              {friends.map((u) => (
                  <div key={u.id} className="item spread">
                  <Person u={u} />
                  <span className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn small dark-navy" onClick={() => { setActiveChat(u); setMsgErr(''); }}>
                      Message
                    </button>
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={() =>
                        setConfirmModal({
                          title: `Remove @${u.username}?`,
                          body: 'They will no longer see your Friends-only posts.',
                          confirmLabel: 'Remove Friend',
                          onConfirm: () => {
                            setConfirmModal(null);
                            removeRelation(u.id);
                          },
                        })
                      }
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {outgoing.length > 0 && <div className="small muted">Waiting on: {outgoing.map((u) => `@${u.username}`).join(', ')}</div>}
      </section>

      {/* FEED (FR-22): Home = me + friends, Discover = public posts from public accounts */}
      <div className="seg" role="tablist" aria-label="Feed">
        <button type="button" role="tab" aria-selected={scope === 'friends'} className={scope === 'friends' ? 'on' : ''} onClick={() => setScope('friends')}>Home</button>
        <button type="button" role="tab" aria-selected={scope === 'discover'} className={scope === 'discover' ? 'on' : ''} onClick={() => setScope('discover')}>Discover</button>
      </div>
      <section className="stack">
        {!feedLoaded ? (
          <div className="spinner" aria-label="Loading" />
        ) : feed.length === 0 ? (
          <div className="card empty">
            {scope === 'friends'
              ? 'Nothing here yet. Share a post, add friends above, or browse Discover.'
              : 'No public posts to discover yet.'}
          </div>
        ) : feed.map((p) => (
          <article key={p._id} className="post">
            <div className="post-head">
              <Avatar user={p.author} size={36} />
              <div className="grow person-names">
                <div className="name">{p.author?.displayName || p.author?.username || 'user'}{p.mine && <span className="chip accent" style={{ marginLeft: 8 }}>You</span>}</div>
                <div className="handle">@{p.author?.username || 'user'} • {AUDIENCE_LABEL[p.audience] || p.audience}{p.createdAt ? ` • ${timeAgo(p.createdAt)}` : ''}</div>
              </div>  
              {p.mine && (
                <button type="button" className="btn small dark-navy" onClick={() => handleDeletePost(p._id)}>
                  Delete
                </button>
              )}
            </div>
            {p.text && <div className="post-text">{p.text}</div>}
            {p.photoUrl && <PostPhoto path={p.photoUrl} />}
            {p.photoStatus === 'review' && <div style={{ padding: '10px 16px 0' }}><span className="chip">Photo pending moderator review (only you can see it)</span></div>}
            {p.cvStatus && p.photoStatus !== 'review' && <div style={{ padding: '0 16px 14px' }}><span className="chip accent">{p.cvStatus}</span></div>}
                        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(16, 21, 68, 0.08)' }}>
              {(p.comments || []).map((c) => (
                <div key={c._id} className="row" style={{ justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 6 }}>
                  <span><strong>@{c.author?.username}</strong> {c.text}</span>
                  {(c.mine || p.mine) && (
                    <button type="button" className="btn small ghost" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={() => deleteComment(p._id, c._id)}>×</button>
                  )}
                </div>
              ))}
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <input
                  type="text"
                  placeholder="Add a fitness comment..."
                  value={commentDrafts[p._id] || ''}
                  onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [p._id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addComment(p._id))}
                  style={{ flex: 1, padding: '6px 10px', fontSize: '0.88rem' }}
                />
                <button type="button" className="btn small dark-navy" onClick={() => addComment(p._id)}>Post</button>
              </div>
              {commentErrs[p._id] && <div className="small" style={{ color: '#b42318', marginTop: 4 }}>{commentErrs[p._id]}</div>}
            </div>
          </article>
        ))}
      </section>

            {confirmModal && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmModal(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(16, 21, 68, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%', maxWidth: 380,
              background: '#fff7e0',
              color: '#101544',
              border: '2px solid #101544',
              borderRadius: 20,
              padding: '22px 24px',
              boxShadow: '0 18px 40px rgba(16, 21, 68, 0.25)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#101544' }}>
              {confirmModal.title}
            </h3>
            <p className="small muted" style={{ margin: '0 0 20px', lineHeight: 1.45 }}>
              {confirmModal.body}
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn small ghost"
                style={{ color: '#101544', fontWeight: 700 }}
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn small"
                style={{ background: '#101544', color: '#ffffff', fontWeight: 700 }}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
            {activeChat && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveChat(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(16, 21, 68, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%', maxWidth: 420,
              background: '#fff7e0', color: '#101544',
              border: '2px solid #101544', borderRadius: 20, padding: '20px 22px',
              boxShadow: '0 18px 40px rgba(16, 21, 68, 0.25)',
            }}
          >
            <div className="row spread" style={{ marginBottom: 12 }}>
              <strong>Chat with {activeChat.displayName || activeChat.username} (@{activeChat.username})</strong>
              <button type="button" className="btn small ghost" onClick={() => setActiveChat(null)}>Close</button>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {messages.length === 0 && <p className="small muted">No messages yet. Say hi!</p>}
              {messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', background: m.mine ? '#101544' : '#ffffff', color: m.mine ? '#ffffff' : '#101544', padding: '8px 12px', borderRadius: 12, maxWidth: '80%', fontSize: '0.9rem' }}>
                  {m.text}
                </div>
              ))}
            </div>
            {msgErr && <p className="small" style={{ color: '#b42318', marginBottom: 8 }}>{msgErr}</p>}
            <form onSubmit={sendDm} className="row" style={{ gap: 8 }}>
              <input type="text" value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Send a fitness message..." style={{ flex: 1 }} />
              <button type="submit" className="btn small dark-navy">Send</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}