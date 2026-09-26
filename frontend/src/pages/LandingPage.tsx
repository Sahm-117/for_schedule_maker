import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { landingApi } from '../services/api';
import { DEFAULT_LANDING_CONTENT, LANDING_ICON_PATHS, resolveLandingContent, type LandingContent } from '../components/landing/landingContent';
import './LandingPage.css';

// -----------------------------------------------------------------------
// Public FOF landing page — fof.tcnikorodu.org. Rendered at "/" for a
// signed-out visitor (see ProtectedRoute). Visual design ported from the
// design mockup at files/claude-design-landing/Main.dc.html (near-black +
// warm orange, Bebas Neue display / Host Grotesk body, scroll-driven
// reveals, parallax, pinned horizontal "how it works" cards). Styling
// lives in ./LandingPage.css, scoped under .fof-landing.
//
// Photos (hero, small group, class) are uploaded by an admin — Settings >
// Programme > Website photos (frontend/src/pages/AdminSettingsPage.tsx,
// LandingImagesCard) — and served from public_fof_landing()'s
// landingImages field. Falls back to the mockup's glow/placeholder design
// wherever a slot hasn't been uploaded yet.
// -----------------------------------------------------------------------

const FONT_LINK_ID = 'fof-landing-fonts';
const DEFAULT_REGISTRATION_LINK = 'https://forms.gle/tCaAqnBF72efNexW6';

type CSSVars = React.CSSProperties;
const vars = (v: Record<string, string | number>): CSSVars => v as CSSVars;

// ---- content ---------------------------------------------------------------

const NAV_ITEMS: Array<{ label: string; id: string }> = [
  { label: 'About', id: 'about' },
  { label: 'What you’ll learn', id: 'learn' },
  { label: 'How it works', id: 'how-it-works' },
  { label: 'FAQ', id: 'faq' },
];

/** "2026-10-04" (a plain DATE, no time) -> "Sun, 4 Oct 2026", read as a
 * local calendar date so the visitor's timezone can never shift it a day. */
const formatCohortDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday}, ${d} ${month} ${y}`;
};

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

// ---- small building blocks -------------------------------------------------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return; }
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const CardIcon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ArrowIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const RollBtn: React.FC<{ children: string }> = ({ children }) => (
  <span className="btn-roll"><span>{children}</span><span aria-hidden="true">{children}</span></span>
);

/** Scroll-driven scene: nav show/hide + blur, hero/CTA parallax glow, the
 * "about" word scrub, curriculum active-lesson tracking, the pinned
 * horizontal "how it works" track, and the journey rail fill. All of this
 * is skipped when prefers-reduced-motion is set (or below 1000px for the
 * pin) — see LandingPage.css, everything here is scoped under `.fx`. */
function useLandingScene(rootRef: React.RefObject<HTMLDivElement | null>, reduced: boolean) {
  const [navScrolled, setNavScrolled] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [activeLesson, setActiveLesson] = useState(0);
  const [loaded, setLoaded] = useState(reduced);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fxOn = !reduced;

    let navScrolledCur = false;
    let navHiddenCur = false;
    let pastHeroCur = false;
    let activeLessonCur = 0;
    let lastSt = window.scrollY;
    let hwH: number | null = null;
    let ticking = false;
    let upRaf = 0;

    const loadTimer = window.setTimeout(() => setLoaded(true), 140);

    const update = () => {
      const vh = window.innerHeight;
      const vw = root.clientWidth;
      const st = window.scrollY;

      const hero = root.querySelector<HTMLElement>('#hero');
      const heroH = hero ? hero.offsetHeight : 700;
      const dir = st - lastSt;
      lastSt = st;
      let hidden = navHiddenCur;
      if (st < heroH * 0.6) hidden = false;
      else if (dir > 3) hidden = true;
      else if (dir < -3) hidden = false;
      const scrolled = st > 30;
      const past = st > heroH * 0.75;
      if (scrolled !== navScrolledCur) { navScrolledCur = scrolled; setNavScrolled(scrolled); }
      if (hidden !== navHiddenCur) { navHiddenCur = hidden; setNavHidden(hidden); }
      if (past !== pastHeroCur) { pastHeroCur = past; setPastHero(past); }

      if (!fxOn) return;

      root.querySelectorAll<HTMLElement>('[data-par]').forEach((el) => {
        const parent = el.parentElement;
        if (!parent) return;
        const r = parent.getBoundingClientRect();
        const c = r.top + r.height / 2 - vh / 2;
        const f = parseFloat(el.getAttribute('data-par') || '0');
        el.style.setProperty('--y', (c * f).toFixed(1) + 'px');
      });

      const about = root.querySelector<HTMLElement>('[data-words]');
      if (about) {
        const ar = about.getBoundingClientRect();
        const p = clamp((vh * 0.88 - ar.top) / (ar.height + vh * 0.38), 0, 1);
        const ws = about.querySelectorAll<HTMLElement>('[data-w]');
        const n = ws.length;
        ws.forEach((wEl, i) => {
          const local = clamp((p * (n + 5) - i) / 5, 0, 1);
          wEl.style.opacity = (0.14 + 0.86 * local).toFixed(3);
        });
      }

      const rows = root.querySelectorAll<HTMLElement>('[data-lesson]');
      if (rows.length) {
        let best = 0;
        let bestD = Infinity;
        rows.forEach((rowEl, j) => {
          const rr = rowEl.getBoundingClientRect();
          const d = Math.abs(rr.top + rr.height / 2 - vh * 0.5);
          if (d < bestD) { bestD = d; best = j; }
        });
        if (best !== activeLessonCur) { activeLessonCur = best; setActiveLesson(best); }
      }

      const hw = root.querySelector<HTMLElement>('[data-hw]');
      if (hw) {
        const track = hw.querySelector<HTMLElement>('[data-track]');
        if (vw >= 1000 && track) {
          const viewEl = track.parentElement;
          const viewW = viewEl ? viewEl.clientWidth : 0;
          const dist = Math.max(0, track.scrollWidth - viewW);
          const stickyH = Math.min(vh, 1000);
          const want = Math.round(stickyH + dist * 1.1);
          if (hwH !== want) { hwH = want; hw.style.setProperty('--hw-h', want + 'px'); }
          const hr = hw.getBoundingClientRect();
          const hp = clamp(-hr.top / Math.max(1, want - stickyH), 0, 1);
          track.style.setProperty('--x', (-hp * dist).toFixed(1) + 'px');
          hw.style.setProperty('--hp', hp.toFixed(4));
        } else if (track) {
          hwH = null;
          hw.style.removeProperty('--hw-h');
          track.style.setProperty('--x', '0px');
          hw.style.setProperty('--hp', '1');
        }
      }

      const jr = root.querySelector<HTMLElement>('[data-journey]');
      if (jr) {
        const steps = jr.querySelector<HTMLElement>('.j-wrap');
        const sr = (steps || jr).getBoundingClientRect();
        const jp = clamp((vh * 0.78 - sr.top) / Math.max(1, sr.height + vh * 0.2), 0, 1);
        jr.style.setProperty('--jp', jp.toFixed(4));
      }
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      upRaf = requestAnimationFrame(() => { ticking = false; update(); });
    };
    const onScroll = () => requestUpdate();
    const onResize = () => { hwH = null; requestUpdate(); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add('is-in'); io?.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
      root.querySelectorAll('[data-reveal]').forEach((el) => io!.observe(el));
    } else {
      root.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in'));
    }

    let ctaIo: IntersectionObserver | null = null;
    const ctaEl = root.querySelector('[data-cta]');
    if (ctaEl && 'IntersectionObserver' in window) {
      ctaIo = new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting), { threshold: 0.2 });
      ctaIo.observe(ctaEl);
    }

    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.clearTimeout(loadTimer);
      cancelAnimationFrame(upRaf);
      io?.disconnect();
      ctaIo?.disconnect();
    };
  }, [rootRef, reduced]);

  return { navScrolled, navHidden, mbarOn: pastHero && !ctaVisible, activeLesson, loaded };
}

const LandingPage: React.FC = () => {
  const [registrationLink, setRegistrationLink] = useState(DEFAULT_REGISTRATION_LINK);
  const [nextCohortText, setNextCohortText] = useState('Registration is open');
  const [images, setImages] = useState<{ hero: string | null; group: string | null; class: string | null }>({ hero: null, group: null, class: null });
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [openFaq, setOpenFaq] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { navScrolled, navHidden, mbarOn, activeLesson, loaded } = useLandingScene(rootRef, reduced);
  const fxOn = !reduced;

  // Scoped Google Fonts — only loaded while this page is mounted.
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap';
    document.head.appendChild(link);
    return () => {
      document.getElementById(FONT_LINK_ID)?.remove();
    };
  }, []);

  // SEO — restored on unmount so the rest of the app keeps its own title.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Foundation of Faith — TCN Ikorodu';
    const meta = document.querySelector('meta[name="description"]');
    const prevDescription = meta?.getAttribute('content') ?? null;
    const createdMeta = !meta;
    const metaEl = meta ?? document.createElement('meta');
    metaEl.setAttribute('name', 'description');
    metaEl.setAttribute(
      'content',
      "Foundation of Faith is The Covenant Nation Ikorodu's 10-week foundational course — anchoring new believers and new members in biblical truth and helping them find their home in the church."
    );
    if (createdMeta) document.head.appendChild(metaEl);

    return () => {
      document.title = prevTitle;
      if (createdMeta) {
        metaEl.remove();
      } else if (prevDescription !== null) {
        metaEl.setAttribute('content', prevDescription);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    landingApi.get().then((info) => {
      if (cancelled) return;
      if (info.registrationLink) setRegistrationLink(info.registrationLink);
      if (info.nextCohort?.startDate) {
        setNextCohortText(`Next cohort starts ${formatCohortDate(info.nextCohort.startDate)}`);
      }
      setImages({
        hero: info.landingImages?.hero ?? null,
        group: info.landingImages?.group ?? null,
        class: info.landingImages?.class ?? null,
      });
      setContent(resolveLandingContent(info.landingContent));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const smoothScrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const rootClass = `fof-landing${fxOn ? ' fx' : ''}${loaded || !fxOn ? ' is-loaded' : ''}`;
  const navClass = `nav${navScrolled ? ' is-scrolled' : ''}${navHidden ? ' is-hidden' : ''}`;

  return (
    <div className={rootClass} ref={rootRef}>
      {/* ================= NAV ================= */}
      <header className={navClass}>
        <div className="nav-in">
          <a className="brand" href="#hero" onClick={smoothScrollTo('hero')} aria-label="Foundation of Faith — back to top">
            <img src="/logo-mark.png" alt="" width={40} height={40} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Foundation of Faith</span>
          </a>
          <nav className="nav-links" aria-label="Sections">
            {NAV_ITEMS.map((n) => (
              <a key={n.id} className="nav-link" href={`#${n.id}`} onClick={smoothScrollTo(n.id)}>{n.label}</a>
            ))}
          </nav>
          <Link to="/login" className="nav-login">Members login</Link>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section id="hero" className="hero">
        {images.hero && <div className="hero-photo" style={{ backgroundImage: `url(${images.hero})` }} />}
        <div className="hero-glow" data-par="0.25" />
        <div className="hero-mark" data-par="-0.18" aria-hidden="true">FOF</div>
        <div className="hero-grain" />
        <div className="wrap hero-body">
          <p className="pill hf" style={vars({ '--d': 0 })}><span className="dot" />{nextCohortText}</p>
          <h1 className="display hero-title">
            {[...content.hero.lines.map((t) => ({ t, cls: '' })), { t: content.hero.accentLine, cls: 'line-accent' }].map((l, i) => (
              <span className="line" key={i}>
                <span className={`line-in ${l.cls}`} style={vars({ '--i': i })}>{l.t}</span>
              </span>
            ))}
          </h1>
          <div className="hero-foot hf" style={vars({ '--d': 2 })}>
            <p className="hero-lede">{content.hero.subtitle}</p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href={registrationLink} target="_blank" rel="noopener noreferrer">
                <RollBtn>Register for FOF</RollBtn>
                <span className="btn-ic"><ArrowIcon /></span>
              </a>
              <Link className="btn btn-ghost" to="/login">
                <RollBtn>Members login</RollBtn>
              </Link>
            </div>
          </div>
          <div className="hero-meta hf" style={vars({ '--d': 3 })}>
            <div className="hero-meta-list">{content.hero.facts.map((f, i) => <span key={i}>{f}</span>)}</div>
            <span className="scroll-cue"><span className="scroll-cue-bar" />{content.hero.scrollLabel}</span>
          </div>
        </div>
      </section>

      {/* ================= MARQUEE ================= */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {(reduced ? content.marquee.words : [...content.marquee.words, ...content.marquee.words]).map((t, i) => (
            <span className="mq-item" key={i}>{t}<span className="mq-dot" /></span>
          ))}
        </div>
      </div>

      {/* ================= ABOUT ================= */}
      <section id="about" className="about">
        <div className="wrap about-grid">
          <p className="label about-label"><span className="label-idx">01</span>About FOF</p>
          <p className="about-text" data-words="">
            {content.about.segments.flatMap((seg, si) => seg.text.split(' ').map((t, wi) => (
              <span key={`${si}-${wi}`} className={`wd${seg.strong ? ' is-strong' : ''}`} data-w="">{t}</span>
            )))}
          </p>
          <div className="facts">
            {content.about.stats.map((stat, i) => (
              <div className="fact rv" data-reveal="" style={vars({ '--d': i })} key={i}>
                <div className="fact-num">{stat.value}<em>{stat.suffix}</em></div>
                <p className="fact-txt">{stat.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CURRICULUM ================= */}
      <section id="learn" className="learn">
        <div className="wrap learn-grid">
          <div className="learn-side">
            <p className="label" style={{ color: '#6A6158' }}><span className="label-idx">02</span>Curriculum</p>
            <h2 className="display learn-title mh" data-reveal="">
              {'What you’ll learn'.split(' ').map((w, i) => (
                <span className="w" key={i}><span style={vars({ '--i': i })}>{w}</span></span>
              ))}
            </h2>
            <p className="learn-sub rv" data-reveal="" style={vars({ '--d': 2 })}>{content.curriculum.intro}</p>
            <div className="counter" aria-hidden="true"><span className="counter-now">{String(activeLesson + 1).padStart(2, '0')}</span><span className="counter-of">/ {content.curriculum.items.length}</span></div>
          </div>
          <ol className="learn-list">
            {content.curriculum.items.map((l, i) => (
              <li className={`lesson${i === activeLesson ? ' is-active' : ''}`} data-lesson="" key={i}>
                <div className="lesson-in rv" data-reveal="">
                  <span className="lesson-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="lesson-title">{l.title}</h3>
                    <p className="lesson-desc">{l.description}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= PHOTOS ================= */}
      <section className="photos" aria-label="FOF in pictures">
        <div className="wrap photos-grid">
          <figure className="ph-a" style={{ margin: 0 }}>
            <div data-reveal="">
              <div className="ph" role="img" aria-label="A Sunday FOF class in session">
                <div className="ph-inner" data-par="0.08" style={images.class ? { backgroundImage: `url(${images.class})` } : undefined}>
                  {!images.class && <span className="ph-tag">Photo — {content.photos.classLabel}</span>}
                </div>
              </div>
            </div>
            <figcaption className="ph-cap"><span>{content.photos.classLabel}</span><span>{content.photos.classLocation}</span></figcaption>
          </figure>
          <figure className="ph-b" style={{ margin: 0 }}>
            <div data-reveal="">
              <div className="ph" role="img" aria-label="An FOF small group meeting together">
                <div className="ph-inner" data-par="-0.08" style={images.group ? { backgroundImage: `url(${images.group})` } : undefined}>
                  {!images.group && <span className="ph-tag">Photo — {content.photos.groupLabel}</span>}
                </div>
              </div>
            </div>
            <figcaption className="ph-cap"><span>{content.photos.groupLabel}</span><span>{content.photos.groupLocation}</span></figcaption>
          </figure>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how-it-works" className="how">
        <div className="hw" data-hw="">
          <div className="hw-sticky">
            <div className="wrap hw-head">
              <div className="hw-head-l">
                <p className="label" style={{ color: 'rgba(246,241,234,0.55)' }}><span className="label-idx">03</span>How it works</p>
                <h2 className="display hw-title mh" data-reveal="">
                  {'How it works'.split(' ').map((w, i) => (
                    <span className="w" key={i}><span style={vars({ '--i': i })}>{w}</span></span>
                  ))}
                </h2>
              </div>
              <p className="hw-intro rv" data-reveal="" style={vars({ '--d': 2 })}>{content.howItWorks.intro}</p>
            </div>
            <div className="hw-view">
              <div className="hw-track" data-track="">
                {content.howItWorks.cards.map((s, i) => (
                  <article className="card" key={i}>
                    <div className="card-top">
                      <span className="card-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                      <span className="card-ic"><CardIcon d={LANDING_ICON_PATHS[s.icon] ?? LANDING_ICON_PATHS.calendar} /></span>
                    </div>
                    <div>
                      <h3 className="card-title">{s.title}</h3>
                      <p className="card-desc">{s.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="wrap"><div className="hw-progress"><span /></div></div>
          </div>
        </div>
      </section>

      {/* ================= JOURNEY ================= */}
      <section className="journey" data-journey="" aria-labelledby="journey-h">
        <div className="wrap">
          <div className="j-head">
            <div className="j-head-l">
              <p className="label" style={{ color: '#6A6158' }}><span className="label-idx">04</span>Your journey</p>
              <h2 id="journey-h" className="display j-title mh" data-reveal="">
                {'Your journey'.split(' ').map((w, i) => (
                  <span className="w" key={i}><span style={vars({ '--i': i })}>{w}</span></span>
                ))}
              </h2>
            </div>
          </div>
          <div className="j-wrap">
            <div className="j-rail" aria-hidden="true"><span /></div>
            <ol className="j-steps">
              {content.journey.steps.map((t, i) => (
                <li className="j-step" style={vars({ '--k': (i / Math.max(1, content.journey.steps.length - 1) * 0.94).toFixed(3) })} key={i}>
                  <span className="j-dot" aria-hidden="true"><span className="j-dot-fill" /><span className="j-dot-n">{i + 1}</span></span>
                  <p className="j-name">{t}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="faq">
        <div className="wrap faq-grid">
          <div className="faq-side">
            <p className="label" style={{ color: '#6A6158' }}><span className="label-idx">05</span>FAQ</p>
            <h2 className="display faq-title mh" data-reveal="">
              {content.faq.title.split(' ').map((w, i) => (
                <span className="w" key={i}><span style={vars({ '--i': i })}>{w}</span></span>
              ))}
            </h2>
            <p className="faq-help rv" data-reveal="" style={vars({ '--d': 2 })}>
              {content.faq.intro} <Link to="/login">log in here</Link>.
            </p>
          </div>
          <div className="faq-list">
            {content.faq.items.map((f, i) => {
              const open = i === openFaq;
              const bid = `faq-q-${i}`;
              const pid = `faq-a-${i}`;
              return (
                <div className={`q${open ? ' is-open' : ''}`} key={i}>
                  <h3 style={{ margin: 0, fontSize: 'inherit' }}>
                    <button type="button" className="q-btn" id={bid} aria-expanded={open} aria-controls={pid} onClick={() => setOpenFaq(open ? -1 : i)}>
                      <span>{f.question}</span><span className="q-ic" aria-hidden="true" />
                    </button>
                  </h3>
                  <div className="q-panel" id={pid} role="region" aria-labelledby={bid}>
                    <div><p className="q-ans">{f.answer}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="cta" aria-labelledby="cta-h" data-cta="">
        <div className="cta-glow" data-par="0.2" />
        <div className="wrap">
          <h2 id="cta-h" className="display cta-title mh" data-reveal="">
            {content.cta.title.split(' ').map((w, i) => (
              <span className="w" key={i}><span style={vars({ '--i': i })}>{w}</span></span>
            ))}
          </h2>
          <p className="cta-sub rv" data-reveal="" style={vars({ '--d': 3 })}>{content.cta.body}</p>
          <div className="cta-actions rv" data-reveal="" style={vars({ '--d': 4 })}>
            <a className="btn btn-primary" href={registrationLink} target="_blank" rel="noopener noreferrer">
              <RollBtn>Register for FOF</RollBtn>
              <span className="btn-ic"><ArrowIcon /></span>
            </a>
            <p className="cta-login">Already in FOF?<Link to="/login">Members login</Link></p>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="footer">
        <div className="wrap">
          <div className="foot-top">
            <a className="foot-brand" href="https://www.tcnikorodu.org" target="_blank" rel="noopener noreferrer">
              <img src="/logo-mark.png" alt="" width={52} height={52} />
              <div>
                <p className="foot-name">Foundation of Faith · The Covenant Nation, Ikorodu</p>
                <p className="foot-small">{content.footer.address}<br />{content.footer.serviceTimes}</p>
              </div>
            </a>
            <div className="foot-col">
              <p className="label foot-col-h">Explore</p>
              <div className="foot-links">
                {NAV_ITEMS.map((n) => (
                  <a key={n.id} href={`#${n.id}`} onClick={smoothScrollTo(n.id)}>{n.label}</a>
                ))}
              </div>
            </div>
            <div className="foot-col">
              <p className="label foot-col-h">Connect</p>
              <div className="foot-links">
                {content.footer.social.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
                ))}
                <Link to="/login">Members login</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="foot-word" aria-hidden="true">Foundation of Faith</div>
        <div className="wrap foot-bottom">
          <span>© 2026 TCN Ikorodu</span>
          <span>{content.footer.bottomTagline}</span>
        </div>
      </footer>

      {/* ================= MOBILE REGISTER BAR ================= */}
      <div className={`mbar${mbarOn ? ' is-on' : ''}`}>
        <a className="btn btn-primary" href={registrationLink} target="_blank" rel="noopener noreferrer">
          <RollBtn>Register for FOF</RollBtn>
          <span className="btn-ic"><ArrowIcon /></span>
        </a>
      </div>
    </div>
  );
};

export default LandingPage;
