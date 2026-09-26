import type { HubJob } from '../../types';

// ── Hub jobs: one source of truth for label, pill colour and plain-English ──
// explanation of what each job does. Shared by My Hub (member pills, role
// intro popup) and, later, the support Home page.

export interface HubJobInfo {
  label: string;
  /** "Smooth Pill" surface + text classes, no border. */
  pill: string;
  /** Short one/two sentence explanation, for a tap-to-reveal InfoTip. */
  description: string;
  /** Friendlier "you're the X" text for the first-time role intro popup. */
  introBody: string;
}

export const HUB_JOB_INFO: Record<HubJob, HubJobInfo> = {
  HUB_LEAD: {
    label: 'Hub Lead',
    pill: 'bg-violet-100/80 text-violet-700',
    description: 'Runs the hub and makes announcements.',
    introBody: 'You run this hub. You lead the Announcements step of the hub meeting, and you can message everyone in the hub.',
  },
  ASSISTANT_HUB_LEAD: {
    label: 'Assistant Hub Lead',
    pill: 'bg-sky-100/80 text-sky-700',
    description: 'Makes sure the hub meeting happens and everyone attends.',
    introBody: "You help make sure the hub meeting happens and everyone turns up. The hub lead chooses which parts you can open — the meeting time, attendance, or messaging — so ask them if something looks locked.",
  },
  RECAP_LEAD: {
    label: 'Recap Lead',
    pill: 'bg-indigo-100/80 text-indigo-700',
    description: 'Leads Review & Recap in the hub meeting.',
    introBody: "You lead the Review & Recap part of the hub meeting — walking the hub through what was covered that week.",
  },
  PRAYER_LEAD: {
    label: 'Prayer Lead',
    pill: 'bg-emerald-100/80 text-emerald-700',
    description: 'Leads prayer in the hub meeting.',
    introBody: 'You lead prayer in the hub meeting — first for hub members, then for the participants shared on the prayer list.',
  },
  IT_SUPPORT: {
    label: 'IT Support',
    pill: 'bg-neutral-100 text-neutral-600',
    description: 'Operational support covering two or more hubs.',
    introBody: "You're operational support for this hub (and maybe others) — helping out without being tied to just one hub.",
  },
};

/** Display order for a member's job pills. */
export const HUB_JOB_ORDER: HubJob[] = ['HUB_LEAD', 'ASSISTANT_HUB_LEAD', 'RECAP_LEAD', 'PRAYER_LEAD', 'IT_SUPPORT'];

export const sortHubJobs = (jobs: HubJob[]): HubJob[] =>
  [...jobs].sort((a, b) => HUB_JOB_ORDER.indexOf(a) - HUB_JOB_ORDER.indexOf(b));
