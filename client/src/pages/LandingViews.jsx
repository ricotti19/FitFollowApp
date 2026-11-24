import { useState } from 'react';

/* =====================================================================================================
   FitFollow landing hero.
   ===================================================================================================== */

const HEXES = [
  {
    id: 'pr',
    pts: [[181, 693], [230, 638], [351, 638], [399, 693], [351, 748], [230, 748]],
    cx: 290,
    size: 28,
    lines: [['NEW', 668, 40], ['PERSONAL', 700, 103], ['RECORD', 731, 96]],
  },
  {
    id: 'tea',
    pts: [[224, 821], [273, 772], [395, 772], [444, 821], [395, 870.5], [273, 870.5]],
    cx: 334,
    size: 28,
    lines: [['LATEST', 809, 88], ['UPDATES', 848, 72]],
  },
  {
    id: 'diet',
    pts: [[84, 923], [131, 874], [256, 874], [303, 923], [256, 971.5], [131, 971.5]],
    cx: 193.5,
    size: 28,
    lines: [['TRACK', 911, 82], ['YOUR DIET', 950, 132]],
  },
];

// [from dot, to dot]: the black connectors from the orange circle to each call-out
const LINKS = [
  [[106, 742.3], [218, 693.3]],
  [[120.7, 786.7], [257.7, 803.3]],
  [[103.3, 826.7], [130, 897.3]],
];

const CIRCLE = { cx: 101, cy: 787.3, r: 64.3 };

/* ---------- landing hero ---------- */



// REPLACE LandingHero WITH THIS:
export function LandingHero({ onRegister, onLogin, onOverview, onTestimonials }) {
  return (
    <section className="hero" aria-label="FitFollow">
      <div className="hero-copy">
        <p className="hero-eyebrow">Social fitness, simplified</p>
        <h1 className="hero-title">FitFollow</h1>
        <p className="hero-lede">
          Do you follow your health as much as you follow your friends?
        </p>

        {/* SINGLE SURGICAL SWAP ON THE LEFT */}
        <div className="hero-actions">
          <button
            type="button"
            className="hero-cta hero-cta-primary"
            onClick={onTestimonials}
          >
            See what our customers say →
          </button>
        </div>

        <button type="button" className="hero-link" onClick={onOverview}>
          Overview <span aria-hidden="true">→</span>
        </button>

        <ul className="hero-points">
          <li>Track workouts, meals, and progress photos</li>
          <li>Follow friends and share real results</li>
          <li>Get a plan tuned to your BMI</li>
        </ul>
      </div>

      <div className="hero-art">
        <svg
          className="hero-art-svg"
          viewBox="0 550 800 500"
          role="img"
          aria-label="FitFollow feature artwork: create an account, sign in, and explore the app."
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="poster-hex" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--hex-from)" />
              <stop offset="100%" stopColor="var(--hex-to)" />
            </linearGradient>
          </defs>

          <g stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" fill="none">
            {LINKS.map(([a, b], i) => (
              <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
            ))}
          </g>

          <circle
            cx={CIRCLE.cx}
            cy={CIRCLE.cy}
            r={CIRCLE.r}
            fill="url(#poster-hex)"
            stroke="var(--ink)"
            strokeWidth="2.5"
          />
          <g transform={`translate(${CIRCLE.cx} ${CIRCLE.cy})`} fill="var(--ink)" aria-hidden="true">
            <rect x="-30" y="-4.5" width="60" height="9" rx="4.5" />
            <rect x="-24" y="-15" width="9" height="30" rx="3" />
            <rect x="15" y="-15" width="9" height="30" rx="3" />
            <rect x="-38" y="-21" width="9" height="42" rx="3" />
            <rect x="29" y="-21" width="9" height="42" rx="3" />
          </g>

          {HEXES.map((h) => (
            <g
              key={h.id}
              className="hex-btn"
              role="button"
              tabIndex={0}
              onClick={onRegister}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRegister();
                }
              }}
            >
              <polygon
                points={h.pts.map((p) => p.join(',')).join(' ')}
                fill="url(#poster-hex)"
                stroke="var(--ink)"
                strokeWidth="2.5"
              />
              <text className="t-hex" textAnchor="middle" fontSize={h.size}>
                {h.lines.map(([text, y], i) => (
                  <tspan key={i} x={h.cx} y={y}>
                    {text}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
          {/* Sleek Action Badge: Create Account */}
          </svg>

        {/* HTML Action Buttons */}
        <div className="hero-art-actions">
          <button type="button" className="art-badge-btn" onClick={onRegister}>
            CREATE ACCOUNT
          </button>
          <button type="button" className="art-badge-btn" onClick={onLogin}>
            SIGN IN
          </button>
        </div>
      </div>
    </section>
  );
}


/* ---------- OVERVIEW page (full-bleed collage) ---------- */
const OVERVIEW_ITEMS = [

  { id: 'learn',     x: 18,   y: 11.5, fs: 2.7, lines: ['LEARN', 'MORE'] },
  { id: 'different', x: 77,   y: 19.5, fs: 2.4, lines: ['WHAT', 'MAKES US', 'DIFFERENT?'] },
  { id: 'bmi',       x: 33,   y: 51,   fs: 2.3, lines: ['BMI & PLAN TAILORING'] },
  { id: 'tiers',     x: 15,   y: 85,   fs: 2.7, lines: ['ACCOUNT', 'TIERS'] },
  { id: 'why',       x: 76,   y: 80,   fs: 2.4, lines: ['WHY', 'TAKE', 'CARE OF', 'YOUR', 'HEALTH?'] },
];
function starPath(cx, cy, spikes, rx, ry, inner = 0.26) {
  const a0 = -Math.PI / 2;
  const step = (2 * Math.PI) / spikes;
  const pt = (i, r) => [
    (cx + rx * r * Math.cos(a0 + i * step)).toFixed(1),
    (cy + ry * r * Math.sin(a0 + i * step)).toFixed(1),
  ];
  let d = `M${pt(0, 1).join(' ')}`;
  for (let i = 0; i < spikes; i++) {
    const c = pt(i + 0.5, inner);
    const p = pt(i + 1, 1);
    d += `Q${c.join(' ')} ${p.join(' ')}`;
  }
  return `${d}Z`;
}

const FLOWER = Array.from({ length: 5 }, (_, i) => {
  const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return { cx: 800 + Math.cos(a) * 160, cy: 235 + Math.sin(a) * 160 };
});

function OverviewShape({ id, label, onSelect, children }) {
  return (
    <g
      className="overview-shape"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(id);
        }
      }}
    >
      {children}
    </g>
  );
}

const DIRECTORY_ITEMS = [
  { id: 'learn', 
    label: 'Learn More', 
    subtitle: 'How FitFollow works' },
  { id: 'different', 
    label: 'What Makes Us Different?', 
    subtitle: 'Our core approach' 
  },
  { id: 'bmi', 
    label: 'BMI & Plan Tailoring', 
    subtitle: 'Custom metrics & goals' },
  { id: 'tiers', label: 'Account Tiers', subtitle: 'Free vs. FitFollow Pro' },
  { id: 'why', label: 'Why Take Care of Your Health?', subtitle: 'Long-term benefits' },
];

export function LandingDirectory({ onSelect, onBack }) {
  return (
    <section className="overview-page" aria-label="FitFollow overview">
      <header className="overview-header">
        <button type="button" className="overview-back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="overview-title">Explore FitFollow</h1>
      </header>

      <div className="overview-grid">
        {DIRECTORY_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="overview-circle"
            onClick={() => onSelect(item.id)}
          >
            <span className="overview-circle-title">{item.label}</span>
            <span className="overview-circle-sub">{item.subtitle}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

  const TESTIMONIALS = [
  {
    name: 'Jordan M.',
    tag: 'Lost 12 lbs • 8-Week Streak',
    quote: 'Logging meals used to feel like a chore, but seeing my friends hit their daily protein goals keeps me consistent every single day.',
    banner: '/banners/banner-1.jpg', // update filename as needed in client/dist/banners/
  },
  {
    name: 'Marcus T.',
    tag: 'Bench PR +25 lbs • 14 Weeks',
    quote: 'Having my personal records and workout logs in one clean feed—without bloated ads—made tracking progressive overload effortless.',
    banner: '/banners/banner-2.jpg',
  },
  {
    name: 'Kat Z.',
    tag: 'Half-Marathon Prep • BMI Plan',
    quote: 'The BMI-tuned calorie baseline gave me an actual starting point instead of guessing my macros before long runs.',
    banner: '/banners/banner-3.jpg',
  },
  {
    name: 'Alex R.',
    tag: 'Daily 10k Steps • Habit Builder',
    quote: 'The database privacy locks give me peace of mind knowing my workout logs are shared only with the people I choose.',
    banner: '/banners/banner-4.jpg',
  },
];

export function TestimonialsView({ onBack, onRegister }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  return (
    <section className="overview-page testimonials-page" aria-label="Customer stories">
      <header className="overview-header">
        <button type="button" className="overview-back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="overview-title">What Our Members Say</h1>
      </header>

      {/* Slider Container */}
      <div className="testimonials-slider-container">
        <button type="button" className="slider-nav-btn prev" onClick={prevSlide} aria-label="Previous testimonial">
          ‹
        </button>

        <div className="testimonials-track-wrapper">
          <div
            className="testimonials-track"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {TESTIMONIALS.map((item, idx) => (
              <div className="testimonial-slide-card" key={idx}>
                <div className="testimonial-banner-wrapper">
                  <img src={item.banner} alt={item.name} className="testimonial-banner-img" />
                  <div className="testimonial-gradient-overlay" />
                </div>
                <div className="testimonial-content-box">
                  <span className="testimonial-tag">{item.tag}</span>
                  <h2 className="testimonial-name">{item.name}</h2>
                  <p className="testimonial-quote">“{item.quote}”</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="slider-nav-btn next" onClick={nextSlide} aria-label="Next testimonial">
          ›
        </button>
      </div>

      {/* Centered Dots Indicator */}
      <div className="testimonials-dots">
        {TESTIMONIALS.map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={`testimonial-dot ${currentIndex === idx ? 'active' : ''}`}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>

      {/* Single Bottom CTA */}
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <button
          type="button"
          className="hero-cta hero-cta-primary"
          style={{ fontSize: '1.15rem', padding: '18px 34px' }}
          onClick={onRegister}
        >
          Start your own streak — Create Account
        </button>
      </div>
    </section>
  );
}