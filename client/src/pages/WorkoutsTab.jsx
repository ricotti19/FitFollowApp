import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';

export default function WorkoutsTab() {
  const [sessions, setSessions] = useState([]);
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState({ exercise: '', weight: '', reps: '', sets: '' });
  const [prBanner, setPrBanner] = useState('');

  const loadWorkouts = async () => {
    try {
      const [sRes, pRes] = await Promise.all([api.get('/sessions'), api.get('/presets')]);
      setSessions(sRes.sessions || sRes || []);
      setPresets(pRes.presets || pRes || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadWorkouts(); }, []);

  const handleLogSet = async (e) => {
    e.preventDefault();
    setPrBanner('');
    const res = await api.post('/sessions', {
      exercise: form.exercise,
      weight: Number(form.weight),
      reps: Number(form.reps),
      sets: Number(form.sets),
    });
    if (res.isPR || res.personalRecord) {
      setPrBanner(`New Personal Record on ${form.exercise}: ${form.weight} lb!`);
    }
    setForm({ exercise: '', weight: '', reps: '', sets: '' });
    loadWorkouts();
  };

  const startPreset = async (presetId) => {
    await api.post(`/presets/${presetId}/start`);
    loadWorkouts();
  };

  return (
    <div className="stack">
      {prBanner && <div className="notice ok">🏆 {prBanner}</div>}

      {/* LOG WORKOUT SET (FR-5, FR-7) */}
      <form onSubmit={handleLogSet} className="card stack">
        <h2 className="card-title">Log Workout</h2>
        <input placeholder="Exercise (e.g., Bench Press, Squat)" value={form.exercise} onChange={(e) => setForm({ ...form, exercise: e.target.value })} required />
        <div className="row wrap">
          <input type="number" min="0" step="0.5" placeholder="Weight (lb)" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} required style={{ flex: '1 1 90px' }} />
          <input type="number" min="0" placeholder="Reps" value={form.reps} onChange={(e) => setForm({ ...form, reps: e.target.value })} required style={{ flex: '1 1 90px' }} />
          <input type="number" min="0" placeholder="Sets" value={form.sets} onChange={(e) => setForm({ ...form, sets: e.target.value })} required style={{ flex: '1 1 90px' }} />
        </div>
        <button type="submit" className="btn block">Save set</button>
      </form>

      {/* SAVED PRESETS (FR-30, FR-31) */}
      {presets.length > 0 && (
        <section className="card stack">
          <h2 className="card-title">Saved Presets</h2>
          <div className="list">
            {presets.map((p) => (
              <div key={p._id || p.id} className="item spread">
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <button type="button" onClick={() => startPreset(p._id || p.id)} className="btn small">Start</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* WORKOUT HISTORY (FR-6) */}
      <section className="card stack">
        <h2 className="card-title">History</h2>
        {sessions.length === 0 ? (
          <p className="empty">No workouts logged yet.</p>
        ) : (
          <div className="list">
            {sessions.map((s, idx) => (
              <div key={s._id || idx} className="item spread">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{s.exercise || s.name || 'Workout Session'}</div>
                  <div className="small muted">{s.weight ? `${s.weight} lb × ${s.reps} reps × ${s.sets} sets` : 'Session logged'}</div>
                </div>
                <span className="small muted">{s.createdAt ? timeAgo(s.createdAt) : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
