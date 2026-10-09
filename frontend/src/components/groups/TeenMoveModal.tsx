import { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { teenMoveApi, type TeenMoveTarget } from '../../services/api';

interface TeenMoveModalProps {
  /** The teen being moved; null = closed. */
  teen: { participantId: string; name: string } | null;
  onClose: () => void;
  /** Called after a successful move, so the page can read the groups again. */
  onMoved: (message: string) => void;
}

/** An admin moves a teen to another Teen Support of the same gender. The move is recorded and both supports are told. */
const TeenMoveModal: React.FC<TeenMoveModalProps> = ({ teen, onClose, onMoved }) => {
  const [targets, setTargets] = useState<TeenMoveTarget[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teen) return;
    let cancelled = false;
    setTargets(null); setPicked(null); setForce(false); setError('');
    teenMoveApi.targets(teen.participantId)
      .then((list) => { if (!cancelled) setTargets(list); })
      .catch((err) => { if (!cancelled) { setTargets([]); setError(err instanceof Error ? err.message : 'Could not load the Teen Supports.'); } });
    return () => { cancelled = true; };
  }, [teen]);

  const options = (targets ?? []).filter((t) => !t.current);
  const chosen = options.find((t) => t.userId === picked) ?? null;
  const full = !!chosen && chosen.count >= chosen.cap;

  const move = async () => {
    if (!teen || !chosen) return;
    setSaving(true);
    setError('');
    try {
      const res = await teenMoveApi.move(teen.participantId, chosen.userId, force);
      onMoved(`${teen.name} now goes to ${res.toName}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move them.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={!!teen}
      onClose={() => { if (!saving) onClose(); }}
      title={teen ? `Move ${teen.name}` : 'Move a teen'}
      subtitle="To another Teen Support of the same gender. The move is recorded, and both supports are told."
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 active:scale-95 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void move()} disabled={!chosen || saving || (full && !force)} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50">
            {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Moving…</span> : 'Move'}
          </button>
        </div>
      )}
    >
      {targets === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : options.length === 0 ? (
        <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">{error || 'No other Teen Support of the same gender to move them to.'}</p>
      ) : (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Teen Support">
          {options.map((t) => {
            const isFull = t.count >= t.cap;
            return (
              <button
                key={t.userId}
                type="button"
                role="radio"
                aria-checked={picked === t.userId}
                onClick={() => { setPicked(t.userId); setForce(false); }}
                className={`flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${picked === t.userId ? 'border-primary bg-[#fff8f3]' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
              >
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${picked === t.userId ? 'border-primary' : 'border-gray-300'}`} aria-hidden="true">
                  {picked === t.userId && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{t.name}</span>
                <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${isFull ? 'bg-amber-100/80 text-amber-700' : 'bg-sky-100/80 text-sky-700'}`}>{t.count} of {t.cap}{isFull ? ' · full' : ''}</span>
              </button>
            );
          })}
        </div>
      )}
      {full && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-2xl bg-amber-100/60 px-3.5 py-3 text-[13px] text-amber-800">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-[#ff914d]" />
          <span>{chosen?.name} already has {chosen?.count} teens (the limit is {chosen?.cap}). Move anyway; it will be noted as over the limit.</span>
        </label>
      )}
      {error && options.length > 0 && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </ModalShell>
  );
};

export default TeenMoveModal;
