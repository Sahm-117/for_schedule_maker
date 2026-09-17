import React, { useEffect, useState } from 'react';
import { profileFieldsApi } from '../../services/api';
import type { Participant, ProfileCompletion, ProfileFieldEntry } from '../../types';

// How complete a participant's profile is, and their answers to the fields the
// FOF team requested. Used on the admin participant profile and support cards.

const formatDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const ProfileOverview: React.FC<{ participant: Participant; showBasics?: boolean }> = ({ participant, showBasics = false }) => {
  const [data, setData] = useState<{ completion: ProfileCompletion; fields: ProfileFieldEntry[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    profileFieldsApi.getOverview(participant.id).then((result) => { if (!cancelled) setData(result); }).catch(() => { /* hidden */ });
    return () => { cancelled = true; };
  }, [participant.id, participant.updatedAt]);

  if (!data) return null;
  const { completion, fields } = data;
  const rows: Array<[string, string, boolean]> = [
    ...(showBasics ? [
      ['Date of birth', participant.dateOfBirth ? formatDate(participant.dateOfBirth) : '', true] as [string, string, boolean],
      ['Occupation', participant.occupation ?? '', true] as [string, string, boolean],
    ] : []),
    ...fields.map((field) => [
      field.label,
      field.value ? (field.fieldType === 'DATE' ? formatDate(field.value) : field.value) : '',
      field.required,
    ] as [string, string, boolean]),
  ];

  return (
    <div className="rounded-[14px] border border-[#f1f2f5] p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-bold text-gray-900">Profile {completion.percent}% complete</p>
        {completion.missing > 0 && <p className="text-xs text-gray-500">{completion.missing} to add</p>}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1f2f5]">
        <span className={`block h-full rounded-full ${completion.percent === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${completion.percent}%` }} />
      </div>
      {rows.length > 0 && (
        <dl className="mt-2.5 divide-y divide-gray-100">
          {rows.map(([label, value, required]) => (
            <div key={label} className="flex items-start justify-between gap-4 py-1.5 text-sm">
              <dt className="text-gray-500">{label}{!required && <span className="text-gray-400"> (optional)</span>}</dt>
              <dd className={`whitespace-pre-wrap break-words text-right ${value ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{value || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

export default ProfileOverview;
