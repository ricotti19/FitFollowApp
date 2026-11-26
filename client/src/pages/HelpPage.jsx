import React, { useState } from 'react';

/**
 * Help & account info page (opened from the Today tab and the profile menu).
 * Frontend only, no backend calls. Three sections:
 *   Plans     Free vs Pro (same tiers as the "Account Tiers" card on the landing page)
 *   Canceling how canceling Pro works, plus signing out / going private
 *   Copyright who owns what, and the open-source tools FitFollow is built on
 */

const SECTIONS = [
  { id: 'plans', label: 'Plans' },
  { id: 'cancel', label: 'Canceling' },
  { id: 'copyright', label: 'Copyright' },
];

// Keep in sync with the "Account Tiers" text in InfoDialog.jsx
const PLAN_FEATURES = [
  { name: 'Workout logs + automatic PRs', free: true, pro: true },
  { name: 'Calories, macros and steps', free: true, pro: true },
  { name: 'Friends, chat and stories', free: true, pro: true },
  { name: 'Privacy-locked posts', free: true, pro: true },
  { name: 'Advanced body trend analytics', free: false, pro: true },
  { name: 'Custom workout presets', free: false, pro: true },
  { name: 'Priority photo verification', free: false, pro: true },
];

const CREDITS = [
  { name: 'React', use: 'App screens', license: 'MIT' },
  { name: 'Vite', use: 'Builds the web app', license: 'MIT' },
  { name: 'Express', use: 'API server', license: 'MIT' },
  { name: 'MongoDB + Mongoose', use: 'Database', license: 'SSPL / MIT' },
  { name: 'Socket.IO', use: 'Live chat', license: 'MIT' },
  { name: 'bad-words', use: 'Caption filter', license: 'MIT' },
  { name: 'MediaPipe', use: 'Pose detection on photos', license: 'Apache 2.0' },
  { name: 'PyTorch', use: 'Workout photo classifier', license: 'BSD-3-Clause' },
  { name: 'OpenCV', use: 'Image processing', license: 'Apache 2.0' },
  { name: 'Flask', use: 'Photo check service', license: 'BSD-3-Clause' },
  { name: 'Hugging Face Transformers (CLIP)', use: 'Photo content scoring', license: 'Apache 2.0 / MIT' },
  { name: 'Open Food Facts', use: 'Food and nutrition data', license: 'ODbL' },
];

const Check = ({ on }) => (
  <span
    aria-label={on ? 'Included' : 'Not included'}
    style={{ fontWeight: 700, color: on ? 'var(--accent)' : 'var(--muted)' }}
  >
    {on ? '✓' : '–'}
  </span>
);

function Steps({ items }) {
  return (
    <ol className="help-list">
      {items.map((s) => <li key={s}>{s}</li>)}
    </ol>
  );
}

function PlansSection() {
  const cell = { padding: '10px 8px', borderTop: '1px solid var(--line-soft)' };
  return (
    <section className="card stack" aria-labelledby="help-plans">
      <div className="row spread wrap">
        <h2 className="card-title" id="help-plans">Plans</h2>
        <span className="chip accent">You're on Free</span>
      </div>
      <p className="help-text">
        Everything you need to train and stay accountable is free. Pro adds extra tools for people who want deeper stats.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...cell, borderTop: 0, textAlign: 'left' }}>Feature</th>
            <th scope="col" style={{ ...cell, borderTop: 0, width: 64 }}>Free</th>
            <th scope="col" style={{ ...cell, borderTop: 0, width: 64 }}>Pro</th>
          </tr>
        </thead>
        <tbody>
          {PLAN_FEATURES.map((f) => (
            <tr key={f.name}>
              <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>{f.name}</th>
              <td style={{ ...cell, textAlign: 'center' }}><Check on={f.free} /></td>
              <td style={{ ...cell, textAlign: 'center' }}><Check on={f.pro} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="notice">
        Pro is coming soon. Nobody is being charged right now, and every account is on the Free plan.
      </div>
    </section>
  );
}

function CancelSection({ onOpenSettings }) {
  return (
    <>
      <section className="card stack" aria-labelledby="help-cancel">
        <h2 className="card-title" id="help-cancel">Canceling Pro</h2>
        <p className="help-text">
          Since Pro isn't live yet, there's nothing to cancel today. Once it launches, here's how it will work:
        </p>
        <Steps
          items={[
            'Tap your profile photo in the top right corner.',
            'Open Profile & privacy.',
            'Find your plan and choose Cancel Pro, then confirm.',
          ]}
        />
        <div className="divider" />
        <h3 className="help-sub">What happens after you cancel</h3>
        <ul className="help-list">
          <li>You keep Pro until the end of the period you already paid for.</li>
          <li>After that, you go back to Free automatically. No extra charges.</li>
          <li>Your workouts, food logs, body stats, friends and posts all stay.</li>
          <li>Pro-only tools lock again, but your saved data stays there if you come back.</li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="help-leave">
        <h2 className="card-title" id="help-leave">Taking a break</h2>
        <div className="choice" style={{ cursor: 'default' }}>
          <div>
            <div className="help-opt-title">Go private</div>
            <div className="help-opt-desc">
              Only friends can see your posts, and nothing shows up in Discover.
            </div>
          </div>
        </div>
        <div className="choice" style={{ cursor: 'default' }}>
          <div>
            <div className="help-opt-title">Sign out</div>
            <div className="help-opt-desc">
              Tap your profile photo in the top right corner, tap Sign out, then confirm. Your data stays saved.
            </div>
          </div>
        </div>
        <div className="choice" style={{ cursor: 'default' }}>
          <div>
            <div className="help-opt-title">Delete your account</div>
            <div className="help-opt-desc">
              Open Profile &amp; privacy, scroll to Delete Account, tap Delete Account &amp; All Data, and confirm.
              This permanently removes your workouts, food logs, stories, posts and messages. It can't be undone.
            </div>
          </div>
        </div>
        <div>
          <button type="button" className="btn small" onClick={onOpenSettings}>
            Open Profile &amp; privacy
          </button>
        </div>
      </section>
    </>
  );
}

function CopyrightSection() {
  const year = new Date().getFullYear();
  return (
    <>
      <section className="card stack" aria-labelledby="help-copyright">
        <h2 className="card-title" id="help-copyright">Copyright</h2>
        <p className="help-text">
          © {year} FitFollow. Built by Team 14 for SE 3354 (Software Engineering) as a class project.
        </p>
        <div className="divider" />
        <h3 className="help-sub">Your content is yours</h3>
        <ul className="help-list">
          <li>You own the photos, captions and stories you post.</li>
          <li>
            By posting, you let FitFollow store your content and show it only to the audience you picked
            (Only me, Friends or Public).
          </li>
          <li>Deleting a post removes it from FitFollow.</li>
        </ul>
        <h3 className="help-sub">Respect other people's content</h3>
        <ul className="help-list">
          <li>Only post photos you took or have permission to share.</li>
          <li>Don't repost someone else's progress pics or workout plans as your own.</li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="help-credits">
        <h2 className="card-title" id="help-credits">Built with open source</h2>
        <p className="help-text">
          FitFollow uses these free tools and data. Each one belongs to its own authors under the license shown.
        </p>
        <div className="stack" style={{ gap: 0 }}>
          {CREDITS.map((c) => (
            <div
              key={c.name}
              className="row spread"
              style={{ padding: '9px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'baseline' }}
            >
              <div>
                <div className="help-opt-title">{c.name}</div>
                <div className="help-opt-desc">{c.use}</div>
              </div>
              <span className="chip help-lic">{c.license}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function HelpPage({ onBack, onOpenSettings, initialSection = 'plans' }) {
  const [section, setSection] = useState(initialSection);

  return (
    <div className="stack help-page">
      <button type="button" className="settings-back" onClick={onBack}>← Back</button>
      <h1 className="card-title" style={{ fontSize: '1.25rem' }}>Help &amp; account info</h1>

      <div className="seg" role="tablist" aria-label="Help sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={section === s.id ? 'on' : ''}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'plans' && <PlansSection />}
      {section === 'cancel' && <CancelSection onOpenSettings={onOpenSettings} />}
      {section === 'copyright' && <CopyrightSection />}
    </div>
  );
}
