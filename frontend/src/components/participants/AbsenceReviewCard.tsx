import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { absenceReviewApi, type AbsenceReviewResult, type AbsenceReviewState } from '../../services/absenceReview';

// The two-absence review (FLOW_MAP rule 119), on the admin Dashboard and Participants page. From the Saturday before
// class 3 it lists everyone in a group marked Absent for class 1 and class 2; the admin unticks anyone to keep and
// moves the rest to the next cohort. Nothing moves by itself. Moves can be undone the same day.

const Overlay: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, onClose, children, footer }) => createPortal(
  <div className="fixed inset-0 z-[80] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white sm:max-w-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100">&times;</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
    </div>
  </div>,
  document.body,
);

const AbsenceReviewCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const toast = useToast();
  const [state, setState] = useState<AbsenceReviewState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AbsenceReviewResult | null>(null);
  const [keptCount, setKeptCount] = useState(0);
  const [undoing, setUndoing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setState(await absenceReviewApi.state()); } catch { setState(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const people = state?.people ?? [];
  const undoable = state?.undoable ?? [];
  const showReview = !!state?.open && people.length > 0;
  if (!showReview && undoable.length === 0 && !result) return null;

  const toMove = people.filter((p) => !keep.has(p.participantId));
  const close = () => { setReviewing(false); setConfirming(false); setResult(null); };

  const move = async () => {
    setBusy(true);
    try {
      const res = await absenceReviewApi.move(toMove.map((p) => p.participantId));
      setKeptCount(people.length - res.moved.length - res.skipped.length);
      setResult(res);
      setConfirming(false);
      void load();
    } catch (e) {
      toast({ tone: 'error', message: (e as Error).message });
    } finally { setBusy(false); }
  };

  const undo = async (id: string, name: string) => {
    setUndoing(id);
    try {
      await absenceReviewApi.undo(id);
      toast({ message: `${name} is back in their group` });
      void load();
    } catch (e) {
      toast({ tone: 'error', message: (e as Error).message });
    } finally { setUndoing(null); }
  };

  return (
    <>
      {showReview && (
        <div className={`surface-card flex flex-wrap items-center gap-3 border-l-4 border-l-amber-500 p-4 ${className}`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{people.length} {people.length === 1 ? 'person' : 'people'} missed class 1 and class 2{state?.cohortName ? ` · ${state.cohortName}` : ''}</p>
            <p className="mt-0.5 text-[13px] text-gray-500">Review before class 3. Anyone you move leaves their group and joins the next cohort. Late, left early and excused don't count as missed.</p>
          </div>
          <button type="button" onClick={() => { setKeep(new Set()); setResult(null); setReviewing(true); }} className="inline-flex h-11 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">Review</button>
        </div>
      )}
      {!showReview && undoable.length > 0 && (
        <div className={`surface-card flex flex-wrap items-center gap-3 p-4 ${className}`}>
          <p className="min-w-0 flex-1 text-sm text-gray-700"><span className="font-semibold text-gray-900">Moved {undoable.length} to the next cohort today.</span> You can undo until midnight.</p>
          <button type="button" onClick={() => { setResult(null); setReviewing(true); }} className="inline-flex h-11 items-center rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">See who</button>
        </div>
      )}

      {reviewing && (
        <Overlay
          title={result ? 'Review done' : showReview ? 'Missed class 1 and class 2' : 'Moved today'}
          onClose={close}
          footer={result || !showReview ? (
            <button type="button" onClick={close} className="inline-flex h-11 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">Done</button>
          ) : confirming ? (
            <>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="inline-flex h-11 items-center rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">Back</button>
              <button type="button" disabled={busy} onClick={() => void move()} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{busy && <Spinner className="h-4 w-4" />}{toMove.length === 0 ? 'Keep everyone' : `Yes, move ${toMove.length}`}</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="inline-flex h-11 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">{toMove.length === 0 ? 'Keep everyone' : `Move ${toMove.length} to next cohort`}</button>
          )}
        >
          {result ? (
            <div className="grid gap-3 text-sm">
              <p className="text-gray-900"><span className="font-semibold">{result.moved.length} moved</span> to the next cohort{keptCount > 0 ? `, ${keptCount} kept` : ''}. Their supports have been told.</p>
              {result.skipped.length > 0 && <p className="text-[13px] text-gray-500">The review stays open until everyone you chose has moved. Open it again to retry; untick anyone you kept.</p>}
              {result.skipped.length > 0 && (
                <div className="rounded-2xl bg-amber-50 p-3 text-amber-900">
                  <p className="font-semibold">Not moved</p>
                  <ul className="mt-1 list-disc pl-5">{result.skipped.map((s) => <li key={s.name}>{s.name}: {s.reason}</li>)}</ul>
                </div>
              )}
              {undoable.length > 0 && <p className="text-[13px] text-gray-500">Moved someone by mistake? Undo below until midnight.</p>}
            </div>
          ) : showReview && confirming ? (
            <div className="grid gap-2 text-sm text-gray-700">
              {toMove.length === 0 ? <p>Everyone stays in their group. The review is marked done.</p> : <>
                <p className="font-semibold text-gray-900">Move {toMove.length} {toMove.length === 1 ? 'person' : 'people'} to the next cohort?</p>
                <ul className="list-disc pl-5"><li>They leave their group and are archived in {state?.cohortName ?? 'this cohort'}.</li><li>Adults are set to join the next cohort. Teens keep their teen status, and their Teen Support decides.</li><li>Their support gets a message saying why.</li><li>You can undo each one until midnight.</li></ul>
              </>}
            </div>
          ) : showReview ? (
            <>
              <p className="mb-3 text-[13px] text-gray-500">Everyone is ticked to move. Untick anyone to keep in their group.</p>
              <div className="grid gap-2">
                {people.map((p) => {
                  const moving = !keep.has(p.participantId);
                  return (
                    <label key={p.participantId} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 ${moving ? 'border-primary bg-primary-50' : 'border-gray-200'}`}>
                      <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary" checked={moving}
                        onChange={() => setKeep((cur) => { const next = new Set(cur); if (next.has(p.participantId)) next.delete(p.participantId); else next.add(p.participantId); return next; })} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">{p.fullName}{p.isTeen && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Teen</span>}</span>
                        <span className="block text-[13px] text-gray-500">{[p.groupName, p.supportName && `Support: ${p.supportName}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`text-xs font-semibold ${moving ? 'text-primary' : 'text-gray-500'}`}>{moving ? 'Move' : 'Keep'}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}
          {(result || !showReview) && undoable.length > 0 && (
            <div className="mt-4 grid gap-2">
              {undoable.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1 text-sm"><span className="font-semibold text-gray-900">{m.fullName}</span>{m.groupName && <span className="text-gray-500"> · was in {m.groupName}</span>}</span>
                  <button type="button" disabled={undoing === m.id} onClick={() => void undo(m.id, m.fullName)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60">{undoing === m.id && <Spinner className="h-3 w-3" />}Undo</button>
                </div>
              ))}
            </div>
          )}
        </Overlay>
      )}
    </>
  );
};

export default AbsenceReviewCard;
