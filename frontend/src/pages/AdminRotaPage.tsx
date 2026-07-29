import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { activitiesApi, labelsApi, usersApi } from '../services/api';
import type { Label, User } from '../types';
import { findDutyOverlaps } from '../config/rotaDuties';
import {
  buildRotaGrid,
  findUnmatchedActivities,
  isGroupSupportLabel,
  type LabelOwners,
} from '../utils/rotaGrid';
import RotaGrid from '../components/rota/RotaGrid';
import RotaApplyModal, { type StagedChange } from '../components/rota/RotaApplyModal';
import UnmatchedActivitiesPanel from '../components/rota/UnmatchedActivitiesPanel';

const labelCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const AdminRotaPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { weeks, activeCohort, reloadWeeks } = useAppData();

  const [labels, setLabels] = useState<Label[]>([]);
  const [labelOwners, setLabelOwners] = useState<LabelOwners>(new Map());
  const [loading, setLoading] = useState(true);
  const [staged, setStaged] = useState<Map<string, string[]>>(new Map());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [labelRes, ownerRes] = await Promise.all([labelsApi.getAll(), usersApi.getLabelOwners()]);
        if (cancelled) return;
        setLabels(labelRes.labels || []);
        const owners: LabelOwners = new Map();
        for (const row of ownerRes.owners || []) {
          const list = owners.get(row.labelId);
          if (list) list.push(row.user as User);
          else owners.set(row.labelId, [row.user as User]);
        }
        setLabelOwners(owners);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load labels');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupLabels = useMemo(
    () => labels.filter(isGroupSupportLabel).sort((a, b) => labelCollator.compare(a.name, b.name)),
    [labels]
  );

  const sortedWeeks = useMemo(
    () => [...weeks].sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks]
  );

  const grid = useMemo(() => buildRotaGrid(sortedWeeks), [sortedWeeks]);
  const unmatched = useMemo(() => findUnmatchedActivities(sortedWeeks), [sortedWeeks]);

  // A description matching two duties would let one assignment wipe the other's,
  // since applying replaces every label on the matched activities.
  const blockedDutyIds = useMemo(() => {
    const all = sortedWeeks.flatMap((w) => (w.days || []).flatMap((d) => d.activities || []));
    const overlaps = findDutyOverlaps(all);
    return new Set(overlaps.flatMap((o) => o.dutyIds));
  }, [sortedWeeks]);

  const handleStage = useCallback((key: string, value: string[] | undefined) => {
    setStaged((prev) => {
      const next = new Map(prev);
      if (value === undefined) next.delete(key);
      else next.set(key, value);
      return next;
    });
    setNotice('');
  }, []);

  const changes: StagedChange[] = useMemo(
    () =>
      [...staged.entries()]
        .map(([key, value]) => {
          const cell = grid.get(key);
          return cell ? { key, cell, value } : null;
        })
        .filter((c): c is StagedChange => c !== null),
    [staged, grid]
  );

  const handleApply = async () => {
    setApplying(true);
    setError('');
    const failed: string[] = [];
    const applied: string[] = [];

    // Sequential, and one cell's failure must not abandon the rest.
    for (const change of changes) {
      try {
        await activitiesApi.setLabelsForActivities(change.cell.activityIds, change.value);
        applied.push(change.key);
      } catch (err) {
        failed.push(`Week ${change.cell.weekNumber}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    // Re-derive from the server rather than trusting optimistic state.
    await reloadWeeks();

    setStaged((prev) => {
      const next = new Map(prev);
      for (const key of applied) next.delete(key);
      return next;
    });

    setApplying(false);
    if (failed.length > 0) {
      setError(`${applied.length} applied, ${failed.length} failed. ${failed.join('; ')}`);
    } else {
      setReviewOpen(false);
      setNotice(`${applied.length} ${applied.length === 1 ? 'change' : 'changes'} applied.`);
    }
  };

  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (loading && weeks.length === 0) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rota"
        subtitle="Assign each weekly duty to a support person. Saving writes the labels that drive their reminders."
      />

      {!activeCohort ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          No active cohort selected.
        </div>
      ) : sortedWeeks.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          This cohort has no weeks yet.
        </div>
      ) : (
        <>
          {notice && (
            <p className="rounded-xl bg-emerald-100/80 px-3 py-2 text-[13px] font-medium text-emerald-700">
              {notice}
            </p>
          )}
          {error && !reviewOpen && (
            <p className="rounded-xl bg-red-100/80 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>
          )}

          <RotaGrid
            weeks={sortedWeeks}
            grid={grid}
            groupLabels={groupLabels}
            labelOwners={labelOwners}
            staged={staged}
            onStage={handleStage}
            applying={applying}
            blockedDutyIds={blockedDutyIds}
          />

          <UnmatchedActivitiesPanel groups={unmatched} onOpenSchedule={() => navigate('/schedule')} />

          {changes.length > 0 && (
            // Nothing is written until this is reviewed — reminders are live.
            <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl border-t border-gray-100 bg-white/80 px-4 py-3 shadow-lg backdrop-blur-xl">
              <span className="text-[13px] font-medium text-gray-700">
                {changes.length} unsaved {changes.length === 1 ? 'change' : 'changes'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStaged(new Map())}
                  className="rounded-xl border border-gray-300 px-3 py-1.5 text-[13px] font-medium text-gray-700"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="rounded-xl bg-[var(--color-primary,#f97316)] px-4 py-1.5 text-[13px] font-semibold text-white"
                >
                  Review &amp; apply
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <RotaApplyModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={handleApply}
        changes={changes}
        groupLabels={groupLabels}
        labelOwners={labelOwners}
        applying={applying}
        error={error}
      />
    </div>
  );
};

export default AdminRotaPage;
