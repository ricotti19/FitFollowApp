import { useState } from 'react';
import { api } from '../lib/api';
import { timeAgo, AUDIENCE_LABEL } from '../lib/format';
import Avatar from '../components/Avatar';
import { StoryAvatar } from './FriendsPanel';
import { ReportDialog } from './FriendsDialogs';

export default function UserProfileView({
  profileModal,
  setProfileModal,
  activeStories,
  PostPhoto,
  onOpenStories,
  onReloadProfile,
  onOpenChat,
  onBack,
  onBlockedOrReported,
  onOpenSettings,
}) {

  const [reportModal, setReportModal] = useState(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [errs, setErrs] = useState({});
  const pu = profileModal.data?.user;
  const state = profileModal.data?.state;
  const canView = profileModal.data?.canView;
  const userPosts = profileModal.data?.posts || [];
  const userStories = pu ? activeStories.filter((s) => s.author?.username === pu.username) : [];

  const submitComment = async (postId) => {
    const text = (drafts[postId] || '').trim();
    if (!text) return;
    setErrs((p) => ({ ...p, [postId]: '' }));
    try {
      const d = await api.post(`/feed/${postId}/comments`, { text });
      setProfileModal((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          posts: prev.data.posts.map((x) =>
            x._id === postId ? { ...x, comments: [...(x.comments || []), d.comment] } : x
          ),
        },
      }));
      setDrafts((p) => ({ ...p, [postId]: '' }));
    } catch (err) {
      setErrs((p) => ({ ...p, [postId]: err.message || 'Could not post comment.' }));
    }
  };

  return (
    <div className="stack">
      <button type="button" className="settings-back" onClick={onBack}>
        {state === 'SELF' ? '← Back' : '← Back to Friends'}
      </button>

      {profileModal.loading ? (
        <div className="spinner" />
      ) : profileModal.error ? (
        <div className="notice">{profileModal.error}</div>
      ) : pu && (
        <>
          <section className="card stack">
            <div className="row spread wrap" style={{ gap: 16 }}>
                            <div className="row" style={{ gap: 18 }}>
                <StoryAvatar
                  u={pu}
                  size={84}
                  hasStory={userStories.length > 0}
                  onClick={userStories.length > 0 ? () => onOpenStories?.(pu.username) : undefined}
                />
                <div className="person-names">
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <h1 className="card-title" style={{ marginBottom: 0 }}>{pu.displayName}</h1>
                    <span className={`chip ${pu.isPublic ? 'accent' : ''}`}>{pu.isPublic ? 'Public account' : 'Private account'}</span>
                    {pu.fitnessQuirk && <span className="chip ok" style={{ color: '#14141f' }}>⚡ {pu.fitnessQuirk}</span>}
                  </div>
                  <div className="handle" style={{ marginTop: 4 }}>@{pu.username}</div>
                </div>
              </div>

              <div className="row" style={{ gap: 8 }}>
                {state === 'NONE' && (
                  <button type="button" className="btn small" onClick={async () => { await api.post(`/friends/${pu.id}/send`); onReloadProfile(pu.username); }}>
                    Add Friend
                  </button>
                )}
                {state === 'REQUEST_SENT' && (
                  <button type="button" className="btn small ghost" onClick={async () => { await api.del(`/friends/${pu.id}`); onReloadProfile(pu.username); }}>
                    Requested
                  </button>
                )}
                {state === 'REQUEST_RECEIVED' && (
                  <button type="button" className="btn small" onClick={async () => { await api.post(`/friends/${pu.id}/accept`); onReloadProfile(pu.username); }}>
                    Accept Request
                  </button>
                )}
                {state === 'FRIENDS' && (
                  <>
                    <button type="button" className="btn small" onClick={() => onOpenChat(pu)}>Message</button>
                      <button
                      type="button"
                      className="btn small ghost"
                      style={{ color: '#b42318' }}
                      onClick={() => setConfirmBlock(true)}
                    >
                      Block
                    </button>

                  </>
                )}
                                {state === 'SELF' && onOpenSettings && (
                  <button type="button" className="btn small ghost" onClick={onOpenSettings}>
                    Edit Profile
                  </button>
                )}
                {state !== 'SELF' && (
                  <button
                    type="button"
                    className="btn small ghost"
                    style={{ color: '#b42318' }}
                    onClick={() => setReportModal({ userId: pu.id, username: pu.username })}
                  >
                    Report
                  </button>
                )}
              </div>
            </div>

            {canView && (
              <div style={{ padding: '14px 18px', background: 'rgba(247, 244, 255, 0.85)', borderRadius: 16, border: '1px solid var(--line)' }}>
                <div className="small muted" style={{ marginBottom: 4 }}>Fitness Quirk / Bio</div>
                <div style={{ fontSize: '1.08rem', fontWeight: 600 }}>{pu.bio || 'Chasing daily PRs & consistency 💪'}</div>
              </div>
            )}
          </section>
          {canView && userStories.length > 0 && (
            <section className="stack">
              <h2 className="card-title" style={{ paddingLeft: 4 }}>Active 24h Stories</h2>
              {userStories.map((st) => (
                <article key={st.id} className="post" style={{ borderColor: 'rgba(225, 75, 99, 0.35)' }}>
                  <div className="post-head">
                    <StoryAvatar u={pu} size={42} hasStory />
                    <div className="grow person-names">
                      <div className="name">{pu.displayName} <span className="chip accent" style={{ marginLeft: 6 }}>24h Story</span></div>
                      <div className="handle">@{pu.username} • {st.createdAt ? timeAgo(st.createdAt) : 'Active'}</div>
                    </div>
                  </div>
                  {st.text && <div className="post-text">{st.text}</div>}
                  {st.photoUrl && <PostPhoto path={st.photoUrl} />}
                </article>
              ))}
            </section>
          )}

          <section className="stack">
            <h2 className="card-title" style={{ paddingLeft: 4 }}>Recent Activity</h2>
            {!canView ? (
              <div className="card empty" style={{ textAlign: 'center', padding: '40px 20px' }}>
                🔒 This person seems to be working out on their own for now
              </div>
            ) : userPosts.length === 0 ? (
              <div className="card empty">No posts shared yet.</div>
                          ) : userPosts.map((post) => (
              <article key={post._id} className="post">
                <div className="post-head">
                  <Avatar user={pu} size={46} />
                  <div className="grow person-names">
                    <div className="name">{pu.displayName}</div>
                    <div className="handle">@{pu.username} • {AUDIENCE_LABEL[post.audience] || post.audience}{post.createdAt ? ` • ${timeAgo(post.createdAt)}` : ''}</div>
                  </div>
                  {state === 'SELF' && (
                    <button
                      type="button"
                      className="btn small dark-navy"
                      onClick={async () => {
                        await api.del(`/feed/${post._id}`).catch(() => {});
                        setProfileModal((prev) => ({
                          ...prev,
                          data: {
                            ...prev.data,
                            posts: (prev.data?.posts || []).filter((x) => x._id !== post._id),
                          },
                        }));
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                {post.text && <div className="post-text">{post.text}</div>}
                {post.photoUrl && <PostPhoto path={post.photoUrl} />}
                <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(16, 21, 68, 0.08)' }}>
                  {(post.comments || []).map((c) => (
                    <div key={c._id} className="row" style={{ justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 6 }}>
                      <span><strong>@{c.author?.username}</strong> {c.text}</span>
                      {c.mine && (
                        <button
                          type="button"
                          className="btn small ghost"
                          style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          onClick={async () => {
                            await api.del(`/feed/${post._id}/comments/${c._id}`).catch(() => {});
                            setProfileModal((prev) => ({
                              ...prev,
                              data: {
                                ...prev.data,
                                posts: prev.data.posts.map((x) => (x._id === post._id ? { ...x, comments: (x.comments || []).filter((cm) => cm._id !== c._id) } : x)),
                              },
                            }));
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <input
                      type="text"
                      placeholder="Add a fitness comment..."
                      value={drafts[post._id] || ''}
                      onChange={(e) => setDrafts((p) => ({ ...p, [post._id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitComment(post._id); } }}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.88rem' }}
                    />
                    <button type="button" className="btn small dark-navy" onClick={() => submitComment(post._id)}>Post</button>
                  </div>
                  {errs[post._id] && <div className="small" style={{ color: '#b42318', marginTop: 4 }}>{errs[post._id]}</div>}
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {confirmBlock && pu && (
        <div className="overlay" role="dialog" aria-modal="true" onClick={() => setConfirmBlock(false)}>
          <div className="sheet stack" style={{ maxWidth: 440, background: 'rgba(255, 255, 255, 0.97)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title" style={{ marginBottom: 0 }}>Block @{pu.username}?</h3>
            <p className="muted" style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 }}>
              You and @{pu.username} will no longer see each other&apos;s posts, stories, or messages.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button type="button" className="btn small ghost" onClick={() => setConfirmBlock(false)}>Cancel</button>
              <button
                type="button"
                className="btn small danger"
                onClick={async () => {
                  setConfirmBlock(false);
                  await api.post(`/friends/${pu.id}/block`).catch(() => {});
                  onBlockedOrReported(pu.id, pu.username, '');
                }}
              >
                Yes, block
              </button>
            </div>
          </div>
        </div>
      )}

      {reportModal && (
        <ReportDialog
          target={reportModal}
          onClose={() => setReportModal(null)}
          onReported={(t) => {
            setReportModal(null);
            onBlockedOrReported(t.userId, t.username, `Reported and hid @${t.username}. Report sent to the Moderator Queue.`);
          }}
        />
      )}
    </div>
  );
}
