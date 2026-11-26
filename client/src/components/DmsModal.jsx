import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Avatar from './Avatar';

export default function DmsModal({ onClose }) {
  const [friends, setFriends] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [msgErr, setMsgErr] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ff_archived_dms') || '[]'); } catch { return []; }
  });

  const toggleArchive = (id) => {
    setArchivedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem('ff_archived_dms', JSON.stringify(next)); } catch {}
      return next;
    });
  };

    useEffect(() => {
    api.get('/friends').then((d) => {
      const list = d.friends || [];
      setFriends(list);
      const validIds = new Set(list.map((u) => u.id));
      setArchivedIds((prev) => {
        const cleaned = prev.filter((id) => validIds.has(id));
        try { localStorage.setItem('ff_archived_dms', JSON.stringify(cleaned)); } catch {}
        return cleaned;
      });
      const visible = list.filter((u) => !archivedIds.includes(u.id));
      if (visible.length > 0 && !activeChat) setActiveChat(visible.at(0));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeChat) return;
    let live = true;
    const load = () => api.get(`/messages/${activeChat.id}`).then((d) => live && setMessages(d.messages || [])).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => { live = false; clearInterval(id); };
  }, [activeChat]);

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

  const clearChat = async () => {
    if (!activeChat) return;
    if (!window.confirm(`Clear all messages with @${activeChat.username}? This cannot be undone.`)) return;
    await api.del(`/messages/${activeChat.id}`).catch(() => {});
    setMessages([]);
  };

  const blockUser = async () => {
    if (!activeChat) return;
    if (!window.confirm(`Block @${activeChat.username}? You will no longer see each other's posts or messages.`)) return;
    await api.post(`/friends/${activeChat.id}/block`).catch(() => {});
    const remaining = friends.filter((u) => u.id !== activeChat.id);
    setFriends(remaining);
    setActiveChat(remaining.at(0) || null);
    setMessages([]);
  };

  const displayedFriends = friends.filter((u) =>
    showArchived ? archivedIds.includes(u.id) : !archivedIds.includes(u.id)
  );

  return (
    <div className="stack">
      <button type="button" className="settings-back" onClick={onClose}>← Back</button>

      <section className="card stack">
        <div className="row spread">
          <h2 className="card-title" style={{ marginBottom: 0 }}>Direct Messages</h2>
          <div className="row" style={{ gap: 8 }}>
            {archivedIds.length > 0 && (
              <button type="button" className="btn small ghost" onClick={() => setShowArchived((s) => !s)}>
                {showArchived ? 'Active Chats' : `Archived (${archivedIds.length})`}
              </button>
            )}
            <span className="chip accent">{friends.length} {friends.length === 1 ? 'friend' : 'friends'}</span>
          </div>
        </div>

        {friends.length === 0 ? (
          <div className="empty">Add a friend in the Friends tab first to start messaging!</div>
                  ) : (
          <div className="dms-layout">
            <div className="dms-sidebar stack">
              {displayedFriends.length === 0 ? (
                <p className="small muted">{showArchived ? 'No archived chats.' : 'All chats archived.'}</p>
              ) : displayedFriends.map((u) => {
                const selected = activeChat?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setActiveChat(u); setMsgErr(''); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 16,
                      border: selected ? '2px solid var(--accent)' : '1px solid rgba(20, 20, 31, 0.1)',
                      background: selected ? 'var(--accent-soft)' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Avatar user={u} size={46} />
                    <div className="person-names grow">
                      <div className="name">{u.displayName || u.username}</div>
                      <div className="handle">@{u.username}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {activeChat && (
              <div className="stack" style={{ gap: 14 }}>
                <div className="row spread" style={{ paddingBottom: 10, borderBottom: '1.5px solid rgba(20, 20, 31, 0.08)' }}>
                  <div className="row" style={{ gap: 12 }}>
                    <Avatar user={activeChat} size={48} />
                    <div className="person-names">
                      <div className="name">{activeChat.displayName || activeChat.username}</div>
                      <div className="handle">@{activeChat.username}</div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn small ghost" onClick={() => toggleArchive(activeChat.id)}>
                      {archivedIds.includes(activeChat.id) ? 'Unarchive' : 'Archive'}
                    </button>
                    <button type="button" className="btn small ghost" onClick={clearChat}>
                      Clear
                    </button>
                    <button type="button" className="btn small ghost" style={{ color: '#b42318' }} onClick={blockUser}>
                      Block
                    </button>
                  </div>
                </div>

                <div style={{ minHeight: 320, maxHeight: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: 'rgba(247, 244, 255, 0.75)', borderRadius: 18, border: '1px solid var(--line)' }}>
                  {messages.length === 0 && <p className="empty">No messages yet. Say hi to {activeChat.displayName || activeChat.username}!</p>}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.mine ? 'flex-end' : 'flex-start',
                        background: m.mine ? 'var(--accent)' : '#ffffff',
                        color: m.mine ? '#ffffff' : 'var(--ink-strong)',
                        padding: '12px 18px',
                        borderRadius: 20,
                        maxWidth: '75%',
                        fontSize: '1.08rem',
                        fontWeight: 600,
                        boxShadow: '0 3px 10px rgba(0,0,0,0.06)',
                      }}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>

                {msgErr && <div className="notice">{msgErr}</div>}

                <form onSubmit={sendDm} className="row" style={{ gap: 10 }}>
                  <input
                    type="text"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder={`Message @${activeChat.username}...`}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn">Send</button>
                </form>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
