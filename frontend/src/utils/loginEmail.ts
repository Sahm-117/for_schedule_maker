import { participantAccountsApi, participantsApi } from '../services/api';
import type { FollowUpContact, ParticipantLoginDetails } from '../types';
import { installVideoLines } from '../constants/installVideos';

// Login details by email, for when calls and WhatsApp don't get through. Used by
// "Their login details" (Send by email) and by Send email on a registered follow-up.

export const LOGIN_EMAIL_SUBJECT = 'Your Foundation of Faith app login';

// Follow-ups at these stages have a login to send.
export const hasLoginToSend = (contact: Pick<FollowUpContact, 'registrationStatus'>) =>
  contact.registrationStatus === 'REGISTERED'
  || contact.registrationStatus === 'LOGIN_SHARED'
  || contact.registrationStatus === 'LOGIN_ISSUE';

// "October 11" while the first class is still ahead; otherwise just "Sunday".
export const firstClassText = (startDate?: string | null) => {
  if (!startDate) return 'Sunday';
  const date = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 12 * 60 * 60 * 1000) return 'Sunday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

type Sender = { name?: string | null; phone?: string | null } | null | undefined;

// Says why they're getting an email, who is writing, and how to reply.
export const buildLoginEmailBody = (details: ParticipantLoginDetails, sender: Sender, startDate?: string | null) => {
  if (!details.setupCode) return '';
  const firstName = (details.name || '').split(' ')[0];
  const senderName = sender?.name?.trim() || '';
  const senderPhone = sender?.phone?.trim() || '';
  return `Hello ${firstName},\n\n`
    + 'We tried to reach you by phone and on WhatsApp, but couldn\'t get through, so we\'re sending your details by email instead.\n\n'
    + (senderName ? `My name is ${senderName}, from TCN Ikorodu. ` : '')
    + 'Well done on registering for Foundation Of Faith! Here are your login details for the FOF App:\n\n'
    + `App link: https://fof.tcnikorodu.org/login\n`
    + `Username: ${details.phone}\n`
    + `First-time password: ${details.setupCode}\n\n`
    + `${installVideoLines()}\n\n`
    + 'You will be asked to set your own password when you first sign in.\n\n'
    + (senderPhone
      ? `If you have any questions, reply to this email or reach me on ${senderPhone}. `
      : 'If you have any questions, just reply to this email. ')
    + 'If the phone number we have for you isn\'t right, please reply with a number we can reach you on.\n\n'
    + `See you on ${firstClassText(startDate)}.`
    + (senderName ? `\n\n${senderName}\nFoundation of Faith, TCN Ikorodu` : '');
};

export const buildLoginMailLink = (email: string | null | undefined, body: string) => {
  const to = email?.trim() || '';
  return to && body
    ? `mailto:${to}?subject=${encodeURIComponent(LOGIN_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`
    : null;
};

type LoginTarget = { participantId?: string | null; followUpContactId?: string | null };

// Loads the login details, creating the first-time code when asked to issue one.
export const fetchLoginDetails = async (target: LoginTarget, options: { issue?: boolean; newCode?: boolean }) => {
  let result = await participantAccountsApi.getLoginDetails(target, options);
  // A prospect just marked Registered gets its participant record a moment later,
  // so when sending, wait briefly before calling it missing.
  for (let attempt = 0; options.issue && result.status === 'NO_PARTICIPANT' && attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    result = await participantAccountsApi.getLoginDetails(target, options);
  }
  // Registered always means Participant. Older registrations may predate that
  // hand-off, so repair the record automatically rather than asking support to
  // decide or perform a back-office task.
  if (options.issue && result.status === 'NO_PARTICIPANT' && target.followUpContactId) {
    await participantsApi.ensureFromFollowUpContact(target.followUpContactId);
    result = await participantAccountsApi.getLoginDetails(target, options);
  }
  return result;
};

// Send email on a registered follow-up: opens the email app with their login
// details. Returns why it couldn't, so the caller can fall back to the templates.
export const emailLoginDetails = async (
  contact: Pick<FollowUpContact, 'id' | 'email' | 'cohortStartDate'>,
  sender: Sender,
): Promise<'opened' | 'password-set' | 'not-ready'> => {
  const details = await fetchLoginDetails({ followUpContactId: contact.id }, { issue: true });
  if (details.status === 'ACTIVE') return 'password-set';
  const link = buildLoginMailLink(contact.email, buildLoginEmailBody(details, sender, contact.cohortStartDate));
  if (!link) return 'not-ready';
  window.location.href = link;
  return 'opened';
};
