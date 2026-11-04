import React, { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { supportHubsApi } from '../../services/api';
import type { SupportHub } from '../../types';
import HubReportsCard from '../hubs/HubReportsCard';
import { hubReportWeeks } from '../hubs/reportWeeks';
import Spinner from '../Spinner';

// Hub meetings on the Attendance page of the supports picked to mark trainings (AppSetting 'training_markers'):
// every hub's weekly meeting, whether its report was submitted, and each member's mark. Seeing only: marking
// stays with each hub's lead, and the notes are never shown. Same weeks as the admin Hubs page.
const HubMeetingsAttendancePanel: React.FC = () => {
  const { activeCohort, weeks } = useAppData();
  const [hubs, setHubs] = useState<SupportHub[]>([]);
  const [membersByHub, setMembersByHub] = useState<Map<string, string[]>>(new Map());
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!activeCohort?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const [{ hubs: hs }, { memberships }] = await Promise.all([
          supportHubsApi.getAll(activeCohort.id),
          supportHubsApi.getMembershipsForCohort(activeCohort.id),
        ]);
        const byHub = new Map<string, string[]>();
        memberships.forEach((m) => byHub.set(m.hubId, [...(byHub.get(m.hubId) ?? []), m.userId]));
        const { names } = await supportHubsApi.getNames([...new Set(memberships.map((m) => m.userId))]);
        if (cancelled) return;
        setHubs([...hs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
        setMembersByHub(byHub);
        setNameById(names);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCohort?.id]);

  // Every week that has started, the current one included.
  const reportWeeks = useMemo(
    () => hubReportWeeks(activeCohort, (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id)),
    [activeCohort, weeks],
  );

  if (!activeCohort) return null;
  if (loading) return <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading hub meetings…</p>;
  if (failed) return <p className="text-sm text-rose-700">Could not load the hub meetings. Refresh to try again.</p>;
  if (hubs.length === 0 || reportWeeks.length === 0) return <p className="text-sm text-gray-500">No hub meetings to show yet.</p>;
  return (
    <HubReportsCard
      cohortId={activeCohort.id}
      hubs={hubs}
      membersByHub={membersByHub}
      weeks={reportWeeks}
      nameById={nameById}
      showNotes={false}
      defaultExpanded
    />
  );
};

export default HubMeetingsAttendancePanel;
