import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { surveyApi } from '../../services/api';
import type { PendingSurvey } from '../../types';

// Open surveys waiting for this person, as cards at the top of Home.
// base is where the fill page lives for this app ('/me/survey' or '/support/survey').
const PendingSurveyCards: React.FC<{ base: string }> = ({ base }) => {
  const [surveys, setSurveys] = useState<PendingSurvey[]>([]);

  useEffect(() => {
    let cancelled = false;
    surveyApi.pending().then((list) => { if (!cancelled) setSurveys(list); }).catch(() => { /* a failed check just shows no cards */ });
    return () => { cancelled = true; };
  }, []);

  if (surveys.length === 0) return null;
  return (
    <>
      {surveys.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[#ffeadb] border-l-4 border-l-primary bg-white px-[18px] py-4">
          <div className="min-w-0 flex-[1_1_220px]">
            <p className="text-[15px] font-bold text-gray-900">{s.homeHeading || s.title}</p>
            {(s.homeLine || s.description) && <p className="mt-0.5 text-[13px] text-gray-500">{s.homeLine || s.description}</p>}
          </div>
          <NavLink to={`${base}/${s.id}`} className="inline-flex min-h-[44px] items-center rounded-xl bg-[#3f4757] px-4 text-[13px] font-semibold text-white">{s.homeButton || 'Answer'}</NavLink>
        </div>
      ))}
    </>
  );
};

export default PendingSurveyCards;
