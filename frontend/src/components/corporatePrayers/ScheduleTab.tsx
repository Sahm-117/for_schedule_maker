import React, { useEffect, useState } from 'react';
import AppSelect from '../AppSelect';
import AppOverflowMenu from '../AppOverflowMenu';
import ConfirmationModal from '../ConfirmationModal';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { corporatePrayersApi, faithProjectSettingsApi } from '../../services/api';
import type { PrayerOverview, PrayerSlot, Week } from '../../types';
import { PRAYER_TYPE_LABEL, clockLabel } from '../../utils/prayerText';
import { Field, INPUT, Notice, PRIMARY_BTN } from './ui';

// Schedule tab: when prayers start, and the slots that run every day from then.

interface Props {
  overview: PrayerOverview;
  cohortId: string;
  weeks: Week[];
  onReload: () => void;
  onAdd: () => void;
  onEdit: (slot: PrayerSlot) => void;
}

const TYPE_CHIP: Record<PrayerSlot['slotType'], string> = {
  VERSE: 'bg-sky-100/80 text-sky-700',
  FAITH_PROJECT: 'bg-violet-100/80 text-violet-700',
  LIVE: 'bg-rose-100/80 text-rose-700',
};

const dayLabel = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
};

const ScheduleTab: React.FC<Props> = ({ overview, cohortId, weeks, onReload, onAdd, onEdit }) => {
  const toast = useToast();
  const { can } = usePermissions();
  const canAdd = can('corporate_prayers', 'add');
  const canEdit = can('corporate_prayers', 'edit');
  const canDelete = can('corporate_prayers', 'delete');
  const [startWeek, setStartWeek] = useState(overview.startWeekNumber ? String(overview.startWeekNumber) : '');
  const [daysBefore, setDaysBefore] = useState(String(overview.popupDaysBefore));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<PrayerSlot | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  useEffect(() => {
    setStartWeek(overview.startWeekNumber ? String(overview.startWeekNumber) : '');
    setDaysBefore(String(overview.popupDaysBefore));
  }, [overview.startWeekNumber, overview.popupDaysBefore]);

  const saveStart = async () => {
    if (!daysBefore.trim() || !Number.isFinite(Number(daysBefore))) { setError('Enter how many days before, from 0 to 30.'); return; }
    const days = Math.min(30, Math.max(0, Math.round(Number(daysBefore))));
    setSaving(true);
    setError('');
    try {
      // The write-it-by date lives in the same setting: keep it as it is.
      const { settings } = await faithProjectSettingsApi.get(cohortId);
      await faithProjectSettingsApi.set(cohortId, { deadlineAt: settings.deadlineAt, prayersStartWeekNumber: startWeek ? Number(startWeek) : null, prayerPopupDaysBefore: days });
      setDaysBefore(String(days));
      toast({ message: startWeek ? `Corporate prayers start in Week ${startWeek}` : 'Start week cleared' });
      onReload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the start week.'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (slot: PrayerSlot) => {
    try {
      await corporatePrayersApi.saveSlot(cohortId, { ...slot, id: slot.id, name: slot.name ?? '', time: slot.time, active: !slot.active });
      toast({ message: slot.active ? 'Slot switched off' : 'Slot switched on' });
      onReload();
    } catch (err) { toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not update the slot.' }); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await corporatePrayersApi.deleteSlot(deleting.id);
      toast({ message: 'Slot deleted' });
      setDeleting(null);
      onReload();
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not delete the slot.' });
      setDeleting(null);
    } finally { setBusyDelete(false); }
  };

  const startText = dayLabel(overview.startDate);
  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  return (
    <div className="space-y-5">
      <section className="surface-card p-5" aria-labelledby="cp-start">
        <h2 id="cp-start" className="text-base font-bold text-gray-900">When prayers start</h2>
        <p className="mt-1 text-[13px] leading-normal text-gray-500">From the class day of this week, the slots below run every day. A few days before, participants are asked whether they are happy to be prayed for.</p>
        <fieldset disabled={!canEdit} className="contents">
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <AppSelect
            label="Starts in"
            value={startWeek}
            onChange={setStartWeek}
            options={[{ value: '', label: 'Not set yet' }, ...sortedWeeks.map((week) => ({ value: String(week.weekNumber), label: `Week ${week.weekNumber}${week.title ? ` · ${week.title}` : ''}` }))]}
            placeholder="Not set yet"
          />
          <Field label="Pop-up days before" htmlFor="cp-days">
            <input id="cp-days" type="number" inputMode="numeric" min={0} max={30} value={daysBefore} onChange={(event) => setDaysBefore(event.target.value)} className={`${INPUT} sm:w-28`} />
          </Field>
          {canEdit && (
            <button type="button" onClick={() => { void saveStart(); }} disabled={saving} className={PRIMARY_BTN}>
              {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save'}
            </button>
          )}
        </div>
        </fieldset>
        {startText && <p className="mt-3 text-sm font-semibold text-gray-700">First prayer day: {startText}</p>}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </section>

      <section aria-labelledby="cp-slots">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="cp-slots" className="text-base font-bold text-gray-900">Daily slots</h2>
            <p className="text-[13px] text-gray-500">{overview.slots.length === 0 ? 'None yet.' : `${overview.slots.filter((slot) => slot.active).length} on, every day.`}</p>
          </div>
        </div>
        {overview.slots.length === 0 ? (
          <div className="rounded-2xl bg-gray-50/80 px-4 py-10 text-center">
            <p className="text-sm text-gray-500">{canAdd ? 'No slots yet. Add the first one.' : 'No slots yet.'}</p>
            {canAdd && <button type="button" onClick={onAdd} className={`${PRIMARY_BTN} mt-3`}>Add a slot</button>}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.slots.map((slot) => {
              const menuItems = [
                ...(canEdit ? [{ label: 'Edit', onClick: () => onEdit(slot) }, { label: slot.active ? 'Switch off' : 'Switch on', onClick: () => { void toggleActive(slot); } }] : []),
                ...(canDelete ? [{ label: 'Delete', onClick: () => setDeleting(slot), tone: 'danger' as const }] : []),
              ];
              return (
              <li key={slot.id} className={`surface-card flex flex-col gap-2.5 p-4 ${slot.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[26px] font-extrabold leading-none tracking-tight text-gray-900">{clockLabel(slot.time)}</p>
                    <p className="mt-1 truncate text-sm text-gray-600">{slot.name || PRAYER_TYPE_LABEL[slot.slotType]}</p>
                  </div>
                  {menuItems.length > 0 && <AppOverflowMenu align="right" items={menuItems} />}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_CHIP[slot.slotType]}`}>{PRAYER_TYPE_LABEL[slot.slotType]}</span>
                  {slot.slotType !== 'LIVE' && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">{slot.timerMinutes} min timer</span>}
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">open {slot.joinWindowMinutes} min</span>
                  {slot.slotType === 'FAITH_PROJECT' && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">{slot.targetMode === 'HUB' ? 'By hub' : 'One person'}</span>}
                  {!slot.notify && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">No notification</span>}
                  {!slot.active && <span className="rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Off</span>}
                </div>
                {slot.today && <p className="text-[13px] text-gray-500">Today: {slot.today.counts.praying} praying, {slot.today.counts.amen} said Amen</p>}
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { void remove(); }}
        title="Delete this slot?"
        message={deleting ? `The ${clockLabel(deleting.time)} slot will be removed. If it has already run it cannot be deleted, only switched off.` : ''}
        confirmText="Delete"
        confirmLoading={busyDelete}
      />
    </div>
  );
};

export default ScheduleTab;
