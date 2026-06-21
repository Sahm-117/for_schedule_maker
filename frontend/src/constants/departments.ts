// Registration field option lists. These mirror the church registration form
// (and the Google Form) so manually-added participants can carry the same
// details the platform collects. Kept as a hardcoded source of truth on the
// frontend — there is no departments table.

// Department(s) a participant serves in. Alphabetical, matching the
// registration form's multi-select options.
export const DEPARTMENTS: string[] = [
  'Announcement',
  'Bible Study Teachers',
  'Children Church Teachers',
  'Choir',
  'Evangelism',
  'Focus',
  'Foundation of Faith Support',
  'Jesus Tribe Teachers',
  'Marriage Enrichment',
  'Men Fellowship',
  'Pearls',
  'Singles Fellowship',
  'Snapshot',
  'Social Media',
  'Sound and W2Media',
  'The Switch',
  'Tracking and Integration',
  'Traffic and Crowd Control',
  'Transportation and Logistics',
  'Ushering',
  'Venue Management',
  'Welcome Center',
  'Welfare',
];

// Age range buckets. Includes "18 and below" in addition to the registration
// form's original ranges.
export const AGE_RANGE_OPTIONS: string[] = [
  '18 and below',
  '18 - 24',
  '25 - 34',
  '35 - 44',
  '45 - 59',
  '60 and above',
];

export const GENDER_OPTIONS: string[] = ['Male', 'Female'];

// Convenience: option shape used by AppSelect / AppMultiSelect.
export const toSelectOptions = (values: string[]): Array<{ value: string; label: string }> =>
  values.map((v) => ({ value: v, label: v }));
