import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import Avatar from '../Avatar';
import ClassDots from './ClassDots';
import { faithProjectsApi, participantNotesApi } from '../../services/api';
import { buildParticipantMessageLink } from '../../utils/phone';
import { normaliseAgeRange, normaliseGender } from '../../utils/groupingRules';
import { FAITH_PROJECT_STATUS_LABEL } from '../../utils/participantApp';
import type { ClassRecord } from '../../utils/participantClassDots';
import type { FaithProjectStatus, Participant, ParticipantNote, ProfileCompletion } from '../../types';

const NOTE_LABEL: Record<string, string> = {
  CHECK_IN: 'Check-in',
  MEETING: 'Group meeting note',
  HANDOVER: 'Handover note',
  FAITH_COACH: 'Faith project coaching',
  FAITH_OFFICE: 'Back office note',
};

interface ParticipantSidePanelProps {
  participant: Participant;
  supportName: string | null;
  isTeen: boolean;
  record: ClassRecord | undefined;
  /** Null while it is still loading. Only meaningful for adults. */
  signedIn: boolean | null;
  alertsOff: boolean;
  appLine: string;
  completion: ProfileCompletion | undefined;
  canAssign: boolean;
  onAssign: () => void;
  /** Button text; a teen on the teen path gets a Teen Support instead of a group. */
  assignLabel?: string;
  onClose: () => void;
  /** True while another dialog (e.g. Add to a group) is open on top: Escape then belongs to that dialog, not the panel. */
  escapeBlocked?: boolean;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="py-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    <div className="mt-1 text-sm text-gray-800">{children}</div>
  </div>
);

const pill = (cls: string, text: string) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{text}</span>;

/** Right-side panel on desktop, bottom sheet on a phone. The list behind it keeps its place. */
const ParticipantSidePanel: React.FC<ParticipantSidePanelProps> = ({ participant: p, supportName, isTeen, record, signedIn, alertsOff, appLine, completion, canAssign, onAssign, assignLabel = 'Add to a group', onClose, escapeBlocked = false }) => {
  const [faith, setFaith] = useState<FaithProjectStatus | null | undefined>(undefined);
  const [notes, setNotes] = useState<ParticipantNote[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFaith(undefined);
    setNotes(null);
    faithProjectsApi.getByParticipant(p.id).then((r) => { if (!cancelled) setFaith(r.projects[0]?.status ?? null); }).catch(() => { if (!cancelled) setFaith(null); });
    participantNotesApi.getForParticipants([p.id]).then((r) => { if (!cancelled) setNotes(r.notes.filter((n) => !n.byParticipant).slice(0, 3)); }).catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [p.id]);

  // Escape closes the panel, unless a dialog sits on top of it (the page says so, or any modal dialog is on screen).
  // The latest onClose / escapeBlocked live in a ref, so the listener is added once, not on every render.
  const latest = useRef({ onClose, escapeBlocked });
  latest.current = { onClose, escapeBlocked };
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || latest.current.escapeBlocked) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    latest.current.onClose();
  }, []);
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKey]);

  const gender = normaliseGender(p.gender);
  const age = normaliseAgeRange(p.ageRange) ?? p.ageRange ?? null;
  // A teen's number is their guardian's and is never offered as a Call or WhatsApp button (FLOW_MAP rule 48).
  const waLink = !isTeen ? buildParticipantMessageLink(p.phone, p.fullName) : null;
  const telLink = !isTeen && p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : null;

  return createPortal(
    <div className="fixed inset-0 z-50 md:pointer-events-none">
      {/* Phones dim the page behind the sheet; on a wide screen the list stays usable beside the panel. */}
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/45 md:hidden" />
      <aside
        role="dialog"
        aria-label={`${p.fullName} details`}
        className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:inset-x-auto md:bottom-0 md:right-0 md:top-0 md:max-h-none md:w-[400px] md:rounded-none md:rounded-l-3xl"
      >
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <Avatar name={p.fullName} avatarUrl={p.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight text-gray-900">{p.fullName}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {[p.phone ? `${isTeen ? 'Guardian ' : ''}${p.phone}` : null, gender, age].filter(Boolean).join(' · ') || 'No details yet'}
            </p>
            {(waLink || telLink) && (
              <div className="mt-2 flex gap-2">
                {telLink && <a href={telLink} className="rounded-2xl bg-gray-100 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Call</a>}
                {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-emerald-100/80 px-4 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-95">WhatsApp</a>}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-xl p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 divide-y divide-gray-100 overflow-y-auto px-5">
          <Row label="Group">
            {p.groupName ? p.groupName : (
              <span className="inline-flex items-center gap-3">
                <span className="text-gray-500">Not in a group yet</span>
                {canAssign && <button type="button" onClick={onAssign} className="rounded-2xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-white active:scale-95">{assignLabel}</button>}
              </span>
            )}
          </Row>
          <Row label="Support">{supportName ?? <span className="text-gray-400">—</span>}</Row>
          <Row label="Classes">
            {record ? (
              <div className="flex flex-col gap-1.5">
                <ClassDots record={record} dotsOnly />
                <span className="text-xs font-medium text-gray-600">{record.counted > 0 ? `${record.attended} of ${record.counted} classes attended` : 'No marks yet'}</span>
                {record.missedTwo && <span className="text-xs font-semibold text-amber-700">Missed 2 in a row</span>}
              </div>
            ) : <span className="text-gray-400">No classes finished yet</span>}
          </Row>
          <Row label="Faith project">
            {faith === undefined ? <span className="text-gray-400">…</span>
              : pill(faith === 'SAVED' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600', FAITH_PROJECT_STATUS_LABEL[faith ?? 'NOT_DRAFTED'])}
          </Row>
          <Row label="App">
            {isTeen ? <span className="text-gray-500">Teens have no login; their Teen Support looks after them.</span> : (
              <div className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  {signedIn === null ? <span className="text-gray-400">…</span>
                    : signedIn ? pill('bg-emerald-100/80 text-emerald-700', 'Signed in') : pill('bg-amber-100/80 text-amber-700', 'Never signed in')}
                  {alertsOff && pill('bg-neutral-100 text-neutral-600', 'Alerts off')}
                </span>
                {appLine && <span className="text-xs text-gray-500">{appLine}</span>}
              </div>
            )}
          </Row>
          <Row label="Profile">
            {completion ? (completion.missing === 0 ? 'Complete' : `${completion.percent}% complete · ${completion.missing} ${completion.missing === 1 ? 'detail' : 'details'} missing`) : <span className="text-gray-400">—</span>}
          </Row>
          <Row label="Notes from their support">
            {notes === null ? <span className="text-gray-400">…</span> : notes.length === 0 ? <span className="text-gray-400">No notes yet</span> : (
              <ul className="flex flex-col gap-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-2xl bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-semibold text-gray-500">
                      {NOTE_LABEL[n.noteType] ?? 'Note'}{n.authorName ? ` · ${n.authorName}` : ''} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}
                    </p>
                    <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-[13px] text-gray-700">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        </div>

        <div className="border-t border-gray-100 bg-white/80 px-5 py-4 backdrop-blur-xl">
          <NavLink to={`/participants/${p.id}`} className="flex items-center justify-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95">
            Open full profile →
          </NavLink>
        </div>
      </aside>
    </div>,
    document.body,
  );
};

export default ParticipantSidePanel;
