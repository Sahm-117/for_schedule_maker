import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import ConfirmationModal from '../ConfirmationModal';
import { useToast } from '../Toast';
import { announcementsApi } from '../../services/api';
import { buildWhatsAppLink } from '../../utils/phone';
import type { ThisWeekItem } from './thisWeekItems';

// "This week" on the admin Supports and Group meetings pages (FLOW_MAP rule 126): the few things to chase now, each
// with the people it is about. A name opens a WhatsApp chat with a ready message; "Remind in the app" sends one
// bell-and-push announcement to just those supports. Nothing is sent without the admin pressing it.

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// Names shown before "+N more", so a long list doesn't push the page down on a phone.
const NAMES_SHOWN = 8;

const SupportsThisWeek: React.FC<{ items: ThisWeekItem[]; cohortId: string | null; senderId: string | null; weekLabel: string }> = ({ items, cohortId, senderId, weekLabel }) => {
  const toast = useToast();
  const [confirming, setConfirming] = useState<ThisWeekItem | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const shown = items.filter((i) => i.people.length > 0);

  const remind = async () => {
    if (!confirming?.remind || !senderId) return;
    // A group with no support is listed by name only; only supports get the reminder.
    const ids = confirming.people.filter((p) => !p.notAPerson).map((p) => p.id);
    if (ids.length === 0) { setConfirming(null); return; }
    setSending(true);
    try {
      await announcementsApi.send(confirming.remind.subject, confirming.remind.body, senderId, {
        scope: cohortId ? 'ACTIVE_COHORT' : 'ALL_USERS',
        cohortId,
        audience: 'SUPPORTS',
        ...(ids.length === 1 ? { targetUserId: ids[0] } : { targetUserIds: ids }),
      });
      setSent((prev) => new Set(prev).add(confirming.key));
      toast({ message: `Reminder sent to ${ids.length} support${ids.length === 1 ? '' : 's'}` });
      setConfirming(null);
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not send the reminder.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="surface-card p-4 sm:p-5" aria-labelledby="supports-this-week">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="supports-this-week" className="text-base font-semibold text-gray-900">This week</h2>
        <span className="text-xs text-gray-500">{weekLabel}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">Nothing to chase: every group has a support and a meeting time, and the reports are in.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {shown.map((item) => (
            <li key={item.key} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <div className="flex flex-wrap gap-2">
                  {item.remind && senderId && item.people.some((p) => !p.notAPerson) && (
                    <button
                      type="button"
                      disabled={sent.has(item.key)}
                      onClick={() => setConfirming(item)}
                      className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
                    >
                      {sent.has(item.key) ? 'Reminded' : 'Remind in the app'}
                    </button>
                  )}
                  {item.link && (
                    <NavLink to={item.link.to} className="inline-flex h-9 items-center rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-200">{item.link.label}</NavLink>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(expanded.has(item.key) ? item.people : item.people.slice(0, NAMES_SHOWN)).map((p) => {
                  const href = item.message && p.user ? buildWhatsAppLink(p.user.phone, item.message(firstName(p.name))) : null;
                  return href ? (
                    <a key={p.id} href={href} target="_blank" rel="noreferrer" title={`Message ${p.name} on WhatsApp`}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:border-primary hover:text-primary">
                      {p.name}<span aria-hidden="true" className="text-[10px] text-gray-400">↗</span>
                    </a>
                  ) : (
                    <span key={p.id} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{p.name}</span>
                  );
                })}
                {!expanded.has(item.key) && item.people.length > NAMES_SHOWN && (
                  <button type="button" onClick={() => setExpanded((prev) => new Set(prev).add(item.key))}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary-50">
                    +{item.people.length - NAMES_SHOWN} more
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmationModal
        isOpen={!!confirming}
        onClose={() => { if (!sending) setConfirming(null); }}
        onConfirm={() => { void remind(); }}
        title="Send a reminder in the app?"
        message={confirming ? `${confirming.people.filter((p) => !p.notAPerson).length} support${confirming.people.filter((p) => !p.notAPerson).length === 1 ? '' : 's'} will get "${confirming.remind?.subject}" on their bell and phone. It also shows under Announcements.` : ''}
        confirmText="Send reminder"
        type="info"
        confirmLoading={sending}
      />
    </section>
  );
};

export default SupportsThisWeek;
