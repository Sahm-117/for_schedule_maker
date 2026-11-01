import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useAppData } from '../../context/AppDataContext';
import { corporatePrayersApi } from '../../services/api';
import type { PrayerOverview, PrayerSlot, PrayerSlotInput } from '../../types';
import { isTestCohort } from '../../utils/planner';
import { PRAYER_TYPE_LABEL, clockLabel } from '../../utils/prayerText';
import { Notice, PRIMARY_BTN, SECONDARY_BTN } from './ui';

interface CopySlotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cohortId: string;
  /** The current cohort's overview: its slots (copying is skipped when there are any) and its hubs. */
  overview: PrayerOverview;
  onCopied: () => void;
}

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; copy: PrayerSlotInput[]; skipped: Array<{ slot: PrayerSlot; reason: string }> };

const slotTitle = (slot: { name: string | null; time: string; slotType: PrayerSlot['slotType'] }) =>
  `${clockLabel(slot.time)} · ${slot.name?.trim() || PRAYER_TYPE_LABEL[slot.slotType]}`;

/**
 * "Copy last cohort's slots": the previous cohort's slots are made again for this cohort through the same save call
 * the slot editor uses. Hubs belong to a cohort, so a slot for chosen hubs is copied only when this cohort has a hub
 * of the same name for each; otherwise it is listed as skipped. Nothing is copied when this cohort already has slots.
 */
const CopySlotsModal: React.FC<CopySlotsModalProps> = ({ isOpen, onClose, cohortId, overview, onCopied }) => {
  const { cohorts } = useAppData();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current = cohorts.find((c) => c.id === cohortId) ?? null;
  const previous = useMemo(() => {
    const start = current?.startDate?.slice(0, 10);
    if (!start) return null;
    return [...cohorts]
      .filter((c) => c.id !== cohortId && !isTestCohort(c) && c.startDate && c.startDate.slice(0, 10) < start)
      .sort((a, b) => (b.startDate as string).localeCompare(a.startDate as string))[0] ?? null;
  }, [cohorts, cohortId, current?.startDate]);

  const hasSlots = overview.slots.length > 0;

  useEffect(() => {
    if (!isOpen || hasSlots || !previous) return undefined;
    let cancelled = false;
    setLoaded({ state: 'loading' });
    setError('');
    corporatePrayersApi.overview(previous.id)
      .then((prev) => {
        if (cancelled) return;
        const hubIdByName = new Map(overview.hubs.map((h) => [h.name.trim().toLowerCase(), h.id]));
        const prevHubName = new Map(prev.hubs.map((h) => [h.id, h.name]));
        const copy: PrayerSlotInput[] = [];
        const skipped: Array<{ slot: PrayerSlot; reason: string }> = [];
        [...prev.slots].sort((a, b) => a.time.localeCompare(b.time)).forEach((slot) => {
          let hubIds: string[] = [];
          if (!slot.audienceAll) {
            const mapped = slot.hubIds.map((id) => hubIdByName.get((prevHubName.get(id) ?? '').trim().toLowerCase()));
            if (mapped.some((id) => !id)) {
              skipped.push({ slot, reason: 'a hub it prays in does not exist in this cohort yet' });
              return;
            }
            hubIds = mapped as string[];
          }
          copy.push({
            id: null,
            name: slot.name ?? '',
            time: slot.time,
            slotType: slot.slotType,
            timerMinutes: slot.timerMinutes,
            joinWindowMinutes: slot.joinWindowMinutes,
            targetMode: slot.slotType === 'PRAYER' ? (!slot.audienceAll && hubIds.length === 1 ? 'HUB' : slot.targetMode) : null,
            notify: slot.notify,
            active: slot.active,
            blocks: slot.slotType === 'PRAYER' ? slot.blocks : [],
            audienceAll: slot.audienceAll,
            hubIds,
            telegramLink: slot.slotType === 'LIVE' ? slot.telegramLink ?? '' : '',
            liveWaitMinutes: slot.liveWaitMinutes,
            liveMessage: slot.slotType === 'LIVE' ? slot.liveMessage ?? '' : '',
          });
        });
        setLoaded({ state: 'ready', copy, skipped });
      })
      .catch((err) => { if (!cancelled) setLoaded({ state: 'error', message: err instanceof Error ? err.message : 'Could not read the last cohort’s slots.' }); });
    return () => { cancelled = true; };
  }, [isOpen, hasSlots, previous, overview.hubs]);

  const confirm = async () => {
    if (loaded.state !== 'ready') return;
    setSaving(true);
    setError('');
    let saved = 0;
    try {
      for (const input of loaded.copy) {
        await corporatePrayersApi.saveSlot(cohortId, input);
        saved += 1;
      }
      onCopied();
      onClose();
    } catch (err) {
      if (saved > 0) onCopied();
      setError(`${saved} of ${loaded.copy.length} copied. ${err instanceof Error ? err.message : 'Could not save a slot.'}`);
    } finally { setSaving(false); }
  };

  let body: React.ReactNode;
  let canCopy = false;
  if (hasSlots) {
    body = <Notice tone="info">{current?.name ?? 'This cohort'} already has {overview.slots.length} slot{overview.slots.length === 1 ? '' : 's'}, so nothing is copied. Edit them on the Schedule tab.</Notice>;
  } else if (!previous) {
    body = <Notice tone="info">There is no earlier cohort to copy from.</Notice>;
  } else if (loaded.state === 'loading') {
    body = <p className="flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Reading {previous.name}’s slots…</p>;
  } else if (loaded.state === 'error') {
    body = <Notice tone="error">{loaded.message}</Notice>;
  } else if (loaded.copy.length === 0) {
    body = <Notice tone="info">{previous.name} has no slots that can be copied{loaded.skipped.length > 0 ? ' (see below)' : ''}.</Notice>;
  } else {
    canCopy = true;
    body = (
      <>
        <p className="mb-3 text-sm text-gray-600">These {loaded.copy.length} slot{loaded.copy.length === 1 ? '' : 's'} from {previous.name} will be added to {current?.name}. Check each one afterwards on the Schedule tab.</p>
        <ul className="divide-y divide-gray-100 rounded-2xl bg-gray-50">
          {loaded.copy.map((slot, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-semibold text-gray-900">{slotTitle(slot)}</span>
              <span className="text-xs text-gray-500">{PRAYER_TYPE_LABEL[slot.slotType]}{slot.active ? '' : ' · off'}{slot.audienceAll ? '' : ' · chosen hubs'}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Copy last cohort’s slots"
      subtitle={previous ? `From ${previous.name} to ${current?.name ?? 'this cohort'}` : undefined}
      footer={(
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>{canCopy ? 'Cancel' : 'Close'}</button>
          {canCopy && (
            <button type="button" onClick={() => { void confirm(); }} disabled={saving} className={PRIMARY_BTN}>
              {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Copying…</span> : 'Copy slots'}
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        {body}
        {loaded.state === 'ready' && !hasSlots && loaded.skipped.length > 0 && (
          <Notice tone="warn">
            Not copied: {loaded.skipped.map((s) => `${slotTitle(s.slot)} (${s.reason})`).join('; ')}. Add these by hand once the hubs exist.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </ModalShell>
  );
};

export default CopySlotsModal;
