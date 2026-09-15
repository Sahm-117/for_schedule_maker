import React, { useEffect, useMemo, useState } from 'react';
import AppSelect from '../AppSelect';
import InfoTip from '../InfoTip';
import type { FaithProject, Participant, Week } from '../../types';

type MeetingMark = 'JOINED' | 'EXCUSED' | 'MISSED';

const STEPS = ['Attendance', 'Prayer', 'Recap', 'Notes', 'Submit'];
const DONE_STEP = STEPS.length;

const MARK_BUTTONS: Array<{ mark: MeetingMark; label: string; activeCls: string }> = [
  { mark: 'JOINED', label: 'Joined', activeCls: 'bg-emerald-100/80 text-emerald-700' },
  { mark: 'EXCUSED', label: 'Excused', activeCls: 'bg-amber-100/80 text-amber-700' },
  { mark: 'MISSED', label: 'Missed', activeCls: 'bg-red-100/80 text-red-700' },
];

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const TEXTAREA = 'w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

interface MeetingModePanelProps {
  weeks: Week[];
  weekId: number | null;
  onWeekChange: (weekId: number) => void;
  slotLabel: string | null;
  participants: Participant[];
  faithProjects: FaithProject[];
  focusParticipantId: string | null;
  savingFocus: boolean;
  onSetFocus: (participantId: string) => Promise<void>;
  submitted: boolean;
  onSubmit: (notes: { summary: string; concern: string }) => Promise<void>;
  onReopen: () => Promise<void>;
  recapSummary?: string | null;
  discussionPrompt?: string | null;
}

// Five-step weekly group meeting flow: Attendance → Prayer → Recap → Notes → Submit.
const MeetingModePanel: React.FC<MeetingModePanelProps> = ({
  weeks,
  weekId,
  onWeekChange,
  slotLabel,
  participants,
  faithProjects,
  focusParticipantId,
  savingFocus,
  onSetFocus,
  submitted,
  onSubmit,
  onReopen,
  recapSummary,
  discussionPrompt,
}) => {
  const [step, setStep] = useState(submitted ? DONE_STEP : 0);
  const [marks, setMarks] = useState<Record<string, MeetingMark>>({});
  const [summary, setSummary] = useState('');
  const [concern, setConcern] = useState('');
  const [tipOpen, setTipOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Each week starts its own run through the flow.
  useEffect(() => {
    setStep(submitted ? DONE_STEP : 0);
    setMarks({});
    setSummary('');
    setConcern('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId]);

  const week = weeks.find((entry) => entry.id === weekId) ?? null;
  const weekLabel = week ? `Week ${week.weekNumber}` : 'This week';
  const focusParticipant = participants.find((participant) => participant.id === focusParticipantId) ?? null;

  const markedCount = Object.keys(marks).length;
  const joinedCount = Object.values(marks).filter((mark) => mark === 'JOINED').length;
  const attendanceSummary = markedCount === 0
    ? `Nobody marked yet · ${participants.length} in the group.`
    : `${joinedCount} of ${participants.length} here · ${participants.length - markedCount} still unmarked.`;

  const doneSummary = useMemo(() => {
    const parts = [`${joinedCount} of ${participants.length} attended`];
    if (focusParticipant) parts.push(`prayer focus on ${focusParticipant.fullName}`);
    if (concern.trim()) parts.push('one concern raised for follow-up');
    return `${parts.join(' · ')}.`;
  }, [concern, focusParticipant, joinedCount, participants.length]);

  const status = submitted
    ? { label: 'Submitted', cls: 'bg-emerald-100/80 text-emerald-700' }
    : step > 0
      ? { label: 'In progress', cls: 'bg-[#fff8f3] text-[#c2410c]' }
      : { label: 'Not started', cls: 'bg-[#f4f5f7] text-gray-500' };

  const handleNext = async () => {
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    setBusy(true);
    try {
      await onSubmit({ summary: summary.trim(), concern: concern.trim() });
      setStep(DONE_STEP);
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    setBusy(true);
    try {
      await onReopen();
      setStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-base font-bold leading-snug text-gray-900">{weekLabel} group meeting</h2>
          <span className={`mt-0.5 flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>{status.label}</span>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">{slotLabel ?? 'Meeting time not set'} · attendance for this meeting only</p>

        {weeks.length > 0 && (
          <div className="mt-3">
            <AppSelect
              value={weekId ? String(weekId) : ''}
              onChange={(value) => onWeekChange(Number(value))}
              options={weeks.map((entry) => ({ value: String(entry.id), label: `Week ${entry.weekNumber}` }))}
              placeholder="Choose week"
              compact
            />
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {STEPS.map((label, index) => {
            const current = index === Math.min(step, STEPS.length - 1);
            const cls = current
              ? 'bg-primary text-white'
              : index < step ? 'bg-[#fff1e7] text-[#c2410c]' : 'bg-[#f4f5f7] text-gray-400';
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={`min-w-0 flex-[1_1_92px] rounded-[10px] px-1.5 py-2 text-center transition ${cls}`}
              >
                <span className="block text-[10px] font-bold tracking-[0.06em]">STEP {index + 1}</span>
                <span className="mt-0.5 block text-[11.5px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 overflow-hidden rounded-[10px] border border-[#eef0f4]">
          <button
            type="button"
            onClick={() => setTipOpen((open) => !open)}
            aria-expanded={tipOpen}
            className="flex w-full items-center gap-2 bg-[#f6f7f9] px-3 py-2.5 text-left"
          >
            <span className="text-xs font-bold text-gray-600">Tips</span>
            <span className={`ml-auto text-[11px] text-gray-400 transition-transform ${tipOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {tipOpen && (
            <div className="px-3 py-[11px] text-xs leading-relaxed text-gray-500">
              <p>Sunday class attendance is recorded separately. This records who joined the group meeting.</p>
              <p className="mt-2">
                <strong className="text-[#c2410c]">Recap documents:</strong> the back office uploads each week’s recap and tags who it is for. Tagged “supports” it stays with the team; tagged “participants” it reaches them straight away.
              </p>
            </div>
          )}
        </div>
      </section>

      {step === 0 && (
        <section className={CARD}>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-gray-900">Who joined the meeting?</h3>
            <InfoTip label="About meeting attendance">Meeting attendance is not saved yet.</InfoTip>
          </div>
          <p className="mt-0.5 text-[13px] text-gray-500">Tap each person as they join the call.</p>
          {participants.length === 0 ? (
            <div className="mt-3.5 rounded-2xl border border-dashed border-orange-200 py-10 text-center text-sm text-gray-500">No participants are in this group yet.</div>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2">
              {participants.map((participant) => (
                <div key={participant.id} className="flex flex-wrap items-center gap-2.5 rounded-[14px] border border-[#f1f2f5] px-3 py-2.5">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#fff1e7] text-xs font-bold text-[#c2410c]">{initialsOf(participant.fullName)}</div>
                  <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{participant.fullName}</span>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {MARK_BUTTONS.map(({ mark, label, activeCls }) => (
                      <button
                        key={mark}
                        type="button"
                        onClick={() => setMarks((prev) => ({ ...prev, [participant.id]: mark }))}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${marks[participant.id] === mark ? activeCls : 'bg-[#f4f5f7] text-gray-500 hover:bg-gray-200/70'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">{attendanceSummary}</p>
        </section>
      )}

      {step === 1 && (
        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-gray-900">Prayer focus</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">Whose faith project does the group pray for this week?</p>
          {participants.length === 0 ? (
            <div className="mt-3.5 rounded-2xl border border-dashed border-orange-200 py-10 text-center text-sm text-gray-500">No participants are in this group yet.</div>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2">
              {participants.map((participant) => {
                const focused = participant.id === focusParticipantId;
                const project = faithProjects.find((entry) => entry.participantId === participant.id);
                return (
                  <button
                    key={participant.id}
                    type="button"
                    disabled={savingFocus}
                    onClick={() => { void onSetFocus(focused ? '' : participant.id); }}
                    className={`rounded-[14px] border p-3 text-left transition disabled:opacity-60 ${focused ? 'border-[#ffdeca] bg-[#fff8f3]' : 'border-[#f1f2f5] bg-white hover:border-gray-200'}`}
                  >
                    <span className="block text-sm font-semibold text-gray-900">{participant.fullName}</span>
                    <span className="mt-0.5 block text-[12.5px] text-gray-500">{project?.body?.trim() || 'No faith project recorded yet.'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-gray-900">{weekLabel} recap</h3>
          <div className="mt-3 rounded-[14px] bg-[#fff8f3] p-3.5">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">{week?.title?.trim() || 'Topic not published yet'}</p>
            <p className="mt-1.5 text-sm leading-normal text-gray-700">{recapSummary?.trim() || 'The programme team has not published this week yet.'}</p>
          </div>
          <div className="mt-2.5 rounded-[14px] border border-[#f1f2f5] p-3.5">
            <p className="text-[13px] font-bold text-gray-900">Discussion prompt</p>
            <p className="mt-1 text-sm leading-normal text-gray-700">{discussionPrompt?.trim() || 'No discussion prompt set.'}</p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className={CARD}>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-gray-900">Notes</h3>
            <InfoTip label="Where notes are saved">
              Notes are saved as a meeting note on this week's prayer focus participant. Pick one in step 2 to keep them.
            </InfoTip>
          </div>
          <p className="mt-0.5 text-[13px] text-gray-500">Anything leadership should know. A concern here opens a tracked issue.</p>
          <label className="mt-3.5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">How did it go?</span>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} placeholder="Good turnout. Two people shared for the first time." className={TEXTAREA} />
          </label>
          <label className="mt-2.5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Anyone who needs attention</span>
            <textarea value={concern} onChange={(event) => setConcern(event.target.value)} rows={3} placeholder="Nneka has missed four weeks and is not answering calls." className={TEXTAREA} />
          </label>
        </section>
      )}

      {step === 4 && (
        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-gray-900">Submit</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">Check the summary, then submit the report for {weekLabel}.</p>
          <p className="mt-3 rounded-[14px] bg-[#f6f7f9] p-3.5 text-sm leading-normal text-gray-700">{doneSummary}</p>
        </section>
      )}

      {step === DONE_STEP && (
        <section className={`${CARD} p-[22px] text-center`}>
          <div className="text-3xl text-emerald-600">✓</div>
          <h3 className="mt-2 text-[17px] font-bold text-gray-900">{weekLabel} meeting recorded</h3>
          <p className="mt-1.5 text-sm leading-normal text-gray-500">{submitted && markedCount === 0 ? 'This week’s meeting has been submitted.' : doneSummary}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => setStep(0)} className="rounded-xl border border-gray-200 bg-white px-[18px] py-[11px] text-sm font-semibold text-gray-800">
              Record another week
            </button>
            {submitted && (
              <button type="button" onClick={() => { void handleReopen(); }} disabled={busy} className="text-xs font-semibold text-gray-400 hover:text-gray-600 disabled:opacity-60">
                Mark as not submitted
              </button>
            )}
          </div>
        </section>
      )}

      {step < DONE_STEP && (
        <div className="flex gap-2.5 rounded-b-2xl border-t border-[#eef0f4] bg-white/85 p-3">
          <button
            type="button"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="min-h-[46px] rounded-xl border border-gray-200 bg-white px-[18px] py-3 text-sm font-semibold text-gray-800 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => { void handleNext(); }}
            disabled={busy}
            className="min-h-[46px] flex-1 rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Submitting…' : step >= STEPS.length - 1 ? 'Submit report' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
};

export default MeetingModePanel;
