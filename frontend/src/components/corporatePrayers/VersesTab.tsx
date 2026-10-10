import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import ConfirmationModal from '../ConfirmationModal';
import AppOverflowMenu from '../AppOverflowMenu';
import PageLoader from '../PageLoader';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { corporatePrayersApi } from '../../services/api';
import type { PrayerVerse } from '../../types';
import { gendered, parseBulkVerses, renderPrayer } from '../../utils/prayerText';
import { Field, INPUT, Notice, PRIMARY_BTN, SECONDARY_BTN, Toggle } from './ui';

// The verse library. Slots use it in this order, cycling, and everyone sees the same verse. A prayer may carry the person's
// name as {{NAME}} (first name in capitals) or {{Name}} (first name as written). The project is shown separately as written,
// so a prayer must read correctly without knowing anyone's gender.

const PLACEHOLDER_HELP = 'Use {{NAME}} for the person’s first name in capitals, or {{Name}} as written.';

const VerseModal: React.FC<{ isOpen: boolean; verse: PrayerVerse | null; onClose: () => void; onSaved: () => void }> = ({ isOpen, verse, onClose, onSaved }) => {
  const [prayer, setPrayer] = useState('');
  const [reference, setReference] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPrayer(verse?.prayer ?? '');
    setReference(verse?.reference ?? '');
    setActive(verse?.active ?? true);
    setError('');
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const words = useMemo(() => gendered(prayer), [prayer]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await corporatePrayersApi.saveVerse({ id: verse?.id ?? null, prayer, reference, active });
      onSaved();
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the verse.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={verse ? 'Edit verse' : 'Add a verse'}
      footer={(
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>Cancel</button>
          <button type="button" onClick={() => { void save(); }} disabled={saving} className={PRIMARY_BTN}>{saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save verse'}</button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="Prayer" htmlFor="verse-prayer" hint={PLACEHOLDER_HELP}>
          <textarea id="verse-prayer" rows={5} value={prayer} onChange={(event) => setPrayer(event.target.value)} className={`${INPUT} resize-y py-2.5 leading-relaxed`} placeholder="Father, give you, {{NAME}}, the spirit of wisdom and revelation." />
        </Field>
        <Field label="Reference" htmlFor="verse-ref">
          <input id="verse-ref" value={reference} onChange={(event) => setReference(event.target.value)} className={INPUT} placeholder="Eph 1:17-18" />
        </Field>
        {words.length > 0 && <Notice tone="warn">This prayer uses {words.map((word) => `“${word}”`).join(', ')}. Prayers are read for men and women alike, so a gendered word may read wrongly. You can still save it.</Notice>}
        {prayer.trim() && (
          <div className="rounded-2xl bg-[#0b1020] p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Preview</p>
            <p className="mt-1.5 text-[16px] leading-relaxed">{renderPrayer(prayer, 'Adaeze')}</p>
            <p className="mt-1.5 text-sm font-semibold text-orange-300">{reference || 'Reference'}</p>
          </div>
        )}
        <Toggle id="verse-active" checked={active} onChange={setActive} label="Active" hint="Switched-off verses are skipped." />
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </ModalShell>
  );
};

const BulkModal: React.FC<{ isOpen: boolean; onClose: () => void; onSaved: () => void }> = ({ isOpen, onClose, onSaved }) => {
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (isOpen) { setRaw(''); setError(''); } }, [isOpen]);
  const parsed = useMemo(() => parseBulkVerses(raw), [raw]);
  const problems = parsed.filter((item) => item.problem).length;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await corporatePrayersApi.addVerses(parsed.map(({ prayer, reference }) => ({ prayer, reference })));
      onSaved();
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add the verses.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      wide
      title="Add several verses"
      subtitle="Paste prayers separated by a blank line. Put the reference on the last line of each, starting with a dash."
      footer={(
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>Cancel</button>
          <button type="button" onClick={() => { void save(); }} disabled={saving || parsed.length === 0 || problems > 0} className={PRIMARY_BTN}>
            {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Adding…</span> : `Add ${parsed.length || ''} verse${parsed.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <textarea
          aria-label="Verses to add"
          rows={9}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          className={`${INPUT} resize-y py-2.5 font-mono text-[13px] leading-relaxed`}
          placeholder={'Father, give you, {{NAME}}, the spirit of wisdom and revelation.\n- Eph 1:17-18\n\nLord, open the eyes of {{Name}}’s heart.\n- Ps 119:18'}
        />
        {parsed.length > 0 && (
          <ul className="space-y-2" aria-label="How these will be added">
            {parsed.map((item, index) => (
              <li key={index} className={`rounded-xl border px-3 py-2 text-sm ${item.problem ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
                <p className="line-clamp-2 text-gray-900">{item.prayer || '—'}</p>
                <p className={`mt-0.5 text-xs font-semibold ${item.problem ? 'text-red-700' : 'text-orange-700'}`}>{item.problem ?? item.reference}</p>
              </li>
            ))}
          </ul>
        )}
        {problems > 0 && <Notice tone="warn">Fix the {problems} marked above before adding.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </ModalShell>
  );
};

const VersesTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const toast = useToast();
  const [verses, setVerses] = useState<PrayerVerse[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PrayerVerse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleting, setDeleting] = useState<PrayerVerse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setVerses(await corporatePrayersApi.listVerses()); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the verses.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const changed = () => { void load(); onChanged(); };

  const move = async (index: number, direction: -1 | 1) => {
    if (!verses) return;
    const target = index + direction;
    if (target < 0 || target >= verses.length) return;
    const next = [...verses];
    [next[index], next[target]] = [next[target], next[index]];
    setVerses(next);
    try { await corporatePrayersApi.reorderVerses(next.map((verse) => verse.id)); }
    catch (err) { toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not reorder.' }); void load(); }
  };

  const toggleActive = async (verse: PrayerVerse) => {
    try { await corporatePrayersApi.saveVerse({ id: verse.id, prayer: verse.prayer, reference: verse.reference, active: !verse.active }); changed(); }
    catch (err) { toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not update the verse.' }); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await corporatePrayersApi.deleteVerse(deleting.id); setDeleting(null); changed(); toast({ message: 'Verse deleted' }); }
    catch (err) { toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not delete the verse.' }); setDeleting(null); }
    finally { setBusy(false); }
  };

  if (!verses && !error) return <PageLoader />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Verse library</h2>
          <p className="text-[13px] text-gray-500">{verses ? `${verses.filter((verse) => verse.active).length} active. Slots use them in this order, then start again.` : ''} {PLACEHOLDER_HELP}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setBulkOpen(true)} className={SECONDARY_BTN}>Add several</button>
          <button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className={PRIMARY_BTN}>Add verse</button>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {verses && verses.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-500">No verses yet. Slots of type Verse and Faith project cannot run until there is at least one.</div>
      ) : (
        <ol className="space-y-2.5">
          {(verses ?? []).map((verse, index) => (
            <li key={verse.id} className={`surface-card flex items-start gap-3 p-4 ${verse.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-none flex-col items-center gap-1 pt-0.5">
                <button type="button" onClick={() => { void move(index, -1); }} disabled={index === 0} aria-label={`Move verse ${index + 1} up`} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m6 15 6-6 6 6" /></svg>
                </button>
                <span className="text-xs font-bold tabular-nums text-gray-400">{index + 1}</span>
                <button type="button" onClick={() => { void move(index, 1); }} disabled={index === (verses?.length ?? 0) - 1} aria-label={`Move verse ${index + 1} down`} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m6 9 6 6 6-6" /></svg>
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-[15px] leading-relaxed text-gray-900">{verse.prayer}</p>
                <p className="mt-1 text-[13px] font-semibold text-orange-700">{verse.reference}</p>
                <p className="mt-1 text-xs text-gray-500">{verse.used === 0 ? 'Not used yet' : `Used ${verse.used} time${verse.used === 1 ? '' : 's'}`}{verse.active ? '' : ' · Off'}</p>
              </div>
              <AppOverflowMenu
                align="right"
                items={[
                  { label: 'Edit', onClick: () => { setEditing(verse); setFormOpen(true); } },
                  { label: verse.active ? 'Switch off' : 'Switch on', onClick: () => { void toggleActive(verse); } },
                  { label: verse.used > 0 ? 'Delete (used, switch off instead)' : 'Delete', onClick: () => { if (verse.used === 0) setDeleting(verse); else toast({ message: 'This verse has been used, so it can only be switched off.' }); }, tone: 'danger' },
                ]}
              />
            </li>
          ))}
        </ol>
      )}
      <VerseModal isOpen={formOpen} verse={editing} onClose={() => setFormOpen(false)} onSaved={changed} />
      <BulkModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} onSaved={changed} />
      <ConfirmationModal isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => { void remove(); }} title="Delete this verse?" message="It has not been used, so nothing is lost." confirmText="Delete" confirmLoading={busy} />
    </div>
  );
};

export default VersesTab;
