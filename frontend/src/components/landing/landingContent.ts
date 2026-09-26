// -----------------------------------------------------------------------
// Editable copy for the public FOF landing page (fof.tcnikorodu.org).
//
// DEFAULT_LANDING_CONTENT is the copy the page ships with — it matches the
// design mockup exactly. An admin can override any of it from Settings >
// Website (AdminWebsitePage.tsx), stored as one JSON blob on the
// 'landing_content' AppSetting (see settingsApi.getLandingContent /
// setLandingContent, and the public_fof_landing() migration that exposes
// it to signed-out visitors).
//
// LandingPage.tsx always renders `deepMerge(DEFAULT_LANDING_CONTENT, saved)`
// — a saved value with only some fields set still gets sensible defaults
// for everything else, and a totally empty/missing saved value renders
// identically to the un-edited page.
// -----------------------------------------------------------------------

export type LandingIconKey = 'calendar' | 'people' | 'phone' | 'seedling' | 'app';

/** The only icons an admin can pick for a "How it works" card — kept to a
 * small fixed set so every icon always renders (no free-form SVG input). */
export const LANDING_ICON_OPTIONS: Array<{ key: LandingIconKey; label: string; d: string }> = [
  { key: 'calendar', label: 'Calendar', d: 'M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z' },
  { key: 'people', label: 'People', d: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 9v-1a3 3 0 0 0-2.2-2.9M16.5 5.2a3 3 0 0 1 0 5.6' },
  { key: 'phone', label: 'Phone', d: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2' },
  { key: 'seedling', label: 'Seedling', d: 'M12 21v-7m0 0c-4 0-7-3-7-7 4 0 7 2 7 7Zm0 0c0-5 3-7 7-7 0 4-3 7-7 7Z' },
  { key: 'app', label: 'App', d: 'M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm4 14h2' },
];

export const LANDING_ICON_PATHS: Record<LandingIconKey, string> = LANDING_ICON_OPTIONS.reduce(
  (acc, opt) => ({ ...acc, [opt.key]: opt.d }),
  {} as Record<LandingIconKey, string>
);

export interface LandingAboutSegment {
  text: string;
  /** Bold + dark, vs. the muted default weight — the "scroll scrub" effect
   * darkens every word as you scroll, strong words just start off bolder. */
  strong: boolean;
}

export interface LandingStat {
  value: string;
  /** The small orange mark right after the value — normally just "." */
  suffix: string;
  caption: string;
}

export interface LandingCurriculumItem {
  title: string;
  description: string;
}

export interface LandingHowItWorksCard {
  title: string;
  body: string;
  icon: LandingIconKey;
}

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export interface LandingSocialLink {
  label: string;
  url: string;
}

export interface LandingContent {
  hero: {
    /** Lines shown in the plain (cream) colour, top to bottom. */
    lines: string[];
    /** Final line, shown in the orange accent colour. */
    accentLine: string;
    subtitle: string;
    /** Short facts read out under the buttons, e.g. "10 weeks". */
    facts: string[];
    scrollLabel: string;
  };
  marquee: {
    words: string[];
  };
  about: {
    segments: LandingAboutSegment[];
    stats: LandingStat[];
  };
  curriculum: {
    intro: string;
    items: LandingCurriculumItem[];
  };
  photos: {
    classLabel: string;
    classLocation: string;
    groupLabel: string;
    groupLocation: string;
  };
  howItWorks: {
    intro: string;
    cards: LandingHowItWorksCard[];
  };
  journey: {
    steps: string[];
  };
  faq: {
    title: string;
    /** Text before the fixed "log in here" link — the page always appends
     * that link + a period so it keeps working no matter what's typed here. */
    intro: string;
    items: LandingFaqItem[];
  };
  cta: {
    title: string;
    body: string;
  };
  footer: {
    address: string;
    serviceTimes: string;
    social: LandingSocialLink[];
    bottomTagline: string;
  };
}

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  hero: {
    lines: ['Build your life', 'on a firm'],
    accentLine: 'foundation.',
    subtitle: 'A 10-week course to help you grow deep roots in Christ and find your home in the church.',
    facts: ['10 weeks', 'Every Sunday', 'Free'],
    scrollLabel: 'Scroll',
  },
  marquee: {
    words: ['Belong', 'Believe', 'Become', 'Foundation of Faith', 'Belong', 'Believe', 'Become', 'Ten weeks'],
  },
  about: {
    segments: [
      { text: 'Foundation of Faith', strong: true },
      { text: 'is', strong: false },
      { text: 'The Covenant Nation Ikorodu’s', strong: true },
      { text: '10-week foundational course for new believers, new members and anyone wanting a refresher —', strong: false },
      { text: 'anchoring you in biblical truth', strong: true },
      { text: 'and helping you', strong: false },
      { text: 'find your home in the church.', strong: true },
    ],
    stats: [
      { value: '10', suffix: '.', caption: 'Weeks of teaching, one Sunday class at a time.' },
      { value: '05', suffix: '.', caption: 'Rhythms that walk with you — class, group, calls, project and app.' },
      { value: '₦0', suffix: '.', caption: 'Foundation of Faith is completely free.' },
    ],
  },
  curriculum: {
    intro: 'Ten Sundays. Ten foundations to anchor you in biblical truth.',
    items: [
      { title: 'Introductory Class', description: 'Welcome to FOF — what the next 10 weeks look like, and why it matters.' },
      { title: 'New Creation Realities', description: 'Who you are now in Christ — not who you used to be.' },
      { title: 'Integrity of God’s Word', description: 'Why the Bible can be trusted as God’s final word on every matter.' },
      { title: 'The Holy Spirit', description: 'Meeting the Helper who now lives in every believer.' },
      { title: 'What is Faith?', description: 'How simple trust in God’s Word changes everything about your life.' },
      { title: 'Praise & Worship', description: 'Why we worship, and how to worship from the heart, not just the lips.' },
      { title: 'Prayer', description: 'Learning to talk with God like He’s really listening — because He is.' },
      { title: 'Love', description: 'God’s love for you, and the love He calls you to walk in with others.' },
      { title: 'Service', description: 'Finding your place to serve and belong in the local church.' },
      { title: 'A Date with Pastor Shola', description: 'A closing session with the Senior Pastor to send you off well.' },
    ],
  },
  photos: {
    classLabel: 'Sunday class',
    classLocation: 'Dream Park & Gardens',
    groupLabel: 'Your small group',
    groupLocation: 'Weekly',
  },
  howItWorks: {
    intro: 'Five rhythms carry you through the ten weeks — so you never walk the journey alone.',
    cards: [
      { title: 'Sunday class', body: 'A weekly class at church, every Sunday.', icon: 'calendar' },
      { title: 'Your small group', body: 'A support walks with you every step, in a group of your own.', icon: 'people' },
      { title: 'Weekly group call', body: 'Your group prays, recaps the week’s class and shares life together.', icon: 'phone' },
      { title: 'Your Faith Project', body: 'A personal step of faith you choose — and grow in — over the 10 weeks.', icon: 'seedling' },
      { title: 'The FOF app', body: 'Your week, class recaps, reflections and your group — all in one place.', icon: 'app' },
    ],
  },
  journey: {
    steps: ['Register', 'A support reaches out', 'Get your login', '10 weeks of classes and your group', 'Graduate and join a department'],
  },
  faq: {
    title: 'Good questions',
    intro: 'Already registered? Your support sends your login on WhatsApp once you’re added to a group — then',
    items: [
      { question: 'Who is FOF for?', answer: 'New believers, new members of The Covenant Nation Ikorodu, and anyone who wants a refresher on the foundations of the faith.' },
      { question: 'Does it cost anything?', answer: 'No — Foundation of Faith is completely free.' },
      { question: 'How much time does it take?', answer: 'A Sunday class each week, plus a short weekly group call with your small group.' },
      { question: 'What if I miss a class?', answer: 'Your support will help you catch up. To complete the course, you’ll need to attend all Sunday classes.' },
      { question: 'I already registered — how do I log in?', answer: 'Your support sends your login details on WhatsApp once you’re added to a group. Then just tap “Members login” at the top of this page.' },
    ],
  },
  cta: {
    title: 'Ready to start?',
    body: 'Registration is open, and Foundation of Faith is completely free. Your first step is a short form.',
  },
  footer: {
    address: 'Dream Park & Gardens, Ikorodu, Lagos',
    serviceTimes: 'Sunday services · 7:15 AM & 9:00 AM',
    social: [
      { label: 'tcnikorodu.org', url: 'https://www.tcnikorodu.org' },
      { label: 'Instagram', url: 'https://instagram.com/tcnikorodu' },
      { label: 'Facebook', url: 'https://facebook.com/tcnikorodu' },
    ],
    bottomTagline: 'Belong · Believe · Become',
  },
};

type PlainObject = Record<string, unknown>;
const isPlainObject = (v: unknown): v is PlainObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Recursively fills in anything missing from `override` using `base`.
 * Arrays are replaced wholesale when `override` provides one (so an admin
 * can add/remove/reorder list items) — never merged element-by-element,
 * which would corrupt row order/length. A malformed `override` (wrong
 * type at any level) is ignored in favour of `base` at that point. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as unknown as T;
  }
  if (isPlainObject(base)) {
    if (!isPlainObject(override)) return base;
    const result: PlainObject = { ...(base as PlainObject) };
    for (const key of Object.keys(base as PlainObject)) {
      result[key] = deepMerge((base as PlainObject)[key], override[key]);
    }
    return result as T;
  }
  // Primitive: use the override only if it's the same type as the default.
  return (typeof override === typeof base ? override : base) as T;
}

/** `deepMerge(DEFAULT_LANDING_CONTENT, saved)` — what LandingPage.tsx and
 * the admin editor's "current value" both render from. */
export function resolveLandingContent(saved: unknown): LandingContent {
  return deepMerge(DEFAULT_LANDING_CONTENT, saved);
}
