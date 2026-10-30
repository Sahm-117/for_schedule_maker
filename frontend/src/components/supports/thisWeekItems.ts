import type { User } from '../../types';

// What the "This week" card lists (SupportsThisWeek, FLOW_MAP rule 126), and the two chases both the Supports and
// Group meetings pages build, so their wording stays the same.

export interface ThisWeekItem {
  key: string;
  /** "21 of 22 groups haven't marked their week 2 meeting done". */
  title: string;
  /** People this is about: supports to message, or plain names (a group with no support). */
  people: Array<{ id: string; name: string; user?: User | null; /** A group with no support: shown, never messaged or reminded. */ notAPerson?: boolean }>;
  /** The WhatsApp message for one person, given their first name. */
  message?: (firstName: string) => string;
  /** One in-app reminder to everyone listed. */
  remind?: { subject: string; body: string };
  link?: { to: string; label: string };
}

type ChasePeople = ThisWeekItem['people'];
export const meetingNotDoneItem = (week: number, notDone: number, total: number, people: ChasePeople): ThisWeekItem => ({
  key: `done-${week}`,
  title: `${notDone} of ${total} groups haven't marked their week ${week} meeting done`,
  people,
  message: (name) => `Hi ${name}, once your group has met this week, please mark the week ${week} meeting done on the FOF Ops app, with who joined and the report. Thank you!`,
  remind: { subject: `Week ${week} group meeting`, body: `Once your group has met, please mark the week ${week} meeting done on the app, with who joined and the report. Thank you!` },
});
export const noMeetingTimeItem = (count: number, people: ChasePeople, link?: ThisWeekItem['link']): ThisWeekItem => ({
  key: 'meeting-time',
  title: `${count} group${count === 1 ? ' has' : 's have'} no meeting day and time`,
  people,
  message: (name) => `Hi ${name}, please set your group's meeting day and time on the FOF Ops app (My Group), so your participants know when to join. Thank you!`,
  remind: { subject: 'Set your group meeting time', body: "Please set your group's meeting day and time on the app (My Group), so your participants know when to join." },
  link,
});
