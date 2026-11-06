import type { Group, User } from '../../types';
import { normaliseGender } from '../../utils/groupingRules';
import { genderAgeLabel, genderFits, groupGenderLabel, type GroupGender } from '../../utils/groupGender';

interface GroupPickListProps {
  /** The person (or people) being placed; null gender = no filter. */
  personGender: string | null | undefined;
  groups: Group[];
  genders: Map<string, GroupGender>;
  supportsById: Map<string, Pick<User, 'name' | 'gender' | 'ageRange'>>;
  memberCounts?: Map<string, number>;
  /** The chosen group id; '' = Unassigned. */
  value: string;
  onChange: (groupId: string) => void;
  showAll: boolean;
  onShowAllChange: (v: boolean) => void;
  /** Offer "Unassigned" at the top. */
  allowUnassigned?: boolean;
  /** The group they are in now, marked "Now". */
  currentGroupId?: string | null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * A list of groups to place someone in (FLOW_MAP rule 135). Only groups of the person's gender (and mixed or unknown
 * ones) are offered, each with its support's gender and age; "Show all groups" offers the rest for the rare case,
 * marked, and the database records that an admin did it on purpose.
 */
export default function GroupPickList({
  personGender, groups, genders, supportsById, memberCounts, value, onChange, showAll, onShowAllChange, allowUnassigned, currentGroupId,
}: GroupPickListProps) {
  const gender = normaliseGender(personGender);
  const known = gender === 'Female' || gender === 'Male';
  const sorted = [...groups].sort((a, b) => collator.compare(a.name, b.name));
  const fitting = sorted.filter((g) => genderFits(gender, genders.get(g.id)));
  const hidden = sorted.length - fitting.length;
  const list = showAll ? sorted : fitting;

  const row = (id: string, title: string, detail: string, chip: string | null, warn: boolean) => (
    <button
      key={id || 'none'}
      type="button"
      role="radio"
      aria-checked={value === id}
      onClick={() => onChange(id)}
      className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition ${value === id ? 'border-primary bg-[#fff8f3]' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
    >
      <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${value === id ? 'border-primary' : 'border-gray-300'}`} aria-hidden="true">
        {value === id && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-900">
          {title}
          {currentGroupId != null && id === currentGroupId && <span className="ml-1.5 text-xs font-medium text-gray-400">Now</span>}
        </span>
        {detail && <span className="block break-words text-xs text-gray-500">{detail}</span>}
      </span>
      {chip && (
        <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${warn ? 'bg-amber-100/80 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{chip}</span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-gray-500">
          {!known ? 'No gender on their profile, so every group is shown. Add it on their profile.'
            : showAll ? `Showing every group. ${gender === 'Female' ? 'Men' : 'Women'}'s groups are marked.`
            : `Showing ${gender === 'Female' ? "women's" : "men's"} groups${hidden > 0 ? ` (${hidden} hidden)` : ''}.`}
        </p>
        {known && hidden > 0 && (
          <label className="flex flex-none cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
            <input type="checkbox" checked={showAll} onChange={(e) => onShowAllChange(e.target.checked)} className="h-4 w-4 accent-[#ff914d]" />
            Show all groups
          </label>
        )}
      </div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Group">
        {allowUnassigned && row('', 'Unassigned', 'Not in any group', null, false)}
        {list.map((g) => {
          const support = g.supportId ? supportsById.get(g.supportId) : undefined;
          const about = genderAgeLabel(support?.gender, support?.ageRange);
          const supportText = g.supportName ?? support?.name ?? null;
          const count = memberCounts?.get(g.id);
          const detail = [
            supportText ? `${supportText}${about ? ` (${about})` : ' (gender and age not on profile)'}` : 'No support yet',
            count != null ? `${count} ${count === 1 ? 'person' : 'people'}` : null,
          ].filter(Boolean).join(' · ');
          const gg = genders.get(g.id);
          const warn = !genderFits(gender, gg);
          return row(g.id, g.name, detail, gg ? groupGenderLabel(gg) : null, warn);
        })}
        {list.length === 0 && (
          <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No group of their gender yet. Create one on Groups, or use “Show all groups”.</p>
        )}
      </div>
    </div>
  );
}
