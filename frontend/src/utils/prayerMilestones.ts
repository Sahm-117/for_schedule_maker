import type { PrayerMilestoneNumber } from '../types';

// The prayer streak badges: 5, 10, 21 and 30 days in a row, and "Full cohort" (a prayer on every prayer day of the programme; stored as 70).
// The colours are shared by the celebration screen, the badge row and the share picture.

export interface MilestoneTier {
  n: PrayerMilestoneNumber;
  name: string;
  bg: string;
  badge: string;
  fg: string;
  light: string;
  ring1: string;
  ring2: string;
  /** 24x24 SVG path. */
  icon: string;
  title: string;
  text: string;
  /** The line on the share picture. */
  pic: string;
}

export const MILESTONES: MilestoneTier[] = [
  { n: 5, name: 'Steady', bg: '#431407', badge: '#fb923c', fg: '#431407', light: '#fed7aa', ring1: 'rgba(251,146,60,0.28)', ring2: 'rgba(251,146,60,0.12)', icon: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z', title: '5 days in a row!', text: 'Five days of prayer. This is how a habit starts.', pic: '5 days of prayer' },
  { n: 10, name: 'Committed', bg: '#0c2a4d', badge: '#60a5fa', fg: '#0c2a4d', light: '#bfdbfe', ring1: 'rgba(96,165,250,0.28)', ring2: 'rgba(96,165,250,0.12)', icon: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z', title: '10 days in a row!', text: 'Ten days of showing up to pray. Keep it going.', pic: '10 days of prayer' },
  { n: 21, name: 'Habit', bg: '#052e24', badge: '#34d399', fg: '#052e24', light: '#a7f3d0', ring1: 'rgba(52,211,153,0.28)', ring2: 'rgba(52,211,153,0.12)', icon: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M11 1h2v3h-2z M11 20h2v3h-2z M1 11h3v2H1z M20 11h3v2h-3z', title: '21 days in a row!', text: 'Three weeks. Prayer is part of your day.', pic: '21 days of prayer' },
  { n: 30, name: 'Month', bg: '#2e1065', badge: '#a78bfa', fg: '#2e1065', light: '#ddd6fe', ring1: 'rgba(167,139,250,0.28)', ring2: 'rgba(167,139,250,0.12)', icon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z', title: '30 days in a row!', text: 'A whole month of prayer. You are building something that lasts.', pic: '30 days of prayer' },
  { n: 70, name: 'Full cohort', bg: '#3b2300', badge: '#fbbf24', fg: '#3b2300', light: '#fde68a', ring1: 'rgba(251,191,36,0.30)', ring2: 'rgba(251,191,36,0.13)', icon: 'M3 8l4.5 4L12 4l4.5 8L21 8l-2 12H5z', title: 'Every prayer day of the programme!', text: 'You prayed on every prayer day, to the very end. Thank God with us.', pic: 'Every day of prayer' },
];

export const milestoneTier = (n: number): MilestoneTier => MILESTONES.find((m) => m.n === n) ?? MILESTONES[0];
