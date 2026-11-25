import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Avatar from '../components/Avatar';

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

// Friend requests + Find Friends (search, suggestions, friend list). Owns all friend/search state.
// onFeedChange: refresh the feed after a friend action (visibility changes).
// onMessage(user): open a DM. onConfirm(modal): ask the parent to show a confirm dialog.

export default function FriendsPanel({ onFeedChange, onMessage, onConfirm }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [searched, setSearched] = useState(false);
  const [friendMsg, setFriendMsg] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [showSuggested, setShowSuggested] = useState(true);

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

  useEffect(() => { loadFriends(); }, []);

  // Load suggested people immediately on mount
  useEffect(() => {
    api.get('/friends/suggested').then((d) => setSuggested(d.users || [])).catch(() => {});
  }, []);

  // Live debounced typeahead search (250ms after typing 2+ chars)
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
      await Promise.all([onFeedChange(), loadFriends()]);
    } catch (err) {
      setFriendMsg(err.message);
    }
  };
  const sendRequest = (id) => friendAction(id, () => api.post(`/friends/${id}/send`));
  const acceptRequest = (id) => friendAction(id, () => api.post(`/friends/${id}/accept`), 'FRIENDS');
  const removeRelation = (id) => friendAction(id, () => api.del(`/friends/${id}`), 'NONE');

  const confirmRemove = (u) =>
    onConfirm({
      title: `Remove @${u.username}?`,
      body: 'They will no longer see your Friends-only posts.',
      confirmLabel: 'Remove Friend',
      onConfirm: () => removeRelation(u.id),
    });

  return (
    <>
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
                    <button type="button" className="btn small dark-navy" onClick={() => onMessage(u)}>
                      Message
                    </button>
                    <button type="button" className="btn small ghost" onClick={() => confirmRemove(u)}>
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
    </>
  );
}
