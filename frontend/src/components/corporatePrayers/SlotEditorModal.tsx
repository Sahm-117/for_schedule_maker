import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import AppSelect from '../AppSelect';
import Spinner from '../Spinner';
import { corporatePrayersApi } from '../../services/api';
import type { PrayerBlock, PrayerSlot, PrayerSlotType, PrayerTargetMode, PrayerVerse } from '../../types';
import { PRAYER_TYPE_LABEL, clockLabel } from '../../utils/prayerText';
import { Field, INPUT, Notice, PRIMARY_BTN, SECONDARY_BTN, Segmented, Toggle } from './ui';

// Add or edit one daily slot as a short wizard: type and time, then the template (or the live link), who it goes to, the timing,
// and a summary to check before saving. Editing never rewrites days that already ran: it applies from the next day a slot is made.

type Step = 'type' | 'template' | 'audience' | 'timing' | 'summary';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cohortId: string;
  slot: PrayerSlot | null;
  hubs: Array<{ id: string; name: string }>;
  onSaved: () => void;
}

const SmallButton: React.FC<{ onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }> = ({ onClick, disabled, label, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">{children}</button>
);

const SlotEditorModal: React.FC<Props> = ({ isOpen, onClose, cohortId, slot, hubs, onSaved }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [time, setTime] = useState('05:50');
  const [slotType, setSlotType] = useState<PrayerSlotType>('PRAYER');
  const [blocks, setBlocks] = useState<PrayerBlock[]>([]);
  const [telegramLink, setTelegramLink] = useState('');
  const [liveWait, setLiveWait] = useState('5');
  const [liveMessage, setLiveMessage] = useState('');
  const [audienceAll, setAudienceAll] = useState(true);
  const [hubIds, setHubIds] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<PrayerTargetMode>('HUB');
  const [timer, setTimer] = useState('15');
  const [windowMins, setWindowMins] = useState('15');
  const [notify, setNotify] = useState(true);
  const [active, setActive] = useState(true);
  const [verses, setVerses] = useState<PrayerVerse[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const steps: Array<{ key: Step; label: string }> = useMemo(() => [
    { key: 'type', label: 'Type' },
    { key: 'template', label: slotType === 'LIVE' ? 'Link' : 'Template' },
    { key: 'audience', label: 'Audience' },
    { key: 'timing', label: 'Timing' },
    { key: 'summary', label: 'Summary' },
  ], [slotType]);
  const step = steps[stepIndex].key;
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!isOpen) return;
    setStepIndex(0);
    setName(slot?.name ?? '');
    setTime(slot?.time ?? '05:50');
    setSlotType(slot?.slotType ?? 'PRAYER');
    setBlocks(slot?.blocks ?? []);
    setTelegramLink(slot?.telegramLink ?? '');
    setLiveWait(String(slot?.liveWaitMinutes ?? 5));
    setLiveMessage(slot?.liveMessage ?? '');
    setAudienceAll(slot?.audienceAll ?? true);
    setHubIds(slot?.hubIds ?? []);
    setTargetMode(slot?.targetMode ?? 'HUB');
    setTimer(String(slot?.timerMinutes ?? 15));
    setWindowMins(String(slot?.joinWindowMinutes ?? 15));
    setNotify(slot?.notify ?? true);
    setActive(slot?.active ?? true);
    setError('');
    setVerses(null);
    let cancelled = false;
    void corporatePrayersApi.listVerses().then((list) => { if (!cancelled) setVerses(list); }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the verses.'); });
    return () => { cancelled = true; };
    // Only when the dialog opens, so a refresh behind it never wipes what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // A message about a field goes away as soon as that field is changed.
  useEffect(() => { setError(''); }, [time, blocks, telegramLink, liveWait, audienceAll, hubIds, timer, windowMins]);

  const verseById = useMemo(() => new Map((verses ?? []).map((verse) => [verse.id, verse])), [verses]);
  const hubName = (id: string) => hubs.find((hub) => hub.id === id)?.name ?? 'A hub';
  const usedVerseIds = new Set(blocks.flatMap((block) => (block.type === 'VERSE' ? [block.verseId] : [])));
  const hasProject = blocks.some((block) => block.type === 'FAITH_PROJECT');
  const looksTelegram = !telegramLink.trim() || /^https:\/\/(t\.me|telegram\.me|telegram\.org)\//i.test(telegramLink.trim());

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
  };

  const toggleHub = (id: string) => setHubIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));

  // Each step checks only what it asked for, so the problem shows where the person is looking.
  const checkStep = (key: Step): string => {
    if (key === 'type' && !/^\d{2}:\d{2}$/.test(time)) return 'Enter a time such as 05:50.';
    if (key === 'template') {
      if (slotType === 'PRAYER' && blocks.length === 0) return 'Add at least one verse or the faith project.';
      if (slotType === 'LIVE') {
        if (!telegramLink.trim()) return 'Add the Telegram link.';
        if (!/^https:\/\//i.test(telegramLink.trim())) return 'The link must start with https://';
        const wait = Number(liveWait);
        if (!Number.isFinite(wait) || wait < 0 || wait > 60) return 'The wait must be between 0 and 60 minutes.';
      }
    }
    if (key === 'audience' && !audienceAll && hubIds.length === 0) return 'Choose at least one hub, or choose Everyone.';
    if (key === 'timing') {
      const timerMinutes = Math.round(Number(timer));
      const joinWindowMinutes = Math.round(Number(windowMins));
      if (slotType === 'PRAYER' && (!Number.isFinite(timerMinutes) || timerMinutes < 1 || timerMinutes > 120)) return 'The timer must be between 1 and 120 minutes.';
      if (!Number.isFinite(joinWindowMinutes) || joinWindowMinutes < 1 || joinWindowMinutes > 240) return 'The join window must be between 1 and 240 minutes.';
    }
    return '';
  };

  const next = () => {
    const problem = checkStep(step);
    if (problem) { setError(problem); return; }
    setError('');
    setStepIndex((index) => Math.min(steps.length - 1, index + 1));
  };
  const back = () => { setError(''); setStepIndex((index) => Math.max(0, index - 1)); };

  const save = async () => {
    for (const entry of steps.slice(0, -1)) {
      const problem = checkStep(entry.key);
      if (problem) { setError(problem); setStepIndex(steps.findIndex((item) => item.key === entry.key)); return; }
    }
    setSaving(true);
    setError('');
    try {
      await corporatePrayersApi.saveSlot(cohortId, {
        id: slot?.id ?? null,
        name: name.trim(),
        time,
        slotType,
        timerMinutes: slotType === 'LIVE' ? 15 : Math.round(Number(timer)),
        joinWindowMinutes: Math.round(Number(windowMins)),
        targetMode: slotType === 'PRAYER' ? (!audienceAll && hubIds.length === 1 ? 'HUB' : targetMode) : null,
        notify,
        active,
        blocks: slotType === 'PRAYER' ? blocks : [],
        audienceAll,
        hubIds: audienceAll ? [] : hubIds,
        telegramLink: slotType === 'LIVE' ? telegramLink.trim() : '',
        liveWaitMinutes: slotType === 'LIVE' ? Math.round(Number(liveWait)) : 5,
        liveMessage: slotType === 'LIVE' ? liveMessage.trim() : '',
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the slot.');
    } finally { setSaving(false); }
  };

  const audienceText = audienceAll ? 'Everyone' : hubIds.map(hubName).join(', ');
  const addable = (verses ?? []).filter((verse) => verse.active && !usedVerseIds.has(verse.id));

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={slot ? 'Edit slot' : 'Add a slot'}
      subtitle="Slots run every day, from the start week to the end of the cohort."
      footer={(
        <>
          <button type="button" onClick={stepIndex === 0 ? onClose : back} className={SECONDARY_BTN}>{stepIndex === 0 ? 'Cancel' : 'Back'}</button>
          {isLast ? (
            <button type="button" onClick={() => { void save(); }} disabled={saving} className={PRIMARY_BTN}>
              {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save slot'}
            </button>
          ) : (
            <button type="button" onClick={next} className={PRIMARY_BTN}>Next</button>
          )}
        </>
      )}
    >
      <ol className="mb-5 flex items-center gap-1.5" aria-label="Steps">
        {steps.map((entry, index) => (
          <li key={entry.key} className="flex min-w-0 flex-1 flex-col gap-1" aria-current={index === stepIndex ? 'step' : undefined}>
            <span className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-primary' : 'bg-gray-200'}`} />
            <span className={`truncate text-[11px] font-semibold ${index === stepIndex ? 'text-gray-900' : 'text-gray-400'}`}>{entry.label}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-5">
        {step === 'type' && (
          <>
            <Field label="Type" htmlFor="slot-type">
              <Segmented
                label="Slot type"
                value={slotType}
                onChange={(value) => setSlotType(value as PrayerSlotType)}
                options={(['PRAYER', 'LIVE'] as PrayerSlotType[]).map((value) => ({ value, label: PRAYER_TYPE_LABEL[value] }))}
              />
              <p className="mt-1.5 text-xs text-gray-500">
                {slotType === 'PRAYER' ? 'A person’s picture with the verses (and, if you like, their faith project) you choose.' : 'A pop-up with a Telegram link for the hubs you choose.'}
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
          </>
        )}

        {step === 'template' && slotType === 'PRAYER' && (
          <>
            <div>
              <h3 className="text-sm font-bold text-gray-900">What people see, in order</h3>
              <p className="mt-0.5 text-[13px] text-gray-500">The person’s picture is always at the top. The verses stay the same; only the person changes.</p>
            </div>
            {blocks.length === 0 ? (
              <p className="rounded-2xl bg-gray-50/80 px-4 py-6 text-center text-sm text-gray-500">Nothing yet. Add a verse or the faith project below.</p>
            ) : (
              <ol className="space-y-2">
                {blocks.map((block, index) => {
                  const verse = block.type === 'VERSE' ? verseById.get(block.verseId) : null;
                  return (
                    <li key={`${block.type}-${index}`} className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2.5">
                      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-white text-xs font-bold text-gray-500">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{block.type === 'FAITH_PROJECT' ? 'Faith project' : (verse?.title ?? 'Verse')}</p>
                        <p className="truncate text-xs text-gray-500">{block.type === 'FAITH_PROJECT' ? 'What the person is believing God for, as they wrote it' : (verse ? verse.reference : verses ? 'This verse is no longer in the library' : 'Loading…')}</p>
                      </div>
                      <SmallButton onClick={() => moveBlock(index, -1)} disabled={index === 0} label={`Move item ${index + 1} up`}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m6 15 6-6 6 6" /></svg>
                      </SmallButton>
                      <SmallButton onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} label={`Move item ${index + 1} down`}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m6 9 6 6 6-6" /></svg>
                      </SmallButton>
                      <SmallButton onClick={() => setBlocks((prev) => prev.filter((_, i) => i !== index))} label={`Remove item ${index + 1}`}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M6 6l12 12M18 6 6 18" /></svg>
                      </SmallButton>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <AppSelect
                label="Add a verse"
                value=""
                onChange={(value) => { if (value) setBlocks((prev) => [...prev, { type: 'VERSE', verseId: value }]); }}
                options={addable.map((verse) => ({ value: verse.id, label: verse.title, meta: verse.reference }))}
                placeholder={verses === null ? 'Loading verses…' : addable.length === 0 ? (verses.length === 0 ? 'No verses yet. Add some on the Verses tab.' : 'All active verses are added') : 'Choose a verse by title'}
                disabled={verses === null || addable.length === 0}
              />
              <button type="button" onClick={() => setBlocks((prev) => [...prev, { type: 'FAITH_PROJECT' }])} disabled={hasProject} className={SECONDARY_BTN}>Add faith project</button>
            </div>
          </>
        )}

        {step === 'template' && slotType === 'LIVE' && (
          <>
            <Field label="Telegram link" htmlFor="live-link" hint="A t.me link to the group, channel or call. Different hubs can have different links: make one live slot for each.">
              <input id="live-link" type="url" inputMode="url" value={telegramLink} onChange={(event) => setTelegramLink(event.target.value)} className={INPUT} placeholder="https://t.me/…" />
            </Field>
            {!looksTelegram && <Notice tone="warn">This does not look like a Telegram link. You can still save it.</Notice>}
            {telegramLink.trim() && (
              <p className="text-[13px] text-gray-600">
                <a href={telegramLink.trim()} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">Open the link to test it</a>
                . I cannot check from here that a call link joins the call directly, so test it with a real link before the first live prayer.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prayed unlocks after (minutes)" htmlFor="live-wait" hint="Counted from the moment they tap the link. 0 unlocks it at once.">
                <input id="live-wait" type="number" inputMode="numeric" min={0} max={60} value={liveWait} onChange={(event) => setLiveWait(event.target.value)} className={INPUT} />
              </Field>
              <Field label="Line above the link" htmlFor="live-message" hint="Optional. Up to 120 characters.">
                <input id="live-message" value={liveMessage} maxLength={120} onChange={(event) => setLiveMessage(event.target.value)} className={INPUT} placeholder="Join the live prayer on Telegram" />
              </Field>
            </div>
          </>
        )}

        {step === 'audience' && (
          <>
            <Field label="Who gets this" htmlFor="slot-audience">
              <Segmented
                label="Audience"
                value={audienceAll ? 'ALL' : 'HUBS'}
                onChange={(value) => setAudienceAll(value === 'ALL')}
                options={[{ value: 'ALL', label: 'Everyone' }, { value: 'HUBS', label: 'Chosen hubs' }]}
              />
              <p className="mt-1.5 text-xs text-gray-500">{audienceAll ? 'Every hub: its supports and their participants.' : 'The supports in the hubs you tick, and the participants of those supports.'}</p>
            </Field>
            {!audienceAll && (
              hubs.length === 0 ? <Notice tone="warn">This cohort has no hubs yet.</Notice> : (
                <div role="group" aria-label="Hubs" className="flex flex-wrap gap-2">
                  {hubs.map((hub) => {
                    const on = hubIds.includes(hub.id);
                    return (
                      <button key={hub.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggleHub(hub.id)} className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {on && <span aria-hidden="true">✓ </span>}{hub.name}
                      </button>
                    );
                  })}
                </div>
              )
            )}
            {slotType === 'PRAYER' && (audienceAll || hubIds.length !== 1) && (
              <Field label="Who is prayed for" htmlFor="slot-mode">
                <Segmented
                  label="Who is prayed for"
                  value={targetMode}
                  onChange={(value) => setTargetMode(value as PrayerTargetMode)}
                  options={[{ value: 'HUB', label: 'A different person per hub' }, { value: 'COHORT', label: 'The same person for all' }]}
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  {targetMode === 'HUB'
                    ? 'Each hub sees a different person with the same verses. The app remembers who has had a turn and cycles through everyone.'
                    : 'Every hub sees the same person that day. The app still remembers who has had a turn.'}
                </p>
              </Field>
            )}
          </>
        )}

        {step === 'timing' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {slotType === 'PRAYER' && (
                <Field label="Timer (minutes)" htmlFor="slot-timer" hint="How long each person prays. They can leave any time.">
                  <input id="slot-timer" type="number" inputMode="numeric" min={1} max={120} value={timer} onChange={(event) => setTimer(event.target.value)} className={INPUT} />
                </Field>
              )}
              <Field label="Joinable for (minutes)" htmlFor="slot-window" hint="How long after it opens people can still join.">
                <input id="slot-window" type="number" inputMode="numeric" min={1} max={240} value={windowMins} onChange={(event) => setWindowMins(event.target.value)} className={INPUT} />
              </Field>
            </div>
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <Toggle id="slot-notify" checked={notify} onChange={setNotify} label="Send a notification when it opens" hint="A push and a bell notification to the people it goes to." />
              <Toggle id="slot-active" checked={active} onChange={setActive} label="Active" hint="Switch off to skip this slot without deleting it." />
            </div>
          </>
        )}

        {step === 'summary' && (
          <div className="space-y-4">
            <p className="text-[13px] text-gray-500">Check everything, then save. You can come back and edit it any time.</p>
            <dl className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-gray-50 text-sm">
              {[
                ['Type', PRAYER_TYPE_LABEL[slotType]],
                ['When', `Every day at ${clockLabel(time)}${name.trim() ? ` · ${name.trim()}` : ''}`],
                ['Goes to', audienceText],
                ...(slotType === 'PRAYER' ? [['Who is prayed for', audienceAll || hubIds.length !== 1 ? (targetMode === 'HUB' ? 'A different person per hub' : 'The same person for all') : 'One person for the hub']] : []),
                ['Timing', `${slotType === 'PRAYER' ? `${timer} minute timer · ` : ''}joinable for ${windowMins} minutes`],
                ['Notification', notify ? 'Sent when it opens' : 'None'],
                ['Status', active ? 'Active' : 'Off'],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 px-4 py-2.5">
                  <dt className="w-32 flex-none text-gray-500">{label}</dt>
                  <dd className="min-w-0 flex-1 font-semibold text-gray-900 [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
            {slotType === 'PRAYER' ? (
              <div>
                <h3 className="text-sm font-bold text-gray-900">What people see</h3>
                <ol className="mt-2 space-y-1.5 text-sm">
                  <li className="rounded-xl bg-gray-50 px-3 py-2 text-gray-600">The person’s picture and full name</li>
                  {blocks.map((block, index) => (
                    <li key={index} className="rounded-xl bg-gray-50 px-3 py-2 font-semibold text-gray-900">
                      {block.type === 'FAITH_PROJECT' ? 'Their faith project' : (verseById.get(block.verseId)?.title ?? 'Verse')}
                      {block.type === 'VERSE' && verseById.get(block.verseId) && <span className="ml-2 font-normal text-gray-500">{verseById.get(block.verseId)?.reference}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700 [overflow-wrap:anywhere]">
                {telegramLink.trim()} · Prayed unlocks {Number(liveWait) === 0 ? 'at once' : `${liveWait} minutes after the link is tapped`}
              </div>
            )}
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </ModalShell>
  );
};

export default SlotEditorModal;
