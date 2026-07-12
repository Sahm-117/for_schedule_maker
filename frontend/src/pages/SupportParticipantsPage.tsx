import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import GroupMeetingSlotEditor, { type MeetingSlot } from '../components/GroupMeetingSlotEditor';
import ModalShell from '../components/followups/ModalShell';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import {
  faithProjectsApi,
  groupOnboardingStatusApi,
  groupPrayerFocusApi,
  groupPrayerStatusApi,
  groupsApi,
  participantHandoversApi,
  participantNotesApi,
  participantsApi,
} from '../services/api';
import type {
  FaithProject,
  FaithProjectReviewEntry,
  FaithProjectStatus,
  Group,
  GroupOnboardingStatus,
  GroupPrayerFocus,
  GroupPrayerStatus,
  Participant,
  ParticipantHandover,
  ParticipantNote,
  Week,
} from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import { sortByText } from '../utils/sort';

type GroupTab = 'faith' | 'prayers';

const STATUS_OPTIONS: Array<{ value: FaithProjectStatus; label: string; cls: string }> = [
  { value: 'NOT_DRAFTED', label: 'Not Drafted', cls: 'bg-neutral-100 text-neutral-600' },
  { value: 'AWAITING_DRAFT', label: 'Awaiting Draft', cls: 'bg-sky-100/80 text-sky-700' },
  { value: 'UNDER_REFINEMENT', label: 'Under Refinement', cls: 'bg-amber-100/80 text-amber-700' },
  { value: 'NEEDS_REFINEMENT', label: 'Needs Refinement', cls: 'bg-orange-100/80 text-orange-700' },
  { value: 'APPROVED', label: 'Approved', cls: 'bg-emerald-100/80 text-emerald-700' },
];

// Support can only set NOT_DRAFTED, AWAITING_DRAFT, or UNDER_REFINEMENT — admin controls NEEDS_REFINEMENT and APPROVED.
const FAITH_PROJECT_SELECT_OPTIONS = [
  { value: 'NOT_DRAFTED', label: 'Not Drafted', meta: 'No draft has been started yet' },
  { value: 'AWAITING_DRAFT', label: 'Awaiting Draft', meta: 'Participant engaged on Faith Project — no draft yet' },
  { value: 'UNDER_REFINEMENT', label: 'Under Refinement', meta: 'Draft exists and is being refined' },
];

const PRAYER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Not done yet', meta: 'Group prayer is still pending for this week' },
  { value: 'done', label: 'Done', meta: 'Group prayer has been completed for this week' },
];

const statusCls = (status: FaithProjectStatus) => STATUS_OPTIONS.find((option) => option.value === status)?.cls ?? 'bg-neutral-100 text-neutral-600';
const statusLabel = (status: FaithProjectStatus) => STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;

const virtualGroupStatus = (groupId: string, groupName: string | null | undefined, participantCount: number): GroupOnboardingStatus => ({
  id: `virtual-${groupId}`,
  groupId,
  groupName: groupName ?? 'Untitled group',
  supportId: null,
  supportName: null,
  participantCount,
  groupCreated: false,
  updatedById: null,
  updatedByName: null,
  updatedAt: undefined,
  completedAt: null,
});

const CopyPhoneButton: React.FC<{ phone?: string | null }> = ({ phone }) => {
  const [copied, setCopied] = useState(false);
  if (!phone) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(phone);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50/70 px-2.5 py-1 text-xs font-semibold text-gray-500 transition-colors hover:border-orange-200 hover:bg-orange-100 hover:text-primary"
      title="Copy phone number"
      aria-label={`Copy phone number ${phone}`}
    >
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a1.125 1.125 0 0 0-1.173.417l-.97 1.293a1.125 1.125 0 0 1-1.21.38 12.035 12.035 0 0 1-7.143-7.143 1.125 1.125 0 0 1 .38-1.21l1.293-.97a1.125 1.125 0 0 0 .417-1.173L6.963 3.102A1.125 1.125 0 0 0 5.872 2.25H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
      </svg>
      <span className="truncate">{phone}</span>
      {copied ? (
        <span className="flex-shrink-0 text-[11px] text-emerald-600">Copied</span>
      ) : (
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2Z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
};

// Read-only registration details (from the church platform / Google Form).
// Always renders every field; empty values show "—" so supports can see what's
// missing. Used inside the per-participant "More details" accordion.
const RegistrationDetails: React.FC<{ participant: Participant }> = ({ participant }) => {
  const { email, gender, ageRange, departments, registrationDate, smartRequest } = participant;
  const regDate = registrationDate ? registrationDate.slice(0, 10) : null;
  const dash = <span className="text-gray-400">—</span>;

  const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5 break-words text-sm text-gray-700">{children}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Row label="Email">{email ? <span className="break-all">{email}</span> : dash}</Row>
      <Row label="Gender">{gender || dash}</Row>
      <Row label="Age range">{ageRange || dash}</Row>
      <Row label="Registration date">{regDate || dash}</Row>
      <div className="sm:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Department(s)</p>
        {departments && departments.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {departments.map((d) => (
              <span key={d} className="max-w-full break-words rounded-full bg-indigo-100/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{d}</span>
            ))}
          </div>
        ) : <div className="mt-0.5 text-sm">{dash}</div>}
      </div>
      <div className="sm:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">SMART request</p>
        {smartRequest ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{smartRequest}</p>
        ) : <div className="mt-0.5 text-sm">{dash}</div>}
      </div>
    </div>
  );
};

// Inline modal to edit a participant's name (support can fix typos).
const EditNameModal: React.FC<{
  participant: Participant | null;
  onClose: () => void;
  onSaved: (p: Participant) => void;
}> = ({ participant, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (participant) { setName(participant.fullName); setError(''); }
  }, [participant]);

  if (!participant) return null;

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Name is required'); return; }
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const { participant: updated } = await participantsApi.update(participant.id, { fullName: trimmedName });
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={!!participant}
      onClose={onClose}
      title="Edit name"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
          <button type="button" onClick={() => { void handleSave(); }} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Adaeze Obi"
          />
        </div>
      </div>
    </ModalShell>
  );
};

const formatReviewDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

const SupportReviewHistory: React.FC<{ history: FaithProjectReviewEntry[] }> = ({ history }) => {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-gray-600"
      >
        <span>{history.length} review{history.length > 1 ? 's' : ''}</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="divide-y divide-orange-100 border-t border-orange-100">
          {[...history].reverse().map((entry, i) => (
            <div key={i} className="px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.action === 'APPROVED' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-orange-100/80 text-orange-700'}`}>
                  {entry.action === 'APPROVED' ? 'Approved' : 'Needs Refinement'}
                </span>
                <span className="text-xs text-gray-500">{entry.actorName} · {formatReviewDate(entry.at)}</span>
              </div>
              {entry.note && <p className="mt-1.5 text-xs text-gray-600">{entry.note}</p>}
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

interface FaithProjectPanelProps {
  participant: Participant;
  existing: FaithProject | null;
  onSaved: (project: FaithProject) => void;
  onParticipantUpdated: (p: Participant) => void;
  userId?: string;
  supportName?: string;
  groupName?: string;
}

const FaithProjectPanel: React.FC<FaithProjectPanelProps> = ({ participant, existing, onSaved, onParticipantUpdated, userId, supportName, groupName }) => {
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [status, setStatus] = useState<FaithProjectStatus>(existing?.status ?? 'NOT_DRAFTED');
  const [body, setBody] = useState(existing?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const detailsPanelId = `participant-details-${participant.id}`;

  useEffect(() => {
    // NEEDS_REFINEMENT resets to UNDER_REFINEMENT so support can re-submit after
    // incorporating feedback. APPROVED is a terminal admin state — keep it as-is
    // (the editor is read-only for approved projects, so it is never re-saved).
    const s = existing?.status ?? 'NOT_DRAFTED';
    setStatus(s === 'NEEDS_REFINEMENT' ? 'UNDER_REFINEMENT' : s);
    setBody(existing?.body ?? '');
  }, [existing]);

  const isApproved = (existing?.status ?? 'NOT_DRAFTED') === 'APPROVED';

  const handleSave = async () => {
    if (isApproved) return; // approved projects are locked — support cannot downgrade them
    setSaving(true);
    setError('');
    try {
      const { project } = await faithProjectsApi.upsertForParticipant(participant.id, {
        body: body.trim() || null,
        status,
        updatedById: userId ?? null,
      });
      onSaved(project);
      if (status === 'UNDER_REFINEMENT') {
        // Notify admins — fire-and-forget
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        fetch(`${supabaseUrl}/functions/v1/notify-faith-project-submitted`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({
            participantName: participant.fullName,
            supportName: supportName ?? 'Support',
            groupName,
          }),
        }).catch(() => {/* non-critical */});
        setSubmitted(true);
      } else {
        setOpen(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const currentStatus = existing?.status ?? 'NOT_DRAFTED';

  return (
    <>
      <div className="rounded-2xl border border-orange-100 bg-white shadow-sm">
        {/* Top row: tapping it opens the faith-project editor. The edit-name
            pencil and the details toggle stop propagation so they don't open it. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl px-4 py-4 text-left transition hover:bg-orange-50/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-base font-semibold text-gray-900">{participant.fullName}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditingName(true); }}
                className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-orange-100 hover:text-primary"
                title="Edit name"
                aria-label={`Edit name for ${participant.fullName}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586Z" />
                </svg>
              </button>
            </div>
            <CopyPhoneButton phone={participant.phone} />
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCls(currentStatus)}`}>
                {statusLabel(currentStatus)}
              </span>
              {(() => {
                const lastNote = existing?.reviewHistory?.slice().reverse().find((e) => e.note);
                return lastNote ? (
                  <p className="text-xs text-orange-700 italic">"{lastNote.note}"</p>
                ) : null;
              })()}
            </div>
          </div>
          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-50 text-gray-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
            </svg>
          </span>
        </div>

        {/* More details accordion (registration info), always available */}
        <div className="border-t border-orange-100">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            aria-controls={detailsPanelId}
            aria-label={`${detailsOpen ? 'Hide' : 'Show'} registration details for ${participant.fullName}`}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-500 transition hover:bg-orange-50/40"
          >
            <span>More details</span>
            <svg className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
            </svg>
          </button>
          {detailsOpen && (
            <div id={detailsPanelId} className="border-t border-orange-50 bg-orange-50/20 px-4 py-4">
              <RegistrationDetails participant={participant} />
            </div>
          )}
        </div>
      </div>

      <ModalShell
        isOpen={open}
        onClose={() => { setOpen(false); setSubmitted(false); }}
        title={`Faith project: ${participant.fullName}`}
        footer={submitted ? (
          <button type="button" onClick={() => { setOpen(false); setSubmitted(false); }} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white">
            Done
          </button>
        ) : isApproved ? (
          <button type="button" onClick={() => setOpen(false)} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white">
            Close
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setOpen(false)} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">
              Cancel
            </button>
            <button type="button" onClick={() => { void handleSave(); }} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Saving…' : status === 'UNDER_REFINEMENT' ? 'Submit for review' : 'Save'}
            </button>
          </>
        )}
      >
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-900">Submitted for review</p>
            <p className="text-sm text-gray-500">The admin team has been notified and will review {participant.fullName}'s faith project.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {isApproved && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-700">Approved by admin</p>
                <p className="mt-1 text-xs text-emerald-600">This faith project has been approved and is now locked. Contact an admin if it needs further changes.</p>
              </div>
            )}
            {!isApproved && currentStatus === 'NEEDS_REFINEMENT' && (
              <div className="rounded-xl bg-orange-50 px-4 py-3">
                <p className="text-sm font-semibold text-orange-700">Admin has requested changes</p>
                {(() => {
                  const lastNote = existing?.reviewHistory?.slice().reverse().find((e) => e.note);
                  return lastNote ? <p className="mt-1 text-sm text-orange-600">"{lastNote.note}"</p> : null;
                })()}
                <p className="mt-1.5 text-xs text-orange-500">Update the project below and submit again for review.</p>
              </div>
            )}
            {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
            {!isApproved && (
              <div>
                <AppSelect
                  value={status}
                  onChange={(value) => setStatus(value as FaithProjectStatus)}
                  options={FAITH_PROJECT_SELECT_OPTIONS}
                  placeholder="Choose status"
                  label="Status"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Faith project</label>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                disabled={isApproved}
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Write the participant's faith project..."
              />
            </div>
            <SupportReviewHistory history={existing?.reviewHistory ?? []} />
          </div>
        )}
      </ModalShell>

      <EditNameModal
        participant={editingName ? participant : null}
        onClose={() => setEditingName(false)}
        onSaved={onParticipantUpdated}
      />
    </>
  );
};

const ParticipantHandoverContext: React.FC<{
  handovers: ParticipantHandover[];
  notes: ParticipantNote[];
  onAddNote: () => void;
}> = ({ handovers, notes, onAddNote }) => {
  const latest = handovers[0];
  const previousSupport = latest?.fromSupportName;
  return (
    <div className="border-t border-orange-100 bg-orange-50/20 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Handover context</p>
          {previousSupport ? (
            <p className="mt-1 text-xs text-gray-600" title={`Previously supported by ${previousSupport}${latest?.faithProjectStatus ? `. Faith project status at handover: ${latest.faithProjectStatus.replaceAll('_', ' ').toLowerCase()}` : ''}.`}>
              Previously supported by <span className="font-semibold text-gray-800">{previousSupport}</span>
              {latest?.faithProjectStatus ? ` · Faith project: ${latest.faithProjectStatus.replaceAll('_', ' ').toLowerCase()}` : ''}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">No previous support handover recorded yet.</p>
          )}
          {notes.slice(0, 2).map((note) => (
            <p key={note.id} className="mt-1 line-clamp-2 text-xs text-gray-600">{note.noteType === 'MEETING' ? 'Meeting note' : 'Note'} — {note.authorName || 'Support'}: {note.body}</p>
          ))}
        </div>
        <button type="button" onClick={onAddNote} className="shrink-0 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-orange-50">
          Add note
        </button>
      </div>
    </div>
  );
};

const SupportParticipantsPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort, weeks } = useAppData();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groupStatuses, setGroupStatuses] = useState<GroupOnboardingStatus[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [faithProjects, setFaithProjects] = useState<FaithProject[]>([]);
  const [groupPrayerFocuses, setGroupPrayerFocuses] = useState<GroupPrayerFocus[]>([]);
  const [groupPrayerStatuses, setGroupPrayerStatuses] = useState<GroupPrayerStatus[]>([]);
  const [participantNotes, setParticipantNotes] = useState<ParticipantNote[]>([]);
  const [participantHandovers, setParticipantHandovers] = useState<ParticipantHandover[]>([]);
  const [noteParticipant, setNoteParticipant] = useState<Participant | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [meetingNotePrompt, setMeetingNotePrompt] = useState(false);
  const [meetingNoteBody, setMeetingNoteBody] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<GroupTab>('faith');
  const [savingPrayerFocus, setSavingPrayerFocus] = useState(false);
  const [savingPrayer, setSavingPrayer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;

  const cohortWeeks = useMemo(
    () => (weeks ?? []).filter((week) => week.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const load = useCallback(async () => {
    if (!activeCohort || !user.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      // These reads are independent — fire them in one parallel batch
      // instead of waterfalling (each round-trip to eu-west-1 is ~300-900ms).
      const [participantsRes, faithRes, prayerFocusRes, groupStatusInitial, prayerStatusRes, groupsRes] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, supportId: user.id }).catch((err) => {
          console.error('Failed to load participants:', err);
          return { participants: [] as Participant[] };
        }),
        faithProjectsApi.getAll({ cohortId: activeCohort.id }).catch((err) => {
          console.error('Failed to load faith projects:', err);
          return { projects: [] as FaithProject[] };
        }),
        groupPrayerFocusApi.getForCohort(activeCohort.id).catch((err) => {
          console.error('Failed to load prayer focuses:', err);
          return { focuses: [] as GroupPrayerFocus[] };
        }),
        groupOnboardingStatusApi.getForSupport(user.id, activeCohort.id).catch((err) => {
          console.error('Failed to load group statuses:', err);
          return { statuses: [] as GroupOnboardingStatus[] };
        }),
        groupPrayerStatusApi.getForCohort(activeCohort.id).catch((err) => {
          console.error('Failed to load prayer statuses:', err);
          return { statuses: [] as GroupPrayerStatus[] };
        }),
        groupsApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ groups: [] as Group[] })),
      ]);
      let groupStatusRes = groupStatusInitial;

      if (participantsRes.participants.length === 0 && groupStatusRes.statuses.length === 0) {
        const { groups } = await groupsApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ groups: [] as import('../types').Group[] }));
        if (groups.length === 1) {
          const singleGroup = groups[0];
          const [{ participants: groupParticipants }, cohortStatusesRes] = await Promise.all([
            groupsApi.getParticipants(singleGroup.id).catch(() => ({ participants: [] as Participant[] })),
            groupOnboardingStatusApi.getForCohort(activeCohort.id).catch(() => ({ statuses: [] as GroupOnboardingStatus[] })),
          ]);
          participantsRes.participants = groupParticipants;
          const existingStatus = cohortStatusesRes.statuses.find((status) => status.groupId === singleGroup.id);
          groupStatusRes = {
            statuses: [existingStatus ?? {
              id: `virtual-${singleGroup.id}`,
              groupId: singleGroup.id,
              groupName: singleGroup.name,
              supportId: singleGroup.supportId ?? null,
              supportName: singleGroup.supportName ?? null,
              participantCount: singleGroup.participantCount ?? groupParticipants.length,
              groupCreated: false,
              updatedById: null,
              updatedByName: null,
              updatedAt: undefined,
              completedAt: null,
            }],
          };
        }
      }

      const participantIds = participantsRes.participants.map((participant) => participant.id);
      const [notesRes, handoversRes] = await Promise.all([
        participantNotesApi.getForParticipants(participantIds).catch(() => ({ notes: [] as ParticipantNote[] })),
        participantHandoversApi.getForParticipants(participantIds).catch(() => ({ handovers: [] as ParticipantHandover[] })),
      ]);

      setParticipants(sortByText(participantsRes.participants, (participant) => participant.fullName));
      setParticipantNotes(notesRes.notes);
      setParticipantHandovers(handoversRes.handovers);
      const fallbackGroups = new Map<string, GroupOnboardingStatus>();
      participantsRes.participants.forEach((participant) => {
        if (!participant.groupId || fallbackGroups.has(participant.groupId)) return;
        const count = participantsRes.participants.filter((entry) => entry.groupId === participant.groupId).length;
        fallbackGroups.set(participant.groupId, virtualGroupStatus(participant.groupId, participant.groupName, count));
      });
      groupStatusRes.statuses.forEach((status) => fallbackGroups.set(status.groupId, status));
      setGroupStatuses(sortByText(Array.from(fallbackGroups.values()), (status) => status.groupName));
      setGroups(groupsRes.groups.filter((g) => g.supportId === user.id));
      setFaithProjects(sortByText(faithRes.projects, (project) => project.title || project.participantName));
      setGroupPrayerFocuses(prayerFocusRes.focuses);
      setGroupPrayerStatuses(prayerStatusRes.statuses);

      const availableGroupIds = Array.from(new Set([
        ...groupStatusRes.statuses.map((status) => status.groupId),
        ...participantsRes.participants.map((participant) => participant.groupId).filter(Boolean) as string[],
      ]));
      setSelectedGroupId((current) => (current && availableGroupIds.includes(current) ? current : (availableGroupIds[0] ?? '')));
    } catch (err: any) {
      console.error('Unexpected error loading support participants page:', err);
      setLoadError(err?.message || 'Something went wrong loading your group.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort?.id, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (cohortWeeks.length === 0) return;
    const selectedStillExists = selectedWeekId !== null && cohortWeeks.some((week) => week.id === selectedWeekId);
    if (!selectedStillExists) {
      setSelectedWeekId(getIdealWeekForCohort(activeCohort, cohortWeeks)?.id ?? cohortWeeks[0].id);
    }
  }, [activeCohort, cohortWeeks, selectedWeekId]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; meta?: string }>();
    groupStatuses.forEach((status) => {
      map.set(status.groupId, {
        value: status.groupId,
        label: status.groupName || 'Untitled group',
        meta: `${status.participantCount ?? 0} participants`,
      });
    });
    participants.forEach((participant) => {
      if (!participant.groupId || map.has(participant.groupId)) return;
      map.set(participant.groupId, {
        value: participant.groupId,
        label: participant.groupName || 'Untitled group',
        meta: 'Participant group',
      });
    });
    return sortByText(Array.from(map.values()), (option) => option.label);
  }, [groupStatuses, participants]);

  const selectedParticipants = useMemo(
    () => sortByText(
      participants.filter((participant) => participant.groupId === selectedGroupId),
      (participant) => participant.fullName
    ),
    [participants, selectedGroupId]
  );

  const selectedGroup = useMemo(
    () => groupStatuses.find((status) => status.groupId === selectedGroupId) ?? null,
    [groupStatuses, selectedGroupId]
  );
  const selectedGroupData = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );
  const [meetingSlot, setMeetingSlot] = useState<MeetingSlot>({ meetingDay: null, meetingTime: null, meetingDurationMins: null });
  const [savingSlot, setSavingSlot] = useState(false);
  // Sync slot editor when selected group changes
  React.useEffect(() => {
    setMeetingSlot({
      meetingDay: selectedGroupData?.meetingDay ?? null,
      meetingTime: selectedGroupData?.meetingTime ?? null,
      meetingDurationMins: selectedGroupData?.meetingDurationMins ?? null,
    });
  }, [selectedGroupData]);
  const onboardingComplete = !!selectedGroup?.completedAt;

  const selectedWeek = cohortWeeks.find((week) => week.id === selectedWeekId) ?? null;
  const currentPrayerFocus = groupPrayerFocuses.find((focus) => focus.groupId === selectedGroupId && focus.weekId === selectedWeekId) ?? null;
  const currentPrayerStatus = groupPrayerStatuses.find((status) => status.groupId === selectedGroupId && status.weekId === selectedWeekId) ?? null;
  const focusedParticipant = currentPrayerFocus
    ? participants.find((participant) => participant.id === currentPrayerFocus.participantId) ?? null
    : null;
  const focusedProject = currentPrayerFocus
    ? faithProjects.find((project) => project.participantId === currentPrayerFocus.participantId) ?? null
    : null;

  const setPrayerFocus = async (participantId: string) => {
    if (!selectedGroupId || !selectedWeekId || !user.id) return;
    setSavingPrayerFocus(true);
    try {
      if (!participantId) {
        await groupPrayerFocusApi.clear(selectedGroupId, selectedWeekId);
        setGroupPrayerFocuses((prev) => prev.filter((entry) => !(entry.groupId === selectedGroupId && entry.weekId === selectedWeekId)));
        return;
      }

      const { focus } = await groupPrayerFocusApi.setFocus(selectedGroupId, selectedWeekId, participantId, user.id);
      setGroupPrayerFocuses((prev) => {
        const others = prev.filter((entry) => !(entry.groupId === focus.groupId && entry.weekId === focus.weekId));
        return [...others, focus];
      });
    } finally {
      setSavingPrayerFocus(false);
    }
  };

  const setPrayerDone = async (done: boolean) => {
    if (!selectedGroupId || !selectedWeekId || !user.id) return;
    const wasDone = currentPrayerStatus?.done === true;
    setSavingPrayer(true);
    try {
      const { status } = await groupPrayerStatusApi.setDone(selectedGroupId, selectedWeekId, done, user.id);
      setGroupPrayerStatuses((prev) => {
        const others = prev.filter((entry) => !(entry.groupId === status.groupId && entry.weekId === status.weekId));
        return [...others, status];
      });
      if (done && !wasDone) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        fetch(`${supabaseUrl}/functions/v1/notify-group-meeting-completed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({
            groupName: selectedGroup?.groupName ?? selectedGroupData?.name ?? 'A group',
            weekNumber: selectedWeek?.weekNumber,
            supportName: user.name,
          }),
        }).catch(() => {/* Notification delivery must not block marking the meeting done. */});
      }
    } finally {
      setSavingPrayer(false);
    }
  };

  const saveParticipantNote = async () => {
    if (!noteParticipant || !user.id || !noteBody.trim()) return;
    setSavingNote(true);
    try {
      const { note } = await participantNotesApi.create({
        participantId: noteParticipant.id, body: noteBody, authorId: user.id,
        groupId: noteParticipant.groupId ?? null, noteType: 'HANDOVER',
      });
      setParticipantNotes((prev) => [note, ...prev]);
      setNoteParticipant(null);
      setNoteBody('');
    } finally {
      setSavingNote(false);
    }
  };

  const submitMeetingCompletion = async (withNote: boolean) => {
    if (!selectedWeekId || !focusedParticipant || !user.id) return;
    setSavingPrayer(true);
    try {
      if (withNote && meetingNoteBody.trim()) {
        const { note } = await participantNotesApi.create({
          participantId: focusedParticipant.id, body: meetingNoteBody, authorId: user.id,
          groupId: selectedGroupId, weekId: selectedWeekId, noteType: 'MEETING',
        });
        setParticipantNotes((prev) => [note, ...prev]);
      }
      await setPrayerDone(true);
      setMeetingNotePrompt(false);
      setMeetingNoteBody('');
    } finally {
      setSavingPrayer(false);
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="My Group"
        subtitle="Your group's faith projects and weekly prayer check-ins."
      />

      {loading ? (
        <PageLoader />
      ) : loadError ? (
        <section className="surface-card p-6 text-center">
          <p className="text-sm text-red-600">{loadError}</p>
          <button type="button" onClick={() => { void load(); }} className="mt-4 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white">
            Retry
          </button>
        </section>
      ) : !selectedGroupId ? (
        <section className="surface-card p-6 text-center">
          <p className="text-sm text-gray-500">You do not have a group assigned yet.</p>
          <p className="mt-1 text-xs text-gray-400">Once a group is assigned, your group workspace will appear here.</p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="surface-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Group workspace</p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">{selectedGroup?.groupName || groupOptions.find((option) => option.value === selectedGroupId)?.label}</h2>
                <p className="mt-1 text-sm text-gray-500">{selectedParticipants.length} participant{selectedParticipants.length === 1 ? '' : 's'} in your small group.</p>
              </div>
              <div className="w-full max-w-sm">
                <AppSelect
                  value={selectedGroupId}
                  onChange={setSelectedGroupId}
                  options={groupOptions}
                  placeholder="Choose a group"
                  label="Group"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <TabButton label="Faith Project" active={activeTab === 'faith'} onClick={() => setActiveTab('faith')} />
              <TabButton label="Group Meetings" active={activeTab === 'prayers'} onClick={() => setActiveTab('prayers')} />
            </div>
          </section>

          {activeTab === 'faith' ? (
            <section className="surface-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Faith Project</p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900">Participants</h3>
                </div>
                {!onboardingComplete && (
                  <NavLink to="/support/onboarding" className="rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-primary hover:bg-orange-50">
                    Open Onboarding
                  </NavLink>
                )}
              </div>

              {selectedParticipants.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">
                  No participants are in this group yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {selectedParticipants.map((participant) => {
                    const project = faithProjects.find((entry) => entry.participantId === participant.id) ?? null;
                    const notes = participantNotes.filter((entry) => entry.participantId === participant.id);
                    const handovers = participantHandovers.filter((entry) => entry.participantId === participant.id);
                    return (
                      <div key={participant.id} className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
                        <FaithProjectPanel
                          participant={participant}
                          existing={project}
                          userId={user.id}
                          supportName={user.name}
                          groupName={selectedGroup?.groupName ?? undefined}
                          onSaved={(savedProject) => {
                            setFaithProjects((prev) => {
                              const others = prev.filter((entry) => entry.participantId !== savedProject.participantId);
                              return sortByText([...others, savedProject], (project) => project.title || project.participantName);
                            });
                          }}
                          onParticipantUpdated={(updated) => {
                            setParticipants((prev) => sortByText(prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x), (p) => p.fullName));
                          }}
                        />
                        <ParticipantHandoverContext handovers={handovers} notes={notes} onAddNote={() => { setNoteParticipant(participant); setNoteBody(''); }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <section className="surface-card p-5">
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs text-sky-700">
                <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <strong>Wed · Fri · Sat only, 5 pm – 9 pm, 45 min – 1 hr.</strong>{' '}
                  Flow: ① Prayer (20–30 min) → ② Recap discussion → ③ Class material → ④ Questions &amp; case study.
                  Goal: reflection and curiosity — not to exhaust all material.
                </span>
              </div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Group Meetings</p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900">Weekly meeting focus</h3>
                </div>
                <div className="w-full max-w-sm">
                  <AppSelect
                    value={selectedWeekId ? String(selectedWeekId) : ''}
                    onChange={(value) => setSelectedWeekId(Number(value))}
                    options={cohortWeeks.map((week: Week) => ({
                      value: String(week.id),
                      label: `Week ${week.weekNumber}`,
                    }))}
                    placeholder="Choose week"
                    label="Week"
                  />
                </div>
              </div>

              {/* Meeting slot — group leader can lock in their weekly slot */}
              {selectedGroupData && (
                <div className="mt-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Weekly meeting slot</p>
                    {savingSlot && <span className="text-xs text-gray-400">Saving…</span>}
                  </div>
                  <GroupMeetingSlotEditor
                    value={meetingSlot}
                    onChange={async (slot) => {
                      setMeetingSlot(slot);
                      setSavingSlot(true);
                      try {
                        const { group: updated } = await groupsApi.update(selectedGroupData.id, slot);
                        setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g));
                      } catch {
                        // revert on error
                        setMeetingSlot({
                          meetingDay: selectedGroupData.meetingDay ?? null,
                          meetingTime: selectedGroupData.meetingTime ?? null,
                          meetingDurationMins: selectedGroupData.meetingDurationMins ?? null,
                        });
                      } finally {
                        setSavingSlot(false);
                      }
                    }}
                  />
                  <p className="mt-2 text-xs text-gray-400">Wed · Fri · Sat only, 5–9 pm, 45 min – 1 hr</p>
                </div>
              )}

              {!selectedWeek ? (
                <div className="mt-4 rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-gray-500">
                  No weeks are available yet.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
                    <p className="text-sm font-semibold text-gray-900">Week {selectedWeek.weekNumber}</p>
                    <div className="mt-3 max-w-md">
                      <AppSelect
                        value={currentPrayerFocus?.participantId ?? ''}
                        onChange={(value) => { void setPrayerFocus(value); }}
                        options={[
                          { value: '', label: 'No focus selected', meta: 'Choose who your group will pray for' },
                          ...sortByText(selectedParticipants, (participant) => participant.fullName).map((participant) => ({
                            value: participant.id,
                            label: participant.fullName,
                            meta: participant.phone || 'Group participant',
                          })),
                        ]}
                        placeholder="Choose participant"
                        label="Who are we focusing on this week?"
                        loading={savingPrayerFocus}
                      />
                    </div>
                  </div>

                  {currentPrayerFocus ? (
                    <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Meeting focus</p>
                          <h4 className="mt-1 text-base font-bold text-gray-900">
                            {focusedProject?.title || focusedParticipant?.fullName || currentPrayerFocus.participantName || 'Selected participant'}
                          </h4>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusCls(focusedProject?.status ?? 'NOT_DRAFTED')}`}>
                          {statusLabel(focusedProject?.status ?? 'NOT_DRAFTED')}
                        </span>
                      </div>
                      {focusedProject?.body ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{focusedProject.body}</p>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">No faith project drafted yet.</p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-orange-200 py-8 text-center text-sm text-gray-500">
                      Choose a participant to show their faith project as this week’s meeting focus.
                    </div>
                  )}

                  <div className="max-w-sm">
                    <AppSelect
                      value={currentPrayerStatus?.done ? 'done' : 'pending'}
                      onChange={(value) => {
                        if (value !== 'done') { void setPrayerDone(false); return; }
                        if (focusedParticipant) { setMeetingNotePrompt(true); setMeetingNoteBody(''); return; }
                        void setPrayerDone(true);
                      }}
                      options={PRAYER_STATUS_OPTIONS}
                      placeholder="Choose meeting status"
                      label="Meeting status"
                      loading={savingPrayer}
                    />
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentPrayerStatus?.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {currentPrayerStatus?.done ? 'Meeting done' : 'Meeting pending'}
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <ModalShell
        isOpen={!!noteParticipant}
        onClose={() => setNoteParticipant(null)}
        title={noteParticipant ? `Add note — ${noteParticipant.fullName}` : 'Add participant note'}
        subtitle="This note stays with the participant and is visible to admins and a future assigned support."
        footer={<>
          <button type="button" onClick={() => setNoteParticipant(null)} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
          <button type="button" onClick={() => { void saveParticipantNote(); }} disabled={savingNote || !noteBody.trim()} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{savingNote ? 'Saving…' : 'Submit note'}</button>
        </>}
      >
        <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} rows={5} placeholder="Add helpful context for the next support…" className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </ModalShell>

      <ModalShell
        isOpen={meetingNotePrompt}
        onClose={() => setMeetingNotePrompt(false)}
        title="Record a session note?"
        subtitle={focusedParticipant ? `Is there anything worth recording for ${focusedParticipant.fullName} from this meeting?` : 'Is there anything worth recording from this meeting?'}
        footer={<>
          <button type="button" onClick={() => { void submitMeetingCompletion(false); }} disabled={savingPrayer} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 disabled:opacity-60">No note — mark done</button>
          <button type="button" onClick={() => { void submitMeetingCompletion(true); }} disabled={savingPrayer || !meetingNoteBody.trim()} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{savingPrayer ? 'Saving…' : 'Submit note & mark done'}</button>
        </>}
      >
        <textarea value={meetingNoteBody} onChange={(event) => setMeetingNoteBody(event.target.value)} rows={5} placeholder="Optional note about this participant's session…" className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </ModalShell>
    </div>
  );
};

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${active ? 'bg-primary text-white' : 'border border-orange-200 bg-white text-gray-600 hover:bg-orange-50'}`}
  >
    {label}
  </button>
);

export default SupportParticipantsPage;
