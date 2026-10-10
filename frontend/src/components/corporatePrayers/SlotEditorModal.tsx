import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { corporatePrayersApi } from '../../services/api';
import type { PrayerSlot, PrayerSlotType, PrayerTargetMode } from '../../types';
import { PRAYER_TYPE_LABEL } from '../../utils/prayerText';
import { Field, INPUT, Notice, PRIMARY_BTN, SECONDARY_BTN, Segmented, Toggle } from './ui';

// Add or edit one daily slot. Editing never rewrites days that already ran: it applies from the next day a slot is made.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cohortId: string;
  slot: PrayerSlot | null;
  hasHubs: boolean;
  onSaved: () => void;
}

const SlotEditorModal: React.FC<Props> = ({ isOpen, onClose, cohortId, slot, hasHubs, onSaved }) => {
  const [name, setName] = useState('');
  const [time, setTime] = useState('05:50');
  const [slotType, setSlotType] = useState<PrayerSlotType>('VERSE');
  const [timer, setTimer] = useState('15');
  const [windowMins, setWindowMins] = useState('15');
  const [targetMode, setTargetMode] = useState<PrayerTargetMode>('HUB');
  const [notify, setNotify] = useState(true);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(slot?.name ?? '');
    setTime(slot?.time ?? '05:50');
    setSlotType(slot?.slotType ?? 'VERSE');
    setTimer(String(slot?.timerMinutes ?? 15));
    setWindowMins(String(slot?.joinWindowMinutes ?? 15));
    setTargetMode(slot?.targetMode ?? (hasHubs ? 'HUB' : 'COHORT'));
    setNotify(slot?.notify ?? true);
    setActive(slot?.active ?? true);
    setError('');
    // Only when the dialog opens, so a refresh behind it never wipes what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const save = async () => {
    const timerMinutes = Math.round(Number(timer));
    const joinWindowMinutes = Math.round(Number(windowMins));
    if (!/^\d{2}:\d{2}$/.test(time)) { setError('Enter a time such as 05:50.'); return; }
    if (slotType !== 'LIVE' && (!Number.isFinite(timerMinutes) || timerMinutes < 1 || timerMinutes > 120)) { setError('The timer must be between 1 and 120 minutes.'); return; }
    if (!Number.isFinite(joinWindowMinutes) || joinWindowMinutes < 1 || joinWindowMinutes > 240) { setError('The join window must be between 1 and 240 minutes.'); return; }
    setSaving(true);
    setError('');
    try {
      await corporatePrayersApi.saveSlot(cohortId, {
        id: slot?.id ?? null,
        name: name.trim(),
        time,
        slotType,
        timerMinutes: slotType === 'LIVE' ? 15 : timerMinutes,
        joinWindowMinutes,
        targetMode: slotType === 'FAITH_PROJECT' ? targetMode : null,
        notify,
        active,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the slot.');
    } finally { setSaving(false); }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={slot ? 'Edit slot' : 'Add a slot'}
      subtitle="Slots run every day, from the start week to the end of the cohort."
      footer={(
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>Cancel</button>
          <button type="button" onClick={() => { void save(); }} disabled={saving} className={PRIMARY_BTN}>
            {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save slot'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        <Field label="Type" htmlFor="slot-type">
          <Segmented
            label="Slot type"
            value={slotType}
            onChange={(value) => setSlotType(value as PrayerSlotType)}
            options={(['VERSE', 'FAITH_PROJECT', 'LIVE'] as PrayerSlotType[]).map((value) => ({ value, label: PRAYER_TYPE_LABEL[value] }))}
          />
          <p className="mt-1.5 text-xs text-gray-500">
            {slotType === 'VERSE' && 'A verse prayer with the person’s photo.'}
            {slotType === 'FAITH_PROJECT' && 'A person’s faith project, exactly as they wrote it, with a verse prayer.'}
            {slotType === 'LIVE' && 'A pop-up with the Telegram link. Set the link on the Live prayer tab.'}
          </p>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time (Lagos)" htmlFor="slot-time" hint="The time it opens, such as 05:50.">
            <input id="slot-time" type="time" step={60} value={time} onChange={(event) => setTime(event.target.value)} className={INPUT} />
          </Field>
          <Field label="Name (optional)" htmlFor="slot-name" hint="Shown to people. Leave blank to use the time.">
            <input id="slot-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} className={INPUT} placeholder="Morning prayer" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {slotType !== 'LIVE' && (
            <Field label="Timer (minutes)" htmlFor="slot-timer" hint="How long each person prays. They can leave any time.">
              <input id="slot-timer" type="number" inputMode="numeric" min={1} max={120} value={timer} onChange={(event) => setTimer(event.target.value)} className={INPUT} />
            </Field>
          )}
          <Field label="Joinable for (minutes)" htmlFor="slot-window" hint="How long after it opens people can still join.">
            <input id="slot-window" type="number" inputMode="numeric" min={1} max={240} value={windowMins} onChange={(event) => setWindowMins(event.target.value)} className={INPUT} />
          </Field>
        </div>
        {slotType === 'FAITH_PROJECT' && (
          <Field label="Who is prayed for" htmlFor="slot-mode">
            <Segmented
              label="Who is prayed for"
              value={targetMode}
              onChange={(value) => setTargetMode(value as PrayerTargetMode)}
              options={[{ value: 'COHORT', label: 'One person for everyone' }, { value: 'HUB', label: 'A different person per hub' }]}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {targetMode === 'HUB'
                ? 'Each hub, with its supports and their participants, prays for someone different that day. Everyone gets a turn, then it starts again.'
                : 'The whole cohort prays for the same person.'}
            </p>
          </Field>
        )}
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <Toggle id="slot-notify" checked={notify} onChange={setNotify} label="Send a notification when it opens" hint="A push and a bell notification to participants and supports." />
          <Toggle id="slot-active" checked={active} onChange={setActive} label="Active" hint="Switch off to skip this slot without deleting it." />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </ModalShell>
  );
};

export default SlotEditorModal;
