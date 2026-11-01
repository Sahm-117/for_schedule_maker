import React, { useState } from 'react';
import ConfirmReachModal from './ConfirmReachModal';
import Spinner from './Spinner';
import { useToast } from './Toast';
import { notificationDeliveryApi } from '../services/api';
import type { Announcement, NotificationRecipient, NotificationSend } from '../types';

interface Found { send: NotificationSend; unread: NotificationRecipient[] }

const DAY_MS = 86_400_000;

// "Send again to those who haven't seen it", under an announcement in the history. Who has seen it is the
// bell row's read mark (the same one Notifications → Delivery shows); the nudge goes through the same
// reminder sender as there (`notificationDeliveryApi.remind`), so the announcement is not posted twice
// in the history. Only people who have not read it are reached.
const AnnouncementResend: React.FC<{ announcement: Announcement }> = ({ announcement }) => {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [found, setFound] = useState<Found[] | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      const sentAt = new Date(announcement.sentAt).getTime();
      const days = Math.min(90, Math.max(1, Math.ceil((Date.now() - sentAt) / DAY_MS) + 1));
      const sends = await notificationDeliveryApi.getSends(days);
      // One announcement is one or two batches (supports and participants); match them by text and time.
      const batches = sends.filter((s) => {
        if (s.type !== 'ANNOUNCEMENT' || !s.tracked || s.title !== announcement.subject || s.body !== announcement.body) return false;
        const at = new Date(s.sentAt).getTime();
        return at >= sentAt - 60_000 && at <= sentAt + 10 * 60_000;
      });
      if (batches.length === 0) {
        toast({ tone: 'info', message: "Can't tell who has seen this one. It may be too old, or it went out as a phone alert only." });
        return;
      }
      const entries = await Promise.all(batches.map(async (send) => ({
        send,
        unread: (await notificationDeliveryApi.getRecipients(send)).filter((r) => r.read === false),
      })));
      const total = entries.reduce((n, e) => n + e.unread.length, 0);
      if (total === 0) {
        toast({ message: 'Everyone has already seen it.' });
        return;
      }
      setFound(entries.filter((e) => e.unread.length > 0));
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error && err.message ? `Could not check who has seen it. ${err.message}` : 'Could not check who has seen it. Please try again.' });
    } finally {
      setChecking(false);
    }
  };

  const send = async () => {
    if (!found || found.length === 0) return;
    setSending(true);
    try {
      let reached = 0;
      for (const entry of found) {
        await notificationDeliveryApi.remind(entry.send, entry.unread.map((r) => ({ id: r.id, role: r.role })));
        reached += entry.unread.length;
      }
      toast({ message: `Sent again to ${reached} ${reached === 1 ? 'person' : 'people'}.` });
      setFound(null);
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error && err.message ? `That didn't send. ${err.message}` : "That didn't send. Please try again." });
    } finally {
      setSending(false);
    }
  };

  const names = (found ?? []).flatMap((e) => e.unread.map((r) => r.name));

  return (
    <>
      <button
        type="button"
        onClick={() => { void check(); }}
        disabled={checking}
        className="mt-2 text-[11px] font-semibold text-primary-dark hover:underline disabled:opacity-50"
      >
        {checking ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Checking…</span>) : "Send again to those who haven't seen it"}
      </button>
      <ConfirmReachModal
        isOpen={!!found}
        onClose={() => setFound(null)}
        onConfirm={() => { void send(); }}
        title="Send again?"
        message={`“${announcement.subject}” goes out again as “Reminder: ${announcement.subject}”, in the app and as a phone alert where they have alerts on. Only people who have not opened it yet.`}
        names={names}
        confirmText="Send again"
        busy={sending}
      />
    </>
  );
};

export default AnnouncementResend;
