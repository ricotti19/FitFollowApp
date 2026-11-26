import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Avatar from '../components/Avatar';

export function StoryAvatar({ u, size = 48, hasStory = false, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, cursor: onClick ? 'pointer' : 'inherit' }}
      title={hasStory ? 'Active 24h Story' : undefined}
    >
      <Avatar user={u} size={size} />
      {hasStory && (
        <span
          aria-label="Active story"
          style={{
            position: 'absolute', right: -1, bottom: -1,
            width: Math.max(11, Math.round(size * 0.25)),
            height: Math.max(11, Math.round(size * 0.25)),
            borderRadius: '50%', background: '#e14b63', border: '2px solid #ffffff',
            boxShadow: '0 0 0 0 rgba(225, 75, 99, 0.75)',
            animation: 'ffStoryPulse 1.4s infinite',
          }}
        />
      )}
    </span>
  );
}

function Person({ u, onSelect, storyAuthors }) {
  return (
    <div
      className="person"
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect?.(u.username)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.(u.username)}
    >
      <StoryAvatar u={u} size={48} hasStory={storyAuthors?.has(u?.username)} />
      <div className="person-names">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="name">{u.displayName || u.username}</span>
          <span className={`chip ${u.isPublic ? 'accent' : ''}`}>{u.isPublic ? 'Public account' : 'Private account'}</span>
          {u.fitnessQuirk && <span className="chip ok" style={{ color: '#14141f' }}>⚡ {u.fitnessQuirk}</span>}
        </div>
        <div className="handle">@{u.username}</div>
        {u.bio && <div className="small muted" style={{ marginTop: 2 }}>{u.bio}</div>}
      </div>
    </div>
  );
}


// Friend requests + Find Friends (search, suggestions, friend list). Owns all friend/search state.
// onFeedChange: refresh the feed after a friend action (visibility changes).
// onMessage(user): open a DM. onConfirm(modal): ask the parent to show a confirm dialog.

export default function FriendsPanel({ onFeedChange, onMessage, onConfirm, onSelectProfile, storyAuthors, refreshKey = 0, externalMsg = '' }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [searched, setSearched] = useState(false);
  const [friendMsg, setFriendMsg] = useState('');  
  const [searchQ, setSearchQ] = useState('');
  const [searchMode, setSearchMode] = useState('name'); // 'name' | 'quirk'
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

    useEffect(() => {
    loadFriends();
    const id = setInterval(loadFriends, 8000);
    return () => clearInterval(id);
  }, [refreshKey]);

  // Load suggested people immediately on mount
  useEffect(() => {
    api.get('/friends/suggested').then((d) => setSuggested(d.users || [])).catch(() => {});
  }, [refreshKey]);

  // Live debounced typeahead search (250ms after typing 2+ chars)
  useEffect(() => {
    const clean = searchQ.trim().replace(/^@/, '');
    if (clean.length < 2) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/friends/search?q=${encodeURIComponent(clean)}&mode=${searchMode}`)
        .then((d) => { setSearchResults(d.users || []); setSearched(true); })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQ, searchMode]);

  const handleSearch = async (e) => {
    e.preventDefault();
    const q = searchQ.trim();
    setFriendMsg('');
    if (q.length < 2) { setSearchResults([]); setSearched(false); setFriendMsg('Type at least 2 characters.'); return; }
    try {
      const res = await api.get(`/friends/search?q=${encodeURIComponent(q)}&mode=${searchMode}`);
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
                <Person u={u} onSelect={onSelectProfile} storyAuthors={storyAuthors} />

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
      <section id="ff-find-friends" className="card stack">
        <div className="row spread wrap" style={{ gap: 8 }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Find Friends</h2>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`btn small ${searchMode === 'name' ? '' : 'ghost'}`}
              onClick={() => setSearchMode('name')}
            >
              Name / @handle
            </button>
            <button
              type="button"
              className={`btn small ${searchMode === 'quirk' ? '' : 'ghost'}`}
              onClick={() => setSearchMode('quirk')}
            >
              ⚡ Search by Quirk
            </button>
            <span className="chip">{friends.length} connected</span>
          </div>
        </div>
                <form onSubmit={handleSearch} className="row">
          <input
            placeholder={searchMode === 'quirk' ? 'Search by fitness quirk, bio, or lift PR (e.g. "love to dance", "bench", "10k")...' : 'Search by name or username...'}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="grow"
          />
          <button type="submit" className="btn">Search</button>
        </form>

        {searchMode === 'quirk' && (
          <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
            <span className="small muted">Try quirk:</span>
            {(() => {
              const POOL = [
                'bharatanatyam', 'kathak', 'kuchipudi', 'odissi', 'garba', 'bhangra', 'salsa', 'bachata', 'hip-hop', 'ballet barre',
                'contemporary dance', 'zumba', 'capoeira', 'karate', 'taekwondo', 'muay thai', 'jiu-jitsu', 'boxing', 'kickboxing', 'judo',
                'lat pulldowns', 'bench press', 'barbell squat', 'deadlift', 'overhead press', 'incline dumbbell', 'cable rows', 'pull-ups', 'dips', 'hip thrusts',
                'romanian deadlift', 'bulgarian split squats', 'leg press', 'calf raises', 'bicep curls', 'tricep pushdowns', 'lateral raises', 'face pulls', 'shrugs', 'farmers carry',
                'vinyasa yoga', 'hot yoga', 'ashtanga', 'yin yoga', 'reformer pilates', 'mat pilates', 'breathwork', 'mobility flow', 'foam rolling', 'stretching',
                'half-marathon', 'marathon', '5k tempo', '10k steps', 'sprint intervals', 'incline treadmill', 'stairmaster', 'rowing 2k', 'spin class', 'road cycling',
                'swimming laps', 'triathlon', 'bouldering', 'rock climbing', 'hyrox', 'crossfit', 'kettlebell swings', 'turkish get-ups', 'battle ropes', 'box jumps',
                'basketball', 'tennis', 'pickleball', 'soccer', 'volleyball', 'badminton', 'squash', 'flag football', 'ultimate frisbee', 'golf',
                '5am crew', 'lunch break lifts', 'evening grinder', 'weekend warrior', 'iced coffee', 'protein meal prep', 'plant-based', 'macro tracking', 'sauna', 'ice bath',
              ];
              const start = (refreshKey * 7 + searchQ.length * 13) % (POOL.length - 8);
              return POOL.slice(start, start + 8).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="chip accent"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => setSearchQ(tag)}
                >
                  ⚡ {tag}
                </button>
              ));
            })()}
          </div>
        )}

        {(friendMsg || externalMsg) && <div className="notice">{friendMsg || externalMsg}</div>}

        {searched && searchResults.length === 0 && !friendMsg && <div className="small muted">No users found for “{searchQ.trim()}”.</div>}
        {searchResults.length > 0 && (
          <div className="list">
            {searchResults.map((u) => (
              <div key={u.id} className="item spread">
                <Person u={u} onSelect={onSelectProfile} storyAuthors={storyAuthors} />

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
                    <Person u={u} onSelect={onSelectProfile} storyAuthors={storyAuthors} />

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
                  <Person u={u} onSelect={onSelectProfile} storyAuthors={storyAuthors} />

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
        {outgoing.length > 0 && (
          <>
            <div className="small muted">Waiting on</div>
            <div className="list">
              {outgoing.map((u) => (
                <div key={u.id} className="item spread">
                  <Person u={u} onSelect={onSelectProfile} storyAuthors={storyAuthors} />
                  <button type="button" className="btn small ghost" onClick={() => removeRelation(u.id)}>
                    Requested · Cancel
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
