import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Avatar from '../components/Avatar';

function ModalShell({ maxWidth = 400, padding = '24px 26px', onClose, children }) {
  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(20, 20, 31, 0.48)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth, padding,
          background: 'rgba(255, 255, 255, 0.97)',
          color: '#14141f',
          border: '1px solid rgba(20, 20, 31, 0.14)',
          borderRadius: 26,
          boxShadow: '0 24px 60px rgba(20, 20, 31, 0.24)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ modal, onCancel }) {
  return (
    <ModalShell maxWidth={400} onClose={onCancel}>
      <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800 }}>{modal.title}</h3>
      <p className="small muted" style={{ margin: '0 0 20px', lineHeight: 1.45 }}>{modal.body}</p>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn small ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn small dark-navy" onClick={modal.onConfirm}>{modal.confirmLabel}</button>
      </div>
    </ModalShell>
  );
}

export function ReportDialog({ target, onClose, onReported }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api.post('/reports', {
        targetUserId: target.userId,
        targetUsername: target.username,
        reason,
      });
      onReported(target);
    } catch (err) {
      setBusy(false);
      setMsg(err.message || 'Could not submit report.');
    }
  };

  return (
    <ModalShell maxWidth={440} onClose={onClose}>
      <div className="stack">
        <div className="row spread">
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Report @{target.username}</h3>
          <button type="button" className="btn small ghost" onClick={onClose}>Close</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Why are you reporting this account? Your report will be sent directly to the Moderator Queue.
        </p>
        <textarea
          rows={3}
          placeholder="e.g., Off-topic spam, inappropriate photo, or harassing comments..."
          value={reason}
          onChange={(e) => { setReason(e.target.value); setMsg(''); }}
        />
        {msg && <div className="notice">{msg}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn small ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn small" disabled={busy} onClick={submit}>
            {busy ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function ChatDialog({ friend, onClose }) {
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [msgErr, setMsgErr] = useState('');
  const [reportingMsg, setReportingMsg] = useState(null);
  const [reportNotice, setReportNotice] = useState('');
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
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, text, mine: true }]);
    setMsgText('');
    try {
      const d = await api.post(`/messages/${friend.id}`, { text });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? d.message : m)));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMsgText(text);
      setMsgErr(err.message || 'Could not send message.');
    }
  };

  return (
    <ModalShell maxWidth={640} padding="24px 28px" onClose={onClose}>
      <div className="row spread" style={{ paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid rgba(20, 20, 31, 0.08)' }}>
        <div className="row" style={{ gap: 12 }}>
          <Avatar user={friend} size={44} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.08rem' }}>{friend.displayName || friend.username}</div>
            <div className="handle">@{friend.username}</div>
          </div>
        </div>
        <button type="button" className="btn small ghost" onClick={onClose}>Close</button>
      </div>

      <div
        style={{
          height: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
          padding: 16, marginBottom: 16, background: 'rgba(247, 245, 252, 0.75)',
          borderRadius: 20, border: '1px solid rgba(20, 20, 31, 0.06)',
        }}
      >
        {messages.length === 0 && <p className="small muted" style={{ margin: 'auto' }}>No messages yet. Say hi!</p>}
                {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.mine ? 'flex-end' : 'flex-start',
              display: 'flex', alignItems: 'center', gap: 6, maxWidth: '80%',
            }}
          >
            <div
              style={{
                background: m.mine ? '#e14b63' : '#ffffff',
                color: m.mine ? '#ffffff' : '#14141f',
                padding: '10px 16px', borderRadius: 999,
                fontSize: '0.95rem', fontWeight: 500,
                boxShadow: m.mine ? '0 4px 12px rgba(225, 75, 99, 0.25)' : '0 2px 8px rgba(20, 20, 31, 0.06)',
              }}
            >
              {m.text}
            </div>
            {!m.mine && (
              <button
                type="button"
                className="btn small ghost"
                title="Report this message"
                style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#b42318', flexShrink: 0 }}
                onClick={() => setReportingMsg(m)}
              >
                🚩 Report
              </button>
            )}
          </div>
        ))}
      </div>

      {reportNotice && <div className="notice ok" style={{ marginBottom: 10 }}>{reportNotice}</div>}
      {reportingMsg && (
        <ReportDialog
          target={{ userId: friend.id, username: `${friend.username} (message: "${reportingMsg.text.slice(0, 60)}")` }}
          onClose={() => setReportingMsg(null)}
          onReported={() => {
            setReportingMsg(null);
            setReportNotice(`Reported message from @${friend.username} to the Moderator Queue.`);
          }}
        />
      )}

      {msgErr && <p className="small" style={{ color: '#b42318', marginBottom: 10 }}>{msgErr}</p>}
      <form onSubmit={sendDm} className="row" style={{ gap: 10 }}>
        <input
          type="text"
          value={msgText}
          onChange={(e) => setMsgText(e.target.value)}
          placeholder={`Message @${friend.username}...`}
          style={{ flex: 1, borderRadius: 999, padding: '12px 18px' }}
        />
        <button type="submit" className="btn" style={{ background: '#e14b63', color: '#ffffff', borderRadius: 999, padding: '12px 24px', fontWeight: 700 }}>
          Send
        </button>
      </form>
    </ModalShell>
  );
}
