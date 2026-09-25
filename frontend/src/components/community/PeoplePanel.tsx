import React, { useEffect, useMemo, useState } from 'react';
import AppSelect from '../AppSelect';
import Avatar from '../Avatar';
import Spinner from '../Spinner';
import { useAppData } from '../../context/AppDataContext';
import { cohortsApi, groupsApi, participantsApi } from '../../services/api';
import { buildWhatsAppLink } from '../../utils/phone';
import { sortByText } from '../../utils/sort';
import type { Group, Participant, User } from '../../types';

// People directory for supports (and admins viewing Community): every support/admin
// and participant in a chosen cohort, with photo, name, role or group, and phone
// (tap to call / WhatsApp). Reads existing staff-readable APIs — no new tables.

type PersonRow = {
  id: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  kind: 'SUPPORT' | 'ADMIN' | 'PARTICIPANT';
  groupId: string | null;
  groupName: string | null;
};

type TypeFilter = 'ALL' | 'SUPPORTS' | 'PARTICIPANTS';

const ROLE_PILL: Record<'SUPPORT' | 'ADMIN', string> = {
  SUPPORT: 'bg-sky-100/80 text-sky-700',
  ADMIN: 'bg-violet-100/80 text-violet-700',
};

const PersonCard: React.FC<{ person: PersonRow }> = ({ person }) => {
  const waLink = buildWhatsAppLink(person.phone, `Hi ${person.name.split(' ')[0]}, it's someone from FOF.`);
  const telLink = person.phone ? `tel:${person.phone.replace(/[^\d+]/g, '')}` : null;

  return (
    <div data-wt="person-card" className="surface-card flex items-center gap-3 p-4">
      <Avatar name={person.name} avatarUrl={person.avatarUrl} size="md" enlargeable />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{person.name}</p>
        {person.kind === 'PARTICIPANT' ? (
          <span className="mt-0.5 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
            {person.groupName ?? 'No group'}
          </span>
        ) : (
          <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_PILL[person.kind]}`}>
            {person.kind === 'ADMIN' ? 'Admin' : 'Support'}
          </span>
        )}
      </div>
      {person.phone && (
        <div className="flex flex-none items-center gap-1.5">
          {telLink && (
            <a href={telLink} title="Call" aria-label={`Call ${person.name}`} className="rounded-xl bg-gray-100 p-2 text-gray-600 hover:bg-gray-200">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </a>
          )}
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp ${person.name}`} className="rounded-xl bg-emerald-100/80 p-2 text-emerald-700 hover:bg-emerald-100">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.71.45 3.36 1.3 4.82L2 22l5.4-1.42a9.87 9.87 0 004.64 1.18h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.85 9.85 0 0012.04 2zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.8-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .55.01.18.01.42-.07.65.5.24.58.81 2 .88 2.15.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.94 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.07.18-.27.36-.22.6-.13.24.09 1.55.73 1.82.86.27.14.44.2.51.32.07.11.07.65-.17 1.32z" /></svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
};

const PeoplePanel: React.FC = () => {
  const { cohorts, activeCohort } = useAppData();
  const [cohortId, setCohortId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [groupFilter, setGroupFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [supports, setSupports] = useState<User[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const sortedCohorts = useMemo(() => sortByText(cohorts, (c) => c.startDate ?? c.name).reverse(), [cohorts]);

  // Default to the active cohort (or most recent by start date if none is active —
  // AppDataContext already resolves that); only runs until a cohort is chosen.
  useEffect(() => {
    if (cohortId || sortedCohorts.length === 0) return;
    setCohortId(activeCohort?.id ?? sortedCohorts[0].id);
  }, [cohortId, sortedCohorts, activeCohort]);

  useEffect(() => {
    if (!cohortId) return;
    let cancelled = false;
    setLoading(true);
    setGroupFilter('');
    Promise.all([
      cohortsApi.getMembers(cohortId),
      participantsApi.getAll({ cohortId }),
      groupsApi.getAll({ cohortId }),
    ]).then(([membersRes, participantsRes, groupsRes]) => {
      if (cancelled) return;
      setSupports(membersRes.users.filter((u) => u.role === 'SUPPORT' || u.role === 'ADMIN'));
      setParticipants(participantsRes.participants);
      setGroups(groupsRes.groups);
    }).catch(() => {
      if (!cancelled) { setSupports([]); setParticipants([]); setGroups([]); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cohortId]);

  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const filterGroupSupportId = useMemo(() => groups.find((g) => g.id === groupFilter)?.supportId ?? null, [groups, groupFilter]);

  const rows: PersonRow[] = useMemo(() => {
    const supportRows: PersonRow[] = supports.map((u) => ({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl ?? null,
      phone: u.phone ?? null,
      kind: u.role === 'ADMIN' ? 'ADMIN' : 'SUPPORT',
      groupId: null,
      groupName: null,
    }));
    const participantRows: PersonRow[] = participants.map((p) => ({
      id: p.id,
      name: p.fullName,
      avatarUrl: p.avatarUrl ?? null,
      phone: p.phone ?? null,
      kind: 'PARTICIPANT',
      groupId: p.groupId ?? null,
      groupName: p.groupName ?? groupNameById.get(p.groupId ?? '') ?? null,
    }));
    return sortByText([...supportRows, ...participantRows], (r) => r.name);
  }, [supports, participants, groupNameById]);

  const filtered = rows.filter((r) => {
    if (typeFilter === 'SUPPORTS' && r.kind === 'PARTICIPANT') return false;
    if (typeFilter === 'PARTICIPANTS' && r.kind !== 'PARTICIPANT') return false;
    if (groupFilter) {
      if (r.kind === 'PARTICIPANT') {
        if (r.groupId !== groupFilter) return false;
      } else if (r.id !== filterGroupSupportId) {
        return false;
      }
    }
    const q = search.trim().toLowerCase();
    if (q && !r.name.toLowerCase().includes(q) && !(r.phone ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  const cohortOptions = sortedCohorts.map((c) => ({ value: c.id, label: c.name, meta: c.status }));
  const groupOptions = [{ value: '', label: 'All groups' }, ...sortByText(groups, (g) => g.name).map((g) => ({ value: g.id, label: g.name }))];

  return (
    <div>
      <div data-wt="people-filters" className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-md sm:flex-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <AppSelect value={cohortId} onChange={setCohortId} options={cohortOptions} placeholder="Choose cohort" compact />
          <AppSelect
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
            options={[
              { value: 'ALL', label: 'Everyone' },
              { value: 'SUPPORTS', label: 'Supports' },
              { value: 'PARTICIPANTS', label: 'Participants' },
            ]}
            placeholder="Everyone"
            compact
          />
          <AppSelect value={groupFilter} onChange={setGroupFilter} options={groupOptions} placeholder="All groups" compact />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-16 text-center text-sm text-gray-400">
          No one matches yet.
        </div>
      ) : (
        <div data-wt="people-results" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((person) => <PersonCard key={`${person.kind}-${person.id}`} person={person} />)}
        </div>
      )}
    </div>
  );
};

export default PeoplePanel;
