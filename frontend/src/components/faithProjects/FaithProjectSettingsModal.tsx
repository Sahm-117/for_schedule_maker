import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import AppSelect from '../AppSelect';
import { useToast } from '../Toast';
import { useAppData } from '../../context/AppDataContext';
import { faithProjectCategoriesApi, faithProjectSettingsApi } from '../../services/api';
import type { FaithProjectCategory, FaithProjectSettings } from '../../types';
import Spinner from '../Spinner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cohortId: string;
  categories: FaithProjectCategory[];
  settings: FaithProjectSettings;
  onChanged: (settings: FaithProjectSettings, categories: FaithProjectCategory[]) => void;
}

const toInputValue = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const FaithProjectSettingsModal: React.FC<Props> = ({ isOpen, onClose, cohortId, categories, settings, onChanged }) => {
  const toast = useToast();
  const { weeks } = useAppData();
  const [startWeek, setStartWeek] = useState(settings.prayersStartWeekNumber ? String(settings.prayersStartWeekNumber) : '');
  const [daysBefore, setDaysBefore] = useState(String(settings.prayerPopupDaysBefore));
  const [savingPrayers, setSavingPrayers] = useState(false);
  const [deadline, setDeadline] = useState(toInputValue(settings.deadlineAt));
  const [categoryName, setCategoryName] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDeadline(toInputValue(settings.deadlineAt));
    setStartWeek(settings.prayersStartWeekNumber ? String(settings.prayersStartWeekNumber) : '');
    setDaysBefore(String(settings.prayerPopupDaysBefore));
    setCategoryName('');
    setError('');
    // Only when the dialog opens: saving one section must not reset what is typed in another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const saveDeadline = async () => {
    setSavingDeadline(true);
    setError('');
    try {
      const { settings: saved } = await faithProjectSettingsApi.set(cohortId, {
        deadlineAt: deadline ? new Date(deadline).toISOString() : null,
        prayersStartWeekNumber: settings.prayersStartWeekNumber,
        prayerPopupDaysBefore: settings.prayerPopupDaysBefore,
      });
      onChanged(saved, categories);
      toast({ message: deadline ? 'Write-it-by date saved' : 'Write-it-by date cleared' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the date.'); }
    finally { setSavingDeadline(false); }
  };

  const savePrayers = async () => {
    if (!daysBefore.trim() || !Number.isFinite(Number(daysBefore))) { setError('Enter how many days before, from 0 to 30.'); return; }
    const days = Math.min(30, Math.max(0, Math.round(Number(daysBefore))));
    setSavingPrayers(true);
    setError('');
    try {
      const { settings: saved } = await faithProjectSettingsApi.set(cohortId, {
        deadlineAt: settings.deadlineAt,
        prayersStartWeekNumber: startWeek ? Number(startWeek) : null,
        prayerPopupDaysBefore: days,
      });
      onChanged(saved, categories);
      setDaysBefore(String(days));
      toast({ message: startWeek ? `Corporate prayers start in Week ${startWeek}` : 'Corporate prayers start date cleared' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the corporate prayers settings.'); }
    finally { setSavingPrayers(false); }
  };

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    setSavingCategory(true);
    setError('');
    try {
      const { category } = await faithProjectCategoriesApi.create(cohortId, categoryName);
      // Read back the list so the chips only claim a category is available once it
      // has genuinely persisted, and so this view stays in sync with the database.
      const { categories: savedCategories } = await faithProjectCategoriesApi.getAll(cohortId);
      onChanged(settings, savedCategories);
      setCategoryName('');
      toast({ message: `${category.name} added to Faith Project categories` });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add category.'); }
    finally { setSavingCategory(false); }
  };

  const archive = async (category: FaithProjectCategory) => {
    setError('');
    try {
      await faithProjectCategoriesApi.archive(category.id);
      const { categories: savedCategories } = await faithProjectCategoriesApi.getAll(cohortId);
      onChanged(settings, savedCategories);
      toast({ message: `${category.name} archived` });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not archive category.'); }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Faith Project settings" subtitle="Dates for this cohort · Categories for every cohort.">
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-bold text-gray-900">Write-it-by date</h3>
          <p className="mt-1 text-[13px] leading-normal text-gray-500">A soft date. Projects can still be saved after it, and participants see that it has passed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button type="button" onClick={() => { void saveDeadline(); }} disabled={savingDeadline} className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{savingDeadline ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save date'}</button>
          </div>
          {deadline && <button type="button" onClick={() => setDeadline('')} className="mt-2 text-xs font-semibold text-[#c2410c]">Clear date</button>}
        </section>

        <section className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-bold text-gray-900">Corporate prayers</h3>
          <p className="mt-1 text-[13px] leading-normal text-gray-500">From the class day of this week, saved faith projects are prayed for unless the participant opts out. A few days before, everyone gets a pop-up they must answer: &ldquo;I&apos;m fine with this&rdquo; or &ldquo;Opt out&rdquo;.</p>
          <div className="mt-3 space-y-3">
            <AppSelect
              label="Starts in"
              value={startWeek}
              onChange={setStartWeek}
              options={[{ value: '', label: 'Not set yet' }, ...[...weeks].sort((a, b) => a.weekNumber - b.weekNumber).map((week) => ({ value: String(week.weekNumber), label: `Week ${week.weekNumber}${week.classDate ? ` · class ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${week.classDate.slice(0, 10)}T12:00:00`))}` : ''}` }))]}
              placeholder="Not set yet"
            />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Pop-up starts this many days before</span>
              <input type="number" inputMode="numeric" min={0} max={30} value={daysBefore} onChange={(event) => setDaysBefore(event.target.value)} className="min-h-[44px] w-28 rounded-xl border border-gray-200 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <button type="button" onClick={() => { void savePrayers(); }} disabled={savingPrayers} className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{savingPrayers ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}</button>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-bold text-gray-900">Categories</h3>
          <p className="mt-1 text-[13px] leading-normal text-gray-500">Shared across every cohort. Supports and admins can give a project a category. It is optional.</p>
          <div className="mt-3 flex gap-2">
            <input aria-label="New Faith Project category" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addCategory(); } }} placeholder="New category, e.g. Family" className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button type="button" onClick={() => { void addCategory(); }} disabled={!categoryName.trim() || savingCategory} className="min-h-[44px] rounded-xl border border-orange-200 bg-white px-4 text-sm font-semibold text-primary disabled:opacity-60">{savingCategory ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Adding…</span>) : 'Add category'}</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" aria-live="polite">
            {categories.length === 0 ? <p className="text-sm text-gray-500">No categories yet.</p> : categories.map((category) => (
              <span key={category.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white py-1 pl-3 pr-1 text-sm font-semibold text-gray-700">
                {category.name}
                <button type="button" onClick={() => { void archive(category); }} aria-label={`Archive ${category.name}`} title="Archive category" className="grid h-7 w-7 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
              </span>
            ))}
          </div>
        </section>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      </div>
    </ModalShell>
  );
};

export default FaithProjectSettingsModal;
