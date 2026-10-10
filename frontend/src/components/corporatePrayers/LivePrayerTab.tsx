import React, { useEffect, useState } from 'react';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { corporatePrayersApi } from '../../services/api';
import type { PrayerOverview } from '../../types';
import { Field, INPUT, Notice, PRIMARY_BTN } from './ui';

// The live prayer (Telegram): the link, the wait before "Prayed" unlocks, and the one line shown above the link.

const LivePrayerTab: React.FC<{ overview: PrayerOverview; cohortId: string; onReload: () => void }> = ({ overview, cohortId, onReload }) => {
  const toast = useToast();
  const { can } = usePermissions();
  const canEdit = can('corporate_prayers', 'edit');
  const [link, setLink] = useState(overview.settings.telegramLink ?? '');
  const [wait, setWait] = useState(String(overview.settings.liveWaitMinutes));
  const [message, setMessage] = useState(overview.settings.liveMessage ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLink(overview.settings.telegramLink ?? '');
    setWait(String(overview.settings.liveWaitMinutes));
    setMessage(overview.settings.liveMessage ?? '');
  }, [overview.settings.telegramLink, overview.settings.liveWaitMinutes, overview.settings.liveMessage]);

  const hasLiveSlot = overview.slots.some((slot) => slot.slotType === 'LIVE' && slot.active);
  const looksTelegram = !link.trim() || /^https:\/\/(t\.me|telegram\.me|telegram\.org)\//i.test(link.trim());

  const save = async () => {
    const minutes = Math.round(Number(wait));
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60) { setError('The wait must be between 0 and 60 minutes.'); return; }
    setSaving(true);
    setError('');
    try {
      await corporatePrayersApi.saveSettings(cohortId, { telegramLink: link.trim(), liveWaitMinutes: minutes, liveMessage: message.trim() });
      toast({ message: 'Live prayer settings saved' });
      onReload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl space-y-5">
      <section className="surface-card space-y-4 p-5">
        <div>
          <h2 className="text-base font-bold text-gray-900">Live prayer on Telegram</h2>
          <p className="mt-1 text-[13px] leading-normal text-gray-500">At the live slot, everyone sees a pop-up with this link. Someone is waiting on Telegram to lead. The pop-up cannot be closed until they tap Prayed.</p>
        </div>
        <fieldset disabled={!canEdit} className="space-y-4">
        {hasLiveSlot && !link.trim() && <Notice tone="warn">There is a live slot but no link yet, so the pop-up will not appear. Add the link and save.</Notice>}
        <Field label="Telegram link" htmlFor="live-link" hint="A t.me link to the group, channel or call.">
          <input id="live-link" type="url" inputMode="url" value={link} onChange={(event) => setLink(event.target.value)} className={INPUT} placeholder="https://t.me/…" />
        </Field>
        {!looksTelegram && <Notice tone="warn">This does not look like a Telegram link. You can still save it.</Notice>}
        {link.trim() && (
          <p className="text-[13px] text-gray-600">
            <a href={link.trim()} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">Open the link to test it</a>
            . I cannot check from here that a call link joins the call directly, so test it with a real link before the first live prayer.
          </p>
        )}
        <Field label="Prayed unlocks after (minutes)" htmlFor="live-wait" hint="Counted from the moment they tap the Telegram link. 0 unlocks it at once.">
          <input id="live-wait" type="number" inputMode="numeric" min={0} max={60} value={wait} onChange={(event) => setWait(event.target.value)} className={`${INPUT} sm:w-32`} />
        </Field>
        <Field label="Line above the link" htmlFor="live-message" hint="Optional. Up to 120 characters.">
          <input id="live-message" value={message} maxLength={120} onChange={(event) => setMessage(event.target.value)} className={INPUT} placeholder="Join the live prayer on Telegram" />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        {canEdit && (
          <button type="button" onClick={() => { void save(); }} disabled={saving} className={PRIMARY_BTN}>
            {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save'}
          </button>
        )}
        </fieldset>
      </section>
      <p className="text-[13px] text-gray-500">If someone cannot open Telegram, a way out appears for them ten minutes after they opened the pop-up.</p>
    </div>
  );
};

export default LivePrayerTab;
