import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import { activitiesApi, labelsApi, usersApi } from '../services/api';
import type { Label, User } from '../types';
import { findDutyOverlaps, ROTA_DUTIES } from '../config/rotaDuties';
import {
  buildRotaGrid,
  cellKey,
  findUnmatchedActivities,
  describeOwners,
  isGroupSupportLabel,
  type LabelOwners,
} from '../utils/rotaGrid';
import AppSelect from '../components/AppSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import RotaGrid from '../components/rota/RotaGrid';
import RotaApplyModal, { type StagedChange } from '../components/rota/RotaApplyModal';
import UnmatchedActivitiesPanel from '../components/rota/UnmatchedActivitiesPanel';

const labelCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const AdminRotaPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('schedule', 'edit');
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
  const [fillDutyId, setFillDutyId] = useState('');
  const [fillLabelId, setFillLabelId] = useState('');
  const [fillConfirmOpen, setFillConfirmOpen] = useState(false);

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

  // Every week's cell for the chosen duty that has a matching activity and isn't already that person's alone.
  const fillTargets = useMemo(() => {
    if (!fillDutyId || !fillLabelId) return [];
    return sortedWeeks
      .map((week) => grid.get(cellKey(fillDutyId, week.id)))
      .filter((cell): cell is NonNullable<typeof cell> => {
        if (!cell || cell.state === 'empty') return false;
        const alreadyThem =
          cell.state === 'assigned' && cell.groupLabels.length === 1 && cell.groupLabels[0].label.id === fillLabelId;
        return !alreadyThem;
      });
  }, [fillDutyId, fillLabelId, sortedWeeks, grid]);

  const handleFillEveryWeek = async () => {
    setApplying(true);
    setError('');
    const failed: string[] = [];
    let done = 0;
    // Same save call and same one-by-one loop as the review flow above.
    for (const cell of fillTargets) {
      try {
        await activitiesApi.setLabelsForActivities(cell.activityIds, [fillLabelId]);
        done++;
      } catch (err) {
        failed.push(`Week ${cell.weekNumber}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
    await reloadWeeks();
    // Anything staged for the cells just written is now out of date.
    setStaged((prev) => {
      const next = new Map(prev);
      for (const cell of fillTargets) next.delete(cellKey(cell.dutyId, cell.weekId));
      return next;
    });
    setApplying(false);
    setFillConfirmOpen(false);
    if (failed.length > 0) setError(`${done} weeks filled, ${failed.length} failed. ${failed.join('; ')}`);
    else setNotice(`${done} ${done === 1 ? 'week' : 'weeks'} filled.`);
  };

  const fillDutyName = ROTA_DUTIES.find((d) => d.id === fillDutyId)?.name || '';
  const fillLabelName = groupLabels.find((l) => l.id === fillLabelId)?.name || '';

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

          {canEdit && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[13px] font-semibold text-gray-900">Same person every week</p>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Pick a duty and a support, and every week of this cohort gets that person for it.
              </p>
              <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                <div className="md:w-64">
                  <AppSelect
                    value={fillDutyId}
                    onChange={setFillDutyId}
                    placeholder="Choose a duty"
                    compact
                    options={ROTA_DUTIES.filter((d) => !blockedDutyIds.has(d.id)).map((d) => ({
                      value: d.id,
                      label: d.name,
                      meta: d.subLabel,
                    }))}
                  />
                </div>
                <div className="md:w-64">
                  <AppSelect
                    value={fillLabelId}
                    onChange={setFillLabelId}
                    placeholder="Choose a support"
                    compact
                    options={groupLabels.map((l) => ({
                      value: l.id,
                      label: l.name,
                      meta: describeOwners(labelOwners.get(l.id)),
                    }))}
                  />
                </div>
                <button
                  type="button"
                  disabled={applying || fillTargets.length === 0}
                  onClick={() => setFillConfirmOpen(true)}
                  className="rounded-xl bg-[var(--color-primary,#f97316)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Fill every week
                </button>
              </div>
            </div>
          )}

          <RotaGrid
            weeks={sortedWeeks}
            grid={grid}
            groupLabels={groupLabels}
            labelOwners={labelOwners}
            staged={staged}
            onStage={handleStage}
            // Without the Edit tick the duty pickers are locked, same as while applying.
            applying={applying || !canEdit}
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

      <ConfirmationModal
        isOpen={fillConfirmOpen}
        onClose={() => setFillConfirmOpen(false)}
        onConfirm={handleFillEveryWeek}
        title="Same person every week?"
        message={`${fillLabelName} will be set as the only owner of "${fillDutyName}" in ${fillTargets.length} ${fillTargets.length === 1 ? 'week' : 'weeks'}, replacing whoever is there now. Their reminders start straight away.`}
        confirmText="Fill every week"
        type="warning"
        confirmLoading={applying}
      />

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
