import React, { useEffect, useState } from 'react';
import ScriptureCarousel from '../ScriptureCarousel';
import { scripturesApi, settingsApi } from '../../services/api';
import type { ParticipantHome } from '../../types';

// The Inspirational Scriptures on a support's Home, the same card participants see on theirs:
// one image a day from the cohort's start, following the same "show scriptures" switch and first-day setting.
const SupportScriptures: React.FC<{ cohortStartDate: string | null | undefined }> = ({ cohortStartDate }) => {
  const [data, setData] = useState<{ scriptures: ParticipantHome['scriptures']; startDay: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    Promise.all([settingsApi.getScripturesEnabled(), settingsApi.getScriptureStartDay(), scripturesApi.getAll()])
      .then(([enabled, startDay, { scriptures }]) => {
        if (cancelled || !enabled) return;
        setData({ scriptures: scriptures.map((s) => ({ dayNumber: s.dayNumber, imageUrl: s.imageUrl })), startDay });
      })
      .catch(() => { /* the card is a nicety: no scriptures, no card */ });
    return () => { cancelled = true; };
  }, []);

  if (!data || !cohortStartDate) return null;
  return <ScriptureCarousel scriptures={data.scriptures} startDay={data.startDay} cohortStartDate={cohortStartDate} />;
};

export default SupportScriptures;
