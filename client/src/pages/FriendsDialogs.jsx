import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Shared overlay + card used by every Friends-tab modal.
function ModalShell({ maxWidth = 380, padding = '22px 24px', onClose, children }) {
  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
          width: '100%', maxWidth, padding,
          background: '#fff7e0', color: '#101544',
          border: '2px solid #101544', borderRadius: 20,
          boxShadow: '0 18px 40px rgba(16, 21, 68, 0.25)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// modal = { title, body, confirmLabel, onConfirm }
export function ConfirmDialog({ modal, onCancel }) {
  return (
    <ModalShell onClose={onCancel}>
      <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#101544' }}>
        {modal.title}
      </h3>
      <p className="small muted" style={{ margin: '0 0 20px', lineHeight: 1.45 }}>
        {modal.body}
      </p>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button
          type="button"
          className="btn small ghost"
          style={{ color: '#101544', fontWeight: 700 }}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn small"
          style={{ background: '#101544', color: '#ffffff', fontWeight: 700 }}
          onClick={modal.onConfirm}
        >
          {modal.confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

// DM thread with one friend, owns its messages and polls every 3s while mounted.
export function ChatDialog({ friend, onClose }) {
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [msgErr, setMsgErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadChat = () =>
      api.get(`/messages/${friend.id}`)
        .then((d) => { if (!cancelled) setMessages(d.messages || []); })
        .catch(() => {});
    loadChat();
    const id = setInterval(loadChat, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [friend.id]);

  const sendDm = async (e) => {
    e.preventDefault();
    const text = msgText.trim();
    if (!text) return;
    setMsgErr('');
    try {
      const d = await api.post(`/messages/${friend.id}`, { text });
      setMessages((prev) => [...prev, d.message]);
      setMsgText('');
    } catch (err) {
      setMsgErr(err.message || 'Could not send message.');
    }
  };

  return (
    <ModalShell maxWidth={420} padding="20px 22px" onClose={onClose}>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <strong>Chat with {friend.displayName || friend.username} (@{friend.username})</strong>
        <button type="button" className="btn small ghost" onClick={onClose}>Close</button>
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
    </ModalShell>
  );
}
