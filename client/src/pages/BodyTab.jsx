import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function BodyTab() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ weight: '', waist: '', chest: '', hip: '', arm: '', thigh: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [chartMetric, setChartMetric] = useState('weight'); // 'weight' | 'waist' | 'chest' | 'hip' | 'arm' | 'thigh'

  const deleteEntry = async (id) => {
    if (!id) return;
    try {
      await api.del(`/body/${id}`);
      await load();
    } catch (err) {
      setError(err.message || 'Could not delete entry.');
    }
  };

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
     <div className="row spread">
       <h2 className="card-title" style={{ marginBottom: 0 }}>Body Trend &amp; History</h2>
       {entries.length >= 2 && (
         <select
           value={chartMetric}
           onChange={(e) => setChartMetric(e.target.value)}
           aria-label="Select trend metric"
           style={{ width: 'auto', minWidth: 140 }}
         >
           <option value="weight">Weight (lb)</option>
           <option value="waist">Waist (in)</option>
           <option value="chest">Chest (in)</option>
           <option value="hip">Hip (in)</option>
           <option value="arm">Arm (in)</option>
           <option value="thigh">Thigh (in)</option>
         </select>
       )}
     </div>

     {/* Progress Summary Strip */}
     {entries.length >= 2 && (() => {
       const latest = Number(entries[0]?.weight);
       const start = Number(entries[entries.length - 1]?.weight);
       const diff = Math.round((latest - start) * 10) / 10;
       return (
         <div className="row spread" style={{ padding: '12px 16px', background: 'rgba(247, 244, 255, 0.8)', borderRadius: 14, border: '1px solid var(--line)' }}>
           <div>
             <div className="small muted">Starting</div>
             <strong>{start} lb</strong>
           </div>
           <div>
             <div className="small muted">Current</div>
             <strong>{latest} lb</strong>
           </div>
           <div>
             <div className="small muted">Net Change</div>
             <strong style={{ color: diff <= 0 ? '#15803d' : 'var(--accent)' }}>
               {diff > 0 ? `+${diff}` : diff} lb
             </strong>
           </div>
         </div>
       );
     })()}

     {(() => {
       const unit = chartMetric === 'weight' ? 'lb' : '"';
       const label = chartMetric[0].toUpperCase() + chartMetric.slice(1);
       const filtered = [...entries]
         .filter((p) => Number.isFinite(Number(p[chartMetric])) && Number(p[chartMetric]) > 0)
         .reverse()
         .slice(-12);

       if (filtered.length < 2) {
         return (
           <div className="notice">
             {chartMetric === 'weight'
               ? 'Log two weigh-ins to see your trend.'
               : `Log at least two ${label.toLowerCase()} measurements to see your trend.`}
           </div>
         );
       }

       const vals = filtered.map((p) => Number(p[chartMetric]));
       const minV = Math.min(...vals) - 2;
       const maxV = Math.max(...vals) + 2;
       const span = Math.max(1, maxV - minV);
       const W = 560;
       const H = 165;
       const coords = filtered.map((p, i) => {
         const x = 36 + (i * (W - 72)) / Math.max(1, filtered.length - 1);
         const y = 22 + ((maxV - Number(p[chartMetric])) / span) * (H - 50);
         return { x, y, val: `${p[chartMetric]}${unit}`, day: (p.day || '').slice(5) };
       });
       const poly = coords.map((c) => `${c.x},${c.y}`).join(' ');

       return (
         <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${label} trend line chart`}>
           <line x1="36" y1={H - 28} x2={W - 36} y2={H - 28} stroke="rgba(20,20,31,0.15)" />
           <polyline fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points={poly} />
           {coords.map((c, idx) => (
             <g key={idx}>
               <circle cx={c.x} cy={c.y} r="5" fill="var(--accent)" />
               <text x={c.x} y={c.y - 10} textAnchor="middle" style={{ fontWeight: 700, fontSize: '11px' }}>{c.val}</text>
               <text x={c.x} y={H - 10} textAnchor="middle" style={{ fontSize: '10px' }}>{c.day}</text>
             </g>
           ))}
         </svg>
       );
     })()}

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
             <div className="row" style={{ gap: 10 }}>
               <span className="small muted">{entry.day || ''}</span>
               {entry._id && (
                 <button
                   type="button"
                   className="btn small ghost"
                   aria-label="Delete entry"
                   title="Delete entry"
                   onClick={() => deleteEntry(entry._id)}
                 >
                   ×
                 </button>
               )}
             </div>
           </div>
         ))}
       </div>
     )}
   </section>

    </div>
  );
}
