import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { groupDiscussionApi } from '../../services/api';

type Summary = { groups: number; postsAndReplies: number; activeGroups: number; openReports: number };

/** "Discussions this week: 23 posts & replies · in 8 of 10 groups · 2 reports waiting", linking to Groups. Admins only. */
const DiscussionNowLine: React.FC = () => {
  const { activeCohort } = useAppData();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!activeCohort?.id) return;
    groupDiscussionApi.summary(activeCohort.id).then(setSummary).catch(() => setSummary(null));
  }, [activeCohort?.id]);

  if (!summary || summary.groups === 0) return null;
  return (
    <NavLink
      to="/groups"
      className="flex min-h-[48px] items-center justify-between gap-3 border-t border-[#f0f0f2] px-4 py-3 text-sm first:border-t-0 active:bg-gray-50"
    >
      <span className="min-w-0">
        <span className="font-semibold text-gray-500">Discussions this week: </span>
        <span className="font-semibold text-gray-900">{summary.postsAndReplies} {summary.postsAndReplies === 1 ? 'post or reply' : 'posts & replies'}</span>
        <span className="text-gray-500"> · in {summary.activeGroups} of {summary.groups} groups</span>
        {summary.openReports > 0 && (
          <span className="font-semibold text-red-700"> · {summary.openReports} {summary.openReports === 1 ? 'report' : 'reports'} waiting</span>
        )}
      </span>
      <span className="shrink-0 font-semibold text-primary">Groups ›</span>
    </NavLink>
  );
};

export default DiscussionNowLine;
