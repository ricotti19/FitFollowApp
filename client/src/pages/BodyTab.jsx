import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function BodyTab() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ weight: '', waist: '', chest: '', hip: '', arm: '', thigh: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/body');
      setEntries(res.entries || res || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = (k) => (e) => {
    setError('');
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const w = Number(form.weight);
    if (!form.weight.trim() || !Number.isFinite(w) || w < 50 || w > 700) {
      setError('Body weight must be between 50 and 700 lbs.');
      return;
    }

    const measurements = ['waist', 'chest', 'hip', 'arm', 'thigh'];
    const payload = { weight: Math.round(w * 10) / 10 };

    for (const key of measurements) {
      const raw = String(form[key] || '').trim();
      if (!raw) continue;
      const val = Number(raw);
      if (!Number.isFinite(val) || val < 5 || val > 120) {
        setError(`${key[0].toUpperCase() + key.slice(1)} measurement must be between 5 and 120 inches.`);
        return;
      }
      payload[key] = Math.round(val * 10) / 10;
    }

    setSaving(true);
    try {
      await api.post('/body', payload);
      setForm({ weight: '', waist: '', chest: '', hip: '', arm: '', thigh: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not save body metrics.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <form onSubmit={handleSubmit} className="card stack" noValidate>
        <h2 className="card-title">Body Metrics</h2>
        <p className="small muted">Track your weight and measurements over time.</p>

        <input
          type="number"
          step="0.1"
          min="50"
          max="700"
          placeholder="Weight (lbs)"
          value={form.weight}
          onChange={update('weight')}
        />

        <div className="row wrap">
          <input type="number" step="0.1" min="5" max="120" placeholder="Waist (in)" value={form.waist} onChange={update('waist')} style={{ flex: '1 1 80px' }} />
          <input type="number" step="0.1" min="5" max="120" placeholder="Chest (in)" value={form.chest} onChange={update('chest')} style={{ flex: '1 1 80px' }} />
          <input type="number" step="0.1" min="5" max="120" placeholder="Hip (in)" value={form.hip} onChange={update('hip')} style={{ flex: '1 1 80px' }} />
          <input type="number" step="0.1" min="5" max="120" placeholder="Arm (in)" value={form.arm} onChange={update('arm')} style={{ flex: '1 1 80px' }} />
          <input type="number" step="0.1" min="5" max="120" placeholder="Thigh (in)" value={form.thigh} onChange={update('thigh')} style={{ flex: '1 1 80px' }} />
        </div>

        {error && (
          <div className="small" role="alert" style={{ color: '#b91c1c', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'Saving...' : 'Save entry'}
        </button>
      </form>

      <section className="card stack">
        <h2 className="card-title">Weight History</h2>
        {entries.length === 0 ? (
          <div className="small muted">No entries yet.</div>
        ) : (
          <div className="list">
            {entries.map((entry, idx) => (
              <div key={entry._id || idx} className="item spread">
                <div>
                  <strong>{entry.weight} lb</strong>
                  <div className="small muted">
                    {[
                      entry.waist && `Waist ${entry.waist}"`,
                      entry.chest && `Chest ${entry.chest}"`,
                      entry.hip && `Hip ${entry.hip}"`,
                      entry.arm && `Arm ${entry.arm}"`,
                      entry.thigh && `Thigh ${entry.thigh}"`,
                    ].filter(Boolean).join(' • ')}
                  </div>
                </div>
                <span className="small muted">{entry.day || ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
