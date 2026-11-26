import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';

const FORM_FOCUS_OPTIONS = [
  { id: 'setup', label: 'Setup & Grip / Stance', query: 'proper setup grip stance form tutorial' },
  { id: 'depth', label: 'Full Range of Motion / Depth', query: 'range of motion depth technique' },
  { id: 'path', label: 'Bar Path & Tempo Control', query: 'bar path tempo control cues' },
  { id: 'safety', label: 'Joint & Lower Back Protection', query: 'common mistakes injury prevention cues' },
];

export default function WorkoutsTab() {
  const [sessions, setSessions] = useState([]);
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState({ exercise: '', weight: '', reps: '', sets: '', minutes: '', speedMph: '', styleNote: '' });
  const [activityMeta, setActivityMeta] = useState({ mode: 'bodyweight_strength', requiresWeight: false });
  const coachRef = useRef(null);
  const openCoach = (name) => {
    setErrorMsg('');
    setCoachExercise(name);
    setCoachFocus('setup');
    setCustomCue('');
    setTimeout(() => coachRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };
  const [prBanner, setPrBanner] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [coachExercise, setCoachExercise] = useState('');
  const [coachFocus, setCoachFocus] = useState('setup');
  const [customCue, setCustomCue] = useState('');
  const [coachVideos, setCoachVideos] = useState([]);
  const [coachSearchUrl, setCoachSearchUrl] = useState('');
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [hiddenPresets, setHiddenPresets] = useState([]);
  const [newPreset, setNewPreset] = useState('');

  useEffect(() => {
    if (!coachExercise) return;
    const activeOpt = FORM_FOCUS_OPTIONS.find((f) => f.id === coachFocus) || FORM_FOCUS_OPTIONS.at(0);
    const focusParam = customCue.trim() ? `${customCue.trim()} form tutorial` : activeOpt.query;
    let cancelled = false;
    setLoadingVideos(true);
    const timer = setTimeout(() => {
      api.get(`/exercises/videos?exercise=${encodeURIComponent(coachExercise)}&focus=${encodeURIComponent(focusParam)}`)
        .then((d) => {
          if (cancelled) return;
          setCoachVideos(d.videos || []);
          setCoachSearchUrl(d.searchUrl || '');
        })
        .catch((err) => {
          if (cancelled) return;
          setCoachExercise('');
          setErrorMsg(err.message || 'Select a valid workout exercise first.');
        })
        .finally(() => { if (!cancelled) setLoadingVideos(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [coachExercise, coachFocus, customCue]);

  useEffect(() => {
    const q = form.exercise.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActivityMeta({ mode: 'bodyweight_strength', requiresWeight: false });
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/exercises/search?q=${encodeURIComponent(q)}`)
        .then((d) => setSuggestions(d.exercises || []))
        .catch(() => {});
      api.get(`/exercises/inspect?exercise=${encodeURIComponent(q)}`)
        .then((info) => {
          if (info?.valid) setActivityMeta({ mode: info.mode || 'weighted_strength', requiresWeight: Boolean(info.requiresWeight) });
        })
        .catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [form.exercise]);

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
    setErrorMsg('');
    try {
      const rawName = form.exercise.trim();
      const loggedName = activityMeta.mode === 'movement_duration' && form.styleNote.trim()
        ? `${rawName} (${form.styleNote.trim()})`
        : rawName;
      const res = await api.post('/sessions', {
        exercise: loggedName,
        weight: Number(form.weight || 0),
        reps: Number(form.reps || 0),
        sets: Number(form.sets || 0),
        minutes: Number(form.minutes || 0),
        speedMph: Number(form.speedMph || 0),
      });
      if (res.isPR && Number(form.weight) > 0) {
        setPrBanner(`New Personal Record on ${loggedName}: ${form.weight} lb!`);
      }
      setForm({ exercise: '', weight: '', reps: '', sets: '', minutes: '', speedMph: '', styleNote: '' });
      setSuggestions([]);
      loadWorkouts();
      openCoach(loggedName);
    } catch (err) {
      setErrorMsg(err.message || 'Could not log workout.');
    }
  };

  const startPreset = async (presetId) => {
    await api.post(`/presets/${presetId}/start`);
    loadWorkouts();
  };

  const deleteSession = async (id) => {
    await api.del(`/sessions/${id}`);
    loadWorkouts();
  };

  const clearHistory = async () => {
    await api.del('/sessions');
    loadWorkouts();
  };

const addPreset = async (e) => {
  e.preventDefault();
  if (!newPreset.trim()) return;
  try {
    await api.post('/presets', { name: newPreset.trim() });
    setNewPreset('');
    loadWorkouts();
  } catch (err) {
    setErrorMsg(err.message || 'Could not save preset.');
  }
};

const removePreset = async (p) => {
  if (p.custom) {
    await api.del(`/presets/${p.id}`);
    loadWorkouts();
  } else {
    setHiddenPresets((prev) => [...prev, p.id]);
  }
};

  return (
    <div className="stack">

      {/* LOG WORKOUT SET (FR-5, FR-7) */}
      <form onSubmit={handleLogSet} className="card stack">
        <h2 className="card-title">Log Workout</h2>

     <div>
       <input
         placeholder="Search ANY exercise (e.g., Bench Press, Squat, Lat Pulldown)"
         value={form.exercise}
         onChange={(e) => setForm({ ...form, exercise: e.target.value })}
         required
       />
       {suggestions.length > 0 && (
         <div className="list" style={{ marginTop: 6, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '4px 10px' }}>
           {suggestions.map((item, i) => (
             <button
               key={i}
               type="button"
               className="item spread"
               style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
               onClick={() => { setForm({ ...form, exercise: item.name }); setSuggestions([]); }}
             >
               <span style={{ fontWeight: 600 }}>{item.name}</span>
               <span className="chip">{item.category}</span>
             </button>
           ))}
         </div>
       )}
     </div>
        
                {activityMeta.mode === 'cardio_speed' ? (
          <div className="row wrap">
            <input type="number" min="1" max="600" placeholder="Duration (minutes)" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} required style={{ flex: '1 1 120px' }} />
            <input type="number" min="0" max="40" step="0.1" placeholder="Speed (mph, optional)" value={form.speedMph} onChange={(e) => setForm({ ...form, speedMph: e.target.value })} style={{ flex: '1 1 120px' }} />
          </div>
        ) : activityMeta.mode === 'movement_duration' ? (
          <div className="row wrap">
            <input type="number" min="1" max="600" placeholder="Duration (minutes)" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} required style={{ flex: '1 1 110px' }} />
            <input placeholder="Style / focus (e.g., Bharatanatyam, Vinyasa, Salsa)" value={form.styleNote} onChange={(e) => setForm({ ...form, styleNote: e.target.value })} style={{ flex: '2 1 160px' }} />
          </div>
        ) : (
          <div className="row wrap">
            {activityMeta.requiresWeight && (
              <input type="number" min="0.5" step="0.5" placeholder="Weight (lb)" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} required style={{ flex: '1 1 95px' }} />
            )}
            <input type="number" min="1" placeholder="Reps" value={form.reps} onChange={(e) => setForm({ ...form, reps: e.target.value })} required style={{ flex: '1 1 90px' }} />
            <input type="number" min="1" placeholder="Sets" value={form.sets} onChange={(e) => setForm({ ...form, sets: e.target.value })} required style={{ flex: '1 1 90px' }} />
          </div>
        )}

      <button type="submit" className="btn block">Save set</button>
      {prBanner && <div className="notice ok pr-banner">🏆 {prBanner}</div>}
      </form>

     {errorMsg && <div className="notice">{errorMsg}</div>}

   {/* SAVED PRESETS (FR-30, FR-31) */}
   <section className="card stack">
     <div className="row spread">
       <h2 className="card-title">Saved Activities</h2>
       {hiddenPresets.length > 0 && (
         <button type="button" className="btn small ghost" onClick={() => setHiddenPresets([])}>
           Restore defaults
         </button>
       )}
     </div>
     <form onSubmit={addPreset} className="row" style={{ gap: 8 }}>
       <input
         placeholder="New preset (e.g., Upper Body Hypertrophy)"
         value={newPreset}
         onChange={(e) => setNewPreset(e.target.value)}
         style={{ flex: 1 }}
       />
       <button type="submit" className="btn small">Add</button>
     </form>
     <div className="list">
       {presets.filter((p) => !hiddenPresets.includes(p.id)).map((p) => (
         <div key={p._id || p.id} className="item spread">
           <span style={{ fontWeight: 500 }}>{p.name}</span>
           <div className="row" style={{ gap: 6 }}>
             <button
               type="button"
               className="btn small ghost"
               onClick={() => openCoach(p.name)}
             >
               Form Help
             </button>
             <button
               type="button"
               onClick={async () => {
                 await startPreset(p._id || p.id);
                 openCoach(p.name);
               }}
               className="btn small"
             >
               Start
             </button>
             <button
               type="button"
               className="btn small ghost"
               style={{ padding: '2px 8px' }}
               aria-label="Remove preset"
               onClick={() => removePreset(p)}
             >
               Remove
             </button>
           </div>
         </div>
       ))}
     </div>
   </section>

   {prBanner && (
    <div
      className="notice ok"
      style={{ fontSize: '3rem', fontWeight: 900, padding: '16px 20px', borderRadius: 16 }}
    >
      🏆 {prBanner}
    </div>
  )}
   {errorMsg && <div className="notice">{errorMsg}</div>}

   {/* WORKOUT HISTORY (FR-6) */}
   <section className="card stack">
     <div className="row spread">
       <h2 className="card-title">History</h2>
       {sessions.length > 0 && (
         <button type="button" className="btn small ghost" onClick={clearHistory}>Clear all</button>
       )}
     </div>
     {sessions.length === 0 ? (
       <p className="empty">No workouts logged yet.</p>
     ) : (
       <div className="list">
         {sessions.map((s, idx) => (
           <div key={s._id || idx} className="item spread">
             <div className="grow">
               <div style={{ fontWeight: 600 }}>{s.exercise || s.name || 'Workout Session'}</div>
                <div className="small muted">
                {s.minutes > 0
                  ? `${s.minutes} min${s.speedMph > 0 ? ` @ ${s.speedMph} mph` : ''}`
                  : s.reps
                    ? `${s.weight > 0 ? `${s.weight} lb × ` : 'Bodyweight × '}${s.reps} reps × ${s.sets} sets`
                    : 'Session logged'}
              </div>
             </div>
             <div className="row" style={{ gap: 8 }}>
               {s.exercise && (
                 <button
                   type="button"
                   className="btn small ghost"
                   onClick={() => openCoach(s.exercise)}
                 >
                   Form Help
                 </button>
               )}
               <span className="small muted">{s.createdAt ? timeAgo(s.createdAt) : ''}</span>
               {s._id && (
                 <button
                   type="button"
                   className="btn small ghost"
                   style={{ padding: '2px 8px' }}
                   aria-label="Delete workout"
                   onClick={() => deleteSession(s._id)}
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


<div ref={coachRef}>
        {coachExercise && (() => {
          const activeFocusObj = FORM_FOCUS_OPTIONS.find((f) => f.id === coachFocus) || FORM_FOCUS_OPTIONS.at(0);
          return (
            <section className="card stack" style={{ border: '2px solid var(--accent)' }}>
              <div className="row spread">
                <div>
                  <span className="chip accent">AI Form Coach</span>
                  <h2 className="card-title" style={{ marginTop: 6 }}>Need form tips on {coachExercise}?</h2>
                </div>
                <button type="button" className="btn small ghost" onClick={() => setCoachExercise('')}>Dismiss</button>
              </div>
              <p className="small muted">What&apos;s the main thing you need help with on <strong>{coachExercise}</strong>?</p>
              <div className="row wrap" style={{ gap: 8 }}>
                {FORM_FOCUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={coachFocus === opt.id && !customCue.trim() ? 'btn small' : 'btn small ghost'}
                    onClick={() => { setCoachFocus(opt.id); setCustomCue(''); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                placeholder={`Or type a specific cue (e.g., "posture or footwork on ${coachExercise}")...`}
                value={customCue}
                onChange={(e) => setCustomCue(e.target.value)}
              />
              {loadingVideos ? (
                <p className="small muted">Finding top coaching videos for {coachExercise}…</p>
              ) : coachVideos.length > 0 ? (
                <div className="stack" style={{ gap: 10 }}>
                  {coachVideos.map((v) => (
                    <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 12, padding: 8, borderRadius: 12, border: '1px solid var(--line)', background: '#fff', textDecoration: 'none', color: 'inherit' }}>
                      <img src={v.thumbnail} alt={v.title} style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                      <div className="grow">
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.3 }}>{v.title}</div>
                        <div className="small muted" style={{ marginTop: 4 }}>YouTube Form Tutorial ↗</div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : null}
              {coachSearchUrl && (
                <a href={coachSearchUrl} target="_blank" rel="noopener noreferrer" className="btn block" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  Browse More {coachExercise} Form Videos ↗
                </a>
              )}
            </section>
          );
        })()}
      </div>

    </div>
  );
}
