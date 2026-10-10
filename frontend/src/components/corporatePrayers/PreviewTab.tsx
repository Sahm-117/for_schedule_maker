import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppSelect from '../AppSelect';
import PageLoader from '../PageLoader';
import { corporatePrayersApi } from '../../services/api';
import type { PrayerOverview, PrayerPreview } from '../../types';
import { PRAYER_TYPE_LABEL, clockLabel } from '../../utils/prayerText';
import { Notice } from './ui';
import PrayerSlotScreen from './PrayerSlotScreen';
import LivePrayerCard from './LivePrayerCard';

// Exactly what people see, drawn by the same components as the real prayer screen, with a sample count. Nothing is sent
// and no session is made. "Next in rotation" shows who would come up next without moving the rotation.

const PreviewTab: React.FC<{ overview: PrayerOverview; cohortId: string }> = ({ overview, cohortId }) => {
  const slots = useMemo(() => overview.slots, [overview.slots]);
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '');
  const [personId, setPersonId] = useState('');
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [preview, setPreview] = useState<PrayerPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const slot = slots.find((entry) => entry.id === slotId) ?? null;

  useEffect(() => { if (!slotId && slots[0]) setSlotId(slots[0].id); }, [slots, slotId]);

  // The people who can be previewed for this slot's pool.
  useEffect(() => {
    if (!slot || slot.slotType === 'LIVE') { setPeople([]); return; }
    let cancelled = false;
    void corporatePrayersApi.coverage(cohortId).then((coverage) => {
      if (cancelled) return;
      const pool = slot.blocks.some((block) => block.type === 'FAITH_PROJECT') ? 'FAITH' : 'NAME';
      const all = [...(coverage.notYet?.[pool] ?? []), ...(coverage.doneList?.[pool] ?? [])];
      setPeople(all.map((person) => ({ id: person.id, name: person.name })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [slot, cohortId]);

  const load = useCallback(async () => {
    if (!slotId) { setPreview(null); return; }
    setLoading(true);
    setError('');
    try { setPreview(await corporatePrayersApi.preview(slotId, personId || null)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not build the preview.'); setPreview(null); }
    finally { setLoading(false); }
  }, [slotId, personId]);
  useEffect(() => { void load(); }, [load]);

  if (slots.length === 0) return <div className="rounded-2xl bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-500">Add a slot first, then preview it here.</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <AppSelect
          label="Slot"
          value={slotId}
          onChange={(value) => { setSlotId(value); setPersonId(''); }}
          options={slots.map((entry) => ({ value: entry.id, label: `${clockLabel(entry.time)} · ${entry.name || PRAYER_TYPE_LABEL[entry.slotType]}` }))}
          placeholder="Choose a slot"
        />
        {slot && slot.slotType !== 'LIVE' && (
          <AppSelect
            label="Person"
            value={personId}
            onChange={setPersonId}
            options={[{ value: '', label: 'Next in rotation' }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
            placeholder="Next in rotation"
          />
        )}
        <Notice tone="info">This is a preview. Nothing is sent, and the rotation does not move.</Notice>
      </div>
      <div className="flex justify-center lg:justify-start">
        {loading && !preview ? <PageLoader /> : error ? <Notice tone="error">{error}</Notice> : preview && (
          preview.slot.slotType === 'LIVE' ? (
            <div className="w-full max-w-[390px] rounded-[28px] bg-white p-6 shadow-xl ring-1 ring-gray-200">
              {preview.live?.telegramLink ? (
                <LivePrayerCard
                  link={preview.live.telegramLink}
                  message={preview.live.message}
                  waitMinutes={preview.live.waitMinutes}
                  checkedInAtMs={Date.now()}
                  linkTappedAtMs={null}
                  clockOffsetMs={0}
                  busy={false}
                  error=""
                  onTapLink={() => undefined}
                  onPrayed={() => undefined}
                />
              ) : <Notice tone="warn">No Telegram link yet. Add it by editing this slot.</Notice>}
            </div>
          ) : (
            <PrayerSlotScreen
              embedded
              model={{
                slotLabel: preview.slot.name || clockLabel(preview.slot.time),
                person: preview.person,
                blocks: preview.blocks,
                counts: { joined: 10, praying: 7, amen: 3 },
                timerMinutes: preview.slot.timerMinutes,
                checkedInAtMs: null,
                amenDone: false,
              }}
              clockOffsetMs={0}
              onAmen={() => undefined}
              onLeave={() => undefined}
            />
          )
        )}
      </div>
    </div>
  );
};

export default PreviewTab;
