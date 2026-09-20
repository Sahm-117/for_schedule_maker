import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import { faithProjectCategoriesApi, faithProjectSettingsApi } from '../../services/api';
import type { FaithProjectCategory, FaithProjectSettings } from '../../types';

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
  const [deadline, setDeadline] = useState(toInputValue(settings.deadlineAt));
  const [categoryName, setCategoryName] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDeadline(toInputValue(settings.deadlineAt));
    setCategoryName('');
    setError('');
  }, [isOpen, settings.deadlineAt]);

  const saveDeadline = async () => {
    setSavingDeadline(true);
    setError('');
    try {
      const { settings: saved } = await faithProjectSettingsApi.set(cohortId, deadline ? new Date(deadline).toISOString() : null);
      onChanged(saved, categories);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the deadline.'); }
    finally { setSavingDeadline(false); }
  };

  const addCategory = async () => {
    if (!categoryName.trim()) return;
    setSavingCategory(true);
    setError('');
    try {
      const { category } = await faithProjectCategoriesApi.create(cohortId, categoryName);
      onChanged(settings, [...categories, category].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryName('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add category.'); }
    finally { setSavingCategory(false); }
  };

  const archive = async (category: FaithProjectCategory) => {
    setError('');
    try {
      await faithProjectCategoriesApi.archive(category.id);
      onChanged(settings, categories.filter((item) => item.id !== category.id));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not archive category.'); }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Faith Project settings" subtitle="Deadline and categories for this cohort.">
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-bold text-gray-900">Submission deadline</h3>
          <p className="mt-1 text-[13px] leading-normal text-gray-500">This is a soft deadline. Late projects can still be submitted and will be marked as late.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button type="button" onClick={() => { void saveDeadline(); }} disabled={savingDeadline} className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{savingDeadline ? 'Saving…' : 'Save'}</button>
          </div>
          {deadline && <button type="button" onClick={() => setDeadline('')} className="mt-2 text-xs font-semibold text-[#c2410c]">Clear deadline</button>}
        </section>

        <section className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-bold text-gray-900">Categories</h3>
          <p className="mt-1 text-[13px] leading-normal text-gray-500">Support chooses one before sending a project to back office.</p>
          <div className="mt-3 flex gap-2">
            <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addCategory(); } }} placeholder="e.g. Family" className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button type="button" onClick={() => { void addCategory(); }} disabled={!categoryName.trim() || savingCategory} className="min-h-[44px] rounded-xl border border-orange-200 bg-white px-4 text-sm font-semibold text-primary disabled:opacity-60">Add</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
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
