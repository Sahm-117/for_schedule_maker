import type { Resource, ResourceAudiencePayload, SupportHub } from '../../types';

// Who a resource is for, as the admin form edits it.
export interface ResourceAudience {
  supports: boolean;
  participants: boolean;
  /** Supports only in the chosen hubs (needs supports on). */
  hubsOnly: boolean;
  hubIds: string[];
  /** One cohort, or null for every cohort. */
  cohortId: string | null;
}

export const defaultAudience = (cohortId: string | null): ResourceAudience => ({
  supports: true,
  participants: false,
  hubsOnly: false,
  hubIds: [],
  cohortId,
});

export const audienceFromResource = (r: Resource): ResourceAudience => ({
  supports: r.visibleToSupports !== false,
  participants: !!r.visibleToParticipants,
  hubsOnly: (r.hubIds ?? []).length > 0,
  hubIds: r.hubIds ?? [],
  cohortId: r.cohortId ?? null,
});

export const audienceToPayload = (a: ResourceAudience): ResourceAudiencePayload => ({
  visibleToSupports: a.supports,
  visibleToParticipants: a.participants,
  cohortId: a.cohortId,
  hubIds: a.supports && a.hubsOnly ? a.hubIds : [],
});

export const audienceError = (a: ResourceAudience): string => {
  if (!a.supports && !a.participants) return 'Choose who can see this.';
  if (a.supports && a.hubsOnly && a.hubIds.length === 0) return 'Pick at least one hub, or switch off Particular hubs.';
  return '';
};

/** One line that says exactly who will see the resource. */
export const audienceSummary = (
  a: ResourceAudience,
  hubs: Array<Pick<SupportHub, 'id' | 'name'>>,
  cohortLabel: string,
): string => {
  const scope = a.cohortId ? cohortLabel : 'All cohorts';
  const hubNames = a.hubIds.map((id) => hubs.find((h) => h.id === id)?.name).filter(Boolean) as string[];
  const supports = a.hubsOnly ? (hubNames.length > 0 ? `Supports in ${hubNames.join(', ')}` : 'Supports in chosen hubs') : 'Supports';
  let who: string;
  if (a.supports && a.participants) who = a.hubsOnly ? `${supports} and all participants` : 'Supports and participants';
  else if (a.supports) who = supports;
  else if (a.participants) who = 'Participants';
  else who = 'Nobody yet';
  return `${who} · ${scope}`;
};
