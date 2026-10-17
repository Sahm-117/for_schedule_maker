import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { supportHubsApi, supportSessionsApi } from '../../services/api';
import { getIdealWeekForCohort } from '../../utils/weekFocus';
import { cohortMode } from './healthModel';

type Summary = { weekNumber: number; hubs: number; submitted: number; started: number };

/** "Hub reports · Week 1: 3 of 6 submitted · 1 started", linking to Hubs. Admins only; the current week as it happens. */
const HubReportsNowLine: React.FC = () => {
  const { activeCohort, weeks, liveRevision } = useAppData();
  const [summary, setSummary] = useState<Summary | null>(null);

  const week = activeCohort && cohortMode(activeCohort) !== 'upcoming' ? getIdealWeekForCohort(activeCohort, weeks) : null;
  const weekId = week?.id ?? null;
  const weekNumber = week?.weekNumber ?? null;

  useEffect(() => {
    if (!activeCohort?.id || weekId === null || weekNumber === null) { setSummary(null); return undefined; }
    let cancelled = false;
    Promise.all([supportHubsApi.getAll(activeCohort.id), supportSessionsApi.getHubReportsForWeek(activeCohort.id, weekId)])
      .then(([{ hubs }, { reports }]) => {
        if (cancelled) return;
        const hubIds = new Set(hubs.map((h) => h.id));
        const mine = reports.filter((r) => hubIds.has(r.hubId));
        const submitted = mine.filter((r) => r.submittedAt).length;
        setSummary({ weekNumber, hubs: hubs.length, submitted, started: mine.length - submitted });
      })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [activeCohort?.id, weekId, weekNumber, liveRevision]);

  if (!summary || summary.hubs === 0) return null;
  return (
    <NavLink
      to="/hubs"
      className="flex min-h-[48px] items-center justify-between gap-3 border-t border-[#f0f0f2] px-4 py-3 text-sm first:border-t-0 active:bg-gray-50"
    >
      <span className="min-w-0">
        <span className="font-semibold text-gray-500">Hub reports · Week {summary.weekNumber}: </span>
        <span className="font-semibold text-gray-900">{summary.submitted} of {summary.hubs} submitted</span>
        {summary.started > 0 && <span className="text-amber-700"> · {summary.started} started, not submitted</span>}
      </span>
      <span className="shrink-0 font-semibold text-primary">Hubs ›</span>
    </NavLink>
  );
};

export default HubReportsNowLine;
