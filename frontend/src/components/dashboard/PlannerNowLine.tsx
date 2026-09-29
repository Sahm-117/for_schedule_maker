import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { plannerApi } from '../../services/api';
import { buildPlannerCohorts, currentMoment, describeMoment, plannerToday } from '../../utils/planner';

type ClassWeekRow = { id: number; cohortId: string; weekNumber: number; classDate: string | null };

/** "Right now: Cohort 10 · Class 4 of 10" from the Planner, linking to it. Admins only. */
const PlannerNowLine: React.FC = () => {
  const { cohorts } = useAppData();
  const [weeks, setWeeks] = useState<ClassWeekRow[] | null>(null);

  useEffect(() => {
    plannerApi.getClassWeeks().then((res) => setWeeks(res.weeks)).catch(() => setWeeks(null));
  }, []);

  const today = plannerToday();
  const text = useMemo(() => {
    if (!weeks) return null;
    const moment = currentMoment(buildPlannerCohorts(cohorts, weeks, today), today);
    return moment ? describeMoment(moment, today) : null;
  }, [cohorts, weeks, today]);

  if (!text) return null;
  return (
    <NavLink
      to="/planner"
      className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)] active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="font-semibold text-gray-500">Right now: </span>
        <span className="font-semibold text-gray-900">{text.title}</span>
        <span className="text-gray-500"> · {text.detail}</span>
      </span>
      <span className="shrink-0 font-semibold text-primary">Planner ›</span>
    </NavLink>
  );
};

export default PlannerNowLine;
