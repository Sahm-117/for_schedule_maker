import type { ParticipantAppInfo } from '../types';

const DEVICE_LABEL: Record<string, string> = {
  ios: 'iPhone',
  'ios-inapp': 'iPhone (in-app browser)',
  android: 'Android',
  desktop: 'Computer',
};

// Dates are shown in Lagos time, like the rest of the programme, and carry the year once it is not
// this year, so a date from last year cannot pass for a recent one.
const LAGOS = 'Africa/Lagos';
const shortDay = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const thisYear = new Date().toLocaleDateString('en-GB', { year: 'numeric', timeZone: LAGOS });
  const year = d.toLocaleDateString('en-GB', { year: 'numeric', timeZone: LAGOS });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year !== thisYear ? { year: 'numeric' } : {}), timeZone: LAGOS });
};

/** Exported for the staff table, which says the same thing in its own words. */
export const STAFF_NOT_OPENED_HINT = 'Has never opened the app from their Home Screen.';

/**
 * One short line for a participant's card: their phone and the last time the signed-in app ran for
 * them (on the Home Screen or in a browser), for example "iPhone · seen 8 Oct". Useful to every
 * support and admin; whether they use the Home Screen app is the separate "Not opened" tag.
 */
export const appUseLine = (info: ParticipantAppInfo | undefined | null): string => {
  if (!info) return '';
  const phone = info.device ? DEVICE_LABEL[info.device] : '';
  const seen = info.lastSeenAt ? shortDay(info.lastSeenAt) : '';
  return [phone, seen ? `seen ${seen}` : ''].filter(Boolean).join(' · ');
};

/** The tooltip on the "Not opened from Home Screen" tag, which says what it means and what to do. */
export const NOT_OPENED_HINT = 'They have signed in, but the app has never been opened from their Home Screen. Adding the icon is not enough: they must open that icon and sign in inside it (on an iPhone it asks them to sign in again). A plain letter icon is only a shortcut to the website.';
