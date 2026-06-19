import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { groupPrayersApi } from '../services/api';
import type { GroupPrayer, Week } from '../types';

const AdminGroupPrayersPage: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { activeCohort, weeks } = useAppData();

  const cohortWeeks: Week[] = useMemo(
    () => (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [prayers, setPrayers] = useState<GroupPrayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // Default to most recent week
  useEffect(() => {
    if (cohortWeeks.length > 0 && selectedWeekId === null) {
      setSelectedWeekId(cohortWeeks[cohortWeeks.length - 1].id);
    }
  }, [cohortWeeks, selectedWeekId]);

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const { prayers: ps } = await groupPrayersApi.getForCohort(activeCohort.id);
      setPrayers(ps);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load]);

  const currentPrayer = useMemo(
    () => prayers.find((p) => p.weekId === selectedWeekId) ?? null,
    [prayers, selectedWeekId]
  );

  useEffect(() => {
    setBody(currentPrayer?.body ?? '');
    setSaved(false);
  }, [currentPrayer]);

  const handleSave = async () => {
    if (!activeCohort || selectedWeekId === null || !body.trim()) return;
    setSaving(true);
    try {
      const { prayer } = await groupPrayersApi.upsertForWeek(activeCohort.id, selectedWeekId, body.trim(), user?.id);
      setPrayers((prev) => {
        const idx = prev.findIndex((p) => p.weekId === prayer.weekId);
        return idx >= 0 ? prev.map((p, i) => i === idx ? prayer : p) : [...prev, prayer];
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!currentPrayer || !window.confirm('Delete this week\'s group prayer?')) return;
    await groupPrayersApi.delete(currentPrayer.id);
    setPrayers((prev) => prev.filter((p) => p.id !== currentPrayer.id));
    setBody('');
  };

  const selectedWeek = cohortWeeks.find((w) => w.id === selectedWeekId);

  return (
    <div className="page-content">
      <PageHeader
        title="Group Prayers"
        subtitle={activeCohort ? `${activeCohort.name} · Weekly prayer focus` : 'No active cohort'}
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : cohortWeeks.length === 0 ? (
        <p className="text-sm text-gray-500">No weeks in this cohort yet.</p>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* Left: week list */}
          <div className="flex-shrink-0 lg:w-56">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Weeks</p>
            <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {cohortWeeks.map((w) => {
                const hasPrayer = prayers.some((p) => p.weekId === w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWeekId(w.id)}
                    className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                      selectedWeekId === w.id
                        ? 'bg-primary text-white shadow-sm'
                        : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'
                    }`}
                  >
                    <span>Week {w.weekNumber}</span>
                    {hasPrayer && (
                      <span className={`ml-2 h-1.5 w-1.5 rounded-full ${selectedWeekId === w.id ? 'bg-white/70' : 'bg-emerald-400'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: editor */}
          <div className="flex-1">
            {selectedWeek ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold text-gray-900">Week {selectedWeek.weekNumber}</h2>
                  {currentPrayer && (
                    <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Saved</span>
                  )}
                </div>

                <textarea
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setSaved(false); }}
                  rows={6}
                  placeholder="Enter the group prayer focus for this week…"
                  className="w-full rounded-2xl border border-orange-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !body.trim()}
                    className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save prayer'}
                  </button>
                  {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
                  {currentPrayer && (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      className="ml-auto rounded-2xl border border-red-100 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 active:scale-95"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Select a week.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminGroupPrayersPage;
