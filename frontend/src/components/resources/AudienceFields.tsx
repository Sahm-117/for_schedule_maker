import React from 'react';
import SegmentedTabs from '../SegmentedTabs';
import type { SupportHub } from '../../types';
import type { ResourceAudience } from './audience';

const CHIP = 'rounded-full px-3 py-1.5 text-xs font-semibold transition';
const chipCls = (on: boolean) => `${CHIP} ${on ? 'bg-[#3f4757] text-white' : 'bg-[#f1f2f5] text-gray-600 hover:text-gray-900'}`;

// The inside of the "Who can see it" accordion.
const AudienceFields: React.FC<{
  value: ResourceAudience;
  onChange: (next: ResourceAudience) => void;
  hubs: SupportHub[];
  /** The cohort this resource belongs to (or the active one for a new resource). */
  cohortId: string | null;
  cohortLabel: string;
}> = ({ value, onChange, hubs, cohortId, cohortLabel }) => {
  const set = (patch: Partial<ResourceAudience>) => onChange({ ...value, ...patch });
  const hubsAvailable = hubs.length > 0 && !!cohortId;

  return (
    <>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">Who</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={value.supports} onClick={() => set({ supports: !value.supports, hubsOnly: value.supports ? false : value.hubsOnly })} className={chipCls(value.supports)}>Supports</button>
          <button type="button" aria-pressed={value.participants} onClick={() => set({ participants: !value.participants })} className={chipCls(value.participants)}>Participants</button>
          {hubsAvailable && (
            <button
              type="button"
              aria-pressed={value.hubsOnly}
              onClick={() => set(value.hubsOnly
                ? { hubsOnly: false, hubIds: [] }
                : { hubsOnly: true, supports: true, cohortId: cohortId })}
              className={chipCls(value.hubsOnly)}
            >
              Particular hubs
            </button>
          )}
        </div>
      </div>

      {value.supports && value.hubsOnly && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">Which hubs</p>
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-[#f6f7f9] p-2">
            {hubs.map((hub) => {
              const on = value.hubIds.includes(hub.id);
              return (
                <button
                  key={hub.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ hubIds: on ? value.hubIds.filter((id) => id !== hub.id) : [...value.hubIds, hub.id] })}
                  className={`${CHIP} ${on ? 'bg-[#3f4757] text-white' : 'bg-white text-gray-600'}`}
                >
                  {hub.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">Cohort</p>
        <SegmentedTabs
          tabs={[
            { key: 'COHORT', label: cohortLabel },
            { key: 'ALL', label: 'All cohorts' },
          ]}
          active={value.cohortId ? 'COHORT' : 'ALL'}
          onChange={(key) => {
            if (key === 'ALL' && value.supports && value.hubsOnly) return; // hubs belong to one cohort
            set({ cohortId: key === 'ALL' ? null : cohortId });
          }}
        />
        {value.supports && value.hubsOnly && <p className="mt-1.5 text-[11px] text-gray-500">Hubs belong to one cohort, so this stays on {cohortLabel}.</p>}
      </div>
    </>
  );
};

export default AudienceFields;
