import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { TeacherChip, TeacherSheet, classTeacher } from '../TeacherSheet';
import { useAuth } from '../../hooks/useAuth';
import { useTeenSupportIds } from '../../hooks/useTeenSupportIds';
import ClassGraphicThumb from './ClassGraphicViewer';
import type { Week } from '../../types';

// Support Home: the next class as the one clear card. Opens the Classes page.
const SupportNextClassCard: React.FC<{ week: Week | null; dateLabel: string | null; hasWeeks: boolean }> = ({ week, dateLabel, hasWeeks }) => {
  const { user } = useAuth();
  const { ids: teenSupportIds } = useTeenSupportIds(!!week?.teenTeacherName);
  const [teacherOpen, setTeacherOpen] = useState(false);
  // A Teen Support sees the teen teacher when one is set, like on the Classes page; everyone else the main teacher.
  const isTeenSupport = !!user && !!teenSupportIds?.has(user.id);
  const teacher = week
    ? (isTeenSupport ? classTeacher(week.teenTeacherName, week.teenTeacherRole, week.teenTeacherBio, week.teenTeacherPhotoUrl) : null)
      ?? classTeacher(week.teacherName, week.teacherRole, week.teacherBio, week.teacherPhotoUrl)
    : null;
  const title = week ? week.title?.trim() || `Week ${week.weekNumber}` : '';
  return (
  <section data-wt="home-metrics" className="rounded-[24px] border border-primary-100 bg-white p-[18px] shadow-[0_8px_24px_-14px_rgba(17,24,39,0.35)]">
    <div className="flex items-start gap-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.04em] text-primary-dark">
          {week ? `Next class${dateLabel ? ` · ${dateLabel}` : ''}` : 'Classes'}
        </p>
        <h2 className="mt-1.5 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-gray-900">
          {week ? week.title?.trim() || `Week ${week.weekNumber}` : hasWeeks ? 'The programme is complete' : 'No classes yet'}
        </h2>
        {week && <p className="mt-0.5 text-[14px] text-gray-500">Week {week.weekNumber}</p>}
      </div>
      {week && <ClassGraphicThumb url={week.classGraphicUrl} title={title} />}
    </div>
    {teacher && <TeacherChip teacher={teacher} onOpen={() => setTeacherOpen(true)} className="mt-3 min-h-[34px] text-[13px]" />}
    <NavLink to="/support/recap" className="mt-4 flex h-[50px] items-center justify-center rounded-2xl bg-primary text-[15.5px] font-extrabold text-white active:scale-[0.98]">
      {week ? 'Open classes' : 'See past classes'}
    </NavLink>
    {teacherOpen && teacher && <TeacherSheet teacher={teacher} title={title} onClose={() => setTeacherOpen(false)} />}
  </section>
  );
};

export default SupportNextClassCard;
