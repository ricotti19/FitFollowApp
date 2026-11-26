import { useState, useEffect, useRef } from 'react';
import { api, photoUrl } from '../lib/api';
import { timeAgo, AUDIENCE_LABEL } from '../lib/format';
import Avatar from '../components/Avatar';
import PostComposer from './PostComposer';
import FriendsPanel, { StoryAvatar } from './FriendsPanel';
import UserProfileView from './UserProfileView';
import { ConfirmDialog, ChatDialog } from './FriendsDialogs';

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
    return (
    <img
      src={src}
      alt="Workout"
      style={{
        display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 520,
        margin: '0 auto', borderRadius: 18, boxShadow: '0 8px 24px rgba(20, 20, 31, 0.08)',
      }}
    />
  );
}

// One feed post with its comment thread. Comment drafts/errors are local to the card
function PostCard({ post: p, onDelete, onCommentAdded, onCommentDeleted, onOpenProfile }) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  const addComment = async () => {
    const text = draft.trim();
    if (!text) return;
    setErr('');
    try {
      const d = await api.post(`/feed/${p._id}/comments`, { text });
      onCommentAdded(p._id, d.comment);
      setDraft('');
    } catch (e) {
      setErr(e.message || 'Could not post comment.');
    }
  };

  const deleteComment = async (cid) => {
    try {
      await api.del(`/feed/${p._id}/comments/${cid}`);
      onCommentDeleted(p._id, cid);
    } catch (e) {
      setErr(e.message || 'Could not delete comment.');
    }
  };

  return (
    <article className="post">
        <div className="post-head">
        <div
          className="row grow"
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer', gap: 10 }}
          onClick={() => onOpenProfile?.(p.author?.username)}
          onKeyDown={(e) => e.key === 'Enter' && onOpenProfile?.(p.author?.username)}
        >
          <Avatar user={p.author} size={36} />
          <div className="grow person-names">
            <div className="name">{p.author?.displayName || p.author?.username || 'user'}{p.mine && <span className="chip accent" style={{ marginLeft: 8 }}>You</span>}</div>
            <div className="handle">@{p.author?.username || 'user'} • {AUDIENCE_LABEL[p.audience] || p.audience}{p.createdAt ? ` • ${timeAgo(p.createdAt)}` : ''}</div>
          </div>
        </div>
        {p.mine && (
          <button type="button" className="btn small dark-navy" onClick={() => onDelete(p._id)}>
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
              <button type="button" className="btn small ghost" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={() => deleteComment(c._id)}>×</button>
            )}
          </div>
        ))}
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <input
            type="text"
            placeholder="Add a fitness comment..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addComment())}
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.88rem' }}
          />
          <button type="button" className="btn small dark-navy" onClick={addComment}>Post</button>
        </div>
        {err && <div className="small" style={{ color: '#b42318', marginTop: 4 }}>{err}</div>}
      </div>
    </article>
  );
}

export default function FriendsTab({ user, onOpenSettings, feedJump, onOpenStories }) {
  const [feed, setFeed] = useState([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingNewPosts, setPendingNewPosts] = useState([]);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sentinelRef = useRef(null);

  const [scope, setScope] = useState('friends');
  const [confirmModal, setConfirmModal] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [feedErr, setFeedErr] = useState('');
  const [profileModal, setProfileModal] = useState(null);
  const [reportModal, setReportModal] = useState(null);
  const [activeStories, setActiveStories] = useState([]);
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);
  const [externalFriendMsg, setExternalFriendMsg] = useState('');
  const [profileDrafts, setProfileDrafts] = useState({});
  const [profileErrs, setProfileErrs] = useState({});

  const storyAuthors = new Set(activeStories.map((s) => s.author?.username).filter(Boolean));

  useEffect(() => {
    api.get('/stories/feed').then((d) => setActiveStories(d.stories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openProfile = async (username) => {
    if (!username) return;
    setProfileModal({ loading: true, data: null, error: '' });
    try {
      const data = await api.get(`/users/${encodeURIComponent(username)}/profile`);
      setProfileModal({ loading: false, data, error: '' });
    } catch (err) {
      setProfileModal({ loading: false, data: null, error: err.message || 'Could not load profile.' });
    }
  };

  const loadFeed = async () => {
    try {
      const res = await api.get(`/feed?scope=${scope}&limit=15`);
      setFeed(res.posts || []);
      setHasMore(Boolean(res.hasMore));
      setPendingNewPosts([]);
    } catch (e) {
      console.error(e);
    } finally {
      setFeedLoaded(true);
    }
  };

  const loadMoreFeed = async () => {
    if (loadingMore || !hasMore || feed.length === 0) return;
    const cursor = feed[feed.length - 1]?.createdAt;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await api.get(`/feed?scope=${scope}&limit=15&before=${encodeURIComponent(cursor)}`);
      const existing = new Set(feed.map((p) => String(p._id)));
      const older = (res.posts || []).filter((p) => !existing.has(String(p._id)));
      setFeed((prev) => [...prev, ...older]);
      setHasMore(Boolean(res.hasMore));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { setFeedLoaded(false); loadFeed(); }, [scope]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMoreFeed();
    }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, feed.length, scope]);

  useEffect(() => {
    if (scope !== 'discover') { setPendingNewPosts([]); return; }
    const id = setInterval(async () => {
      try {
        const res = await api.get('/feed?scope=discover&limit=15');
        const currentIds = new Set(feed.map((p) => String(p._id)));
        const fresh = (res.posts || []).filter((p) => !currentIds.has(String(p._id)));
        if (fresh.length > 0) setPendingNewPosts(fresh);
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [scope, feed]);

  const handledJumpRef = useRef(0);
  useEffect(() => {
    if (!feedJump || feedJump.ts === handledJumpRef.current) return;
    handledJumpRef.current = feedJump.ts;
    if (feedJump.openUser) {
      if (profileModal?.data?.user?.username !== feedJump.openUser) openProfile(feedJump.openUser);
      return;
    }
    setProfileModal(null);
    setScope(feedJump.scope);
    setTimeout(() => document.getElementById('ff-feed-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }, [feedJump]);

  const patchPost = (postId, fn) => setFeed((prev) => prev.map((p) => (p._id === postId ? fn(p) : p)));

  const handleDeletePost = (postId) => {
    setConfirmModal({
      title: 'Delete Post?',
      body: 'This will permanently remove your post from FitFollow.',
      confirmLabel: 'Delete Post',
      onConfirm: async () => {
        setFeedErr('');
        try {
          await api.del(`/feed/${postId}`);
          setFeed((prev) => prev.filter((p) => p._id !== postId));
        } catch (err) {
          setFeedErr(err.message);
        }
      },
    });
  };

    if (profileModal) {
    return (
      <UserProfileView
        profileModal={profileModal}
        setProfileModal={setProfileModal}
        activeStories={activeStories}
        PostPhoto={PostPhoto}
        onOpenStories={onOpenStories}
        onReloadProfile={(uname) => { openProfile(uname); setPanelRefreshKey((k) => k + 1); }}
        onOpenChat={(pu) => { setProfileModal(null); setActiveChat(pu); }}
        onBack={() => {
          setProfileModal(null);
          setTimeout(() => document.getElementById('ff-find-friends')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        }}
        onBlockedOrReported={(_id, username, noticeMsg) => {
          setProfileModal(null);
          setFeed((prev) => prev.filter((p) => p.author?.username !== username));
          setPanelRefreshKey((k) => k + 1);
          if (noticeMsg) setExternalFriendMsg(noticeMsg);
        }}
      />
    );
  }

  return (
    <div className="stack">
      <PostComposer
        user={user}
        onOpenSettings={onOpenSettings}
        onPosted={() => (scope !== 'friends' ? setScope('friends') : loadFeed())}
      />

      <FriendsPanel
        onFeedChange={loadFeed}
        onMessage={setActiveChat}
        onConfirm={setConfirmModal}
        onSelectProfile={openProfile}
        storyAuthors={storyAuthors}
        refreshKey={panelRefreshKey}
        externalMsg={externalFriendMsg}
      />

      {/* FEED (FR-22): Home = me + friends, Discover = public posts from public accounts */}
      <div className="seg" role="tablist" aria-label="Feed">
        <button type="button" role="tab" aria-selected={scope === 'friends'} className={scope === 'friends' ? 'on' : ''} onClick={() => setScope('friends')}>Home</button>
        <button type="button" role="tab" aria-selected={scope === 'discover'} className={scope === 'discover' ? 'on' : ''} onClick={() => setScope('discover')}>Discover</button>
      </div>
      {feedErr && <div className="notice">{feedErr}</div>}
            <section id="ff-feed-section" className="stack">
        {pendingNewPosts.length > 0 && (
          <div style={{ position: 'sticky', top: 14, zIndex: 35, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn"
              style={{ boxShadow: '0 10px 26px rgba(20, 20, 31, 0.25)' }}
              onClick={() => {
                setFeed((prev) => {
                  const seen = new Set(prev.map((p) => String(p._id)));
                  return [...pendingNewPosts.filter((p) => !seen.has(String(p._id))), ...prev];
                });
                setPendingNewPosts([]);
                document.getElementById('ff-feed-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              ↑ See {pendingNewPosts.length} new {pendingNewPosts.length === 1 ? 'post' : 'posts'}
            </button>
          </div>
        )}

        {!feedLoaded ? (
          <div className="spinner" aria-label="Loading" />
        ) : feed.length === 0 ? (
          <div className="card empty">
            {scope === 'friends'
              ? 'Nothing here yet. Share a post, add friends above, or browse Discover.'
              : 'No public posts to discover yet.'}
          </div>
        ) : feed.map((p) => (
          <PostCard
            key={p._id}
            post={p}
            onDelete={handleDeletePost}
            onOpenProfile={openProfile}
            onCommentAdded={(id, c) => patchPost(id, (post) => ({ ...post, comments: [...(post.comments || []), c] }))}
            onCommentDeleted={(id, cid) => patchPost(id, (post) => ({ ...post, comments: (post.comments || []).filter((c) => c._id !== cid) }))}
          />
        ))}

        {hasMore && <div ref={sentinelRef} style={{ height: 24 }} aria-hidden="true" />}
        {loadingMore && <div className="spinner" aria-label="Loading more posts" />}
      </section>

      {confirmModal && (
        <ConfirmDialog
          modal={{
            ...confirmModal,
            onConfirm: () => { setConfirmModal(null); confirmModal.onConfirm(); },
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {activeChat && <ChatDialog friend={activeChat} onClose={() => setActiveChat(null)} />}

      {showBackToTop && (
        <button
          type="button"
          className="btn small dark-navy"
          onClick={() => {
            const el = document.getElementById('ff-find-friends');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          style={{
            position: 'fixed', right: 22, bottom: 92, zIndex: 45,
            borderRadius: 999, padding: '10px 18px',
            boxShadow: '0 10px 24px rgba(16, 21, 68, 0.25)', fontWeight: 700,
          }}
        >
          🪜 Take me back up
        </button>
      )}

    </div>
  );
}
