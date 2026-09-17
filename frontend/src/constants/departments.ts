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

export interface ChurchDepartment {
  name: string;
  description?: string;
}

// Starting list for Settings -> Church departments: the registration form's
// names (so imported answers still match) with descriptions from the TCN IKD
// departments document, plus the two departments only that document lists.
// Admins edit the live list in Settings; this is only used until they do.
const DESCRIPTIONS: Record<string, string> = {
  'Bible Study Teachers': 'Teach and guide members through in-depth study of the Bible.',
  'Children Church Teachers': 'Nurture young children in the Word through age-appropriate teaching, songs and activities.',
  Choir: 'Lead the congregation in praise and worship during services and events.',
  Evangelism: 'Outreach and soul-winning, sharing the gospel within and outside the church.',
  Focus: 'Camera people: video coverage, livestreaming and camera operations.',
  'Foundation of Faith Teachers': 'Teach foundational Christian principles to new believers and people new to the church.',
  'HF/Clusters Coordinators': 'Facilitate small groups or clusters based on shared professions or interests.',
  'Jesus Tribe Teachers': 'Teens church: teach and mentor teenagers through relevant, engaging lessons.',
  'Marriage Enrichment': 'Strengthen marriages through teaching, events and counselling.',
  'Singles Fellowship': 'Community for single adults through fellowship, teaching and empowerment.',
  Snapshot: 'Drama department: communicate the gospel through drama and creative arts.',
  'Social Media': "Manage the church's online presence and content.",
  'Sound and W2Media': 'Sound engineering, media presentations and technical support during services.',
  'The Switch': 'Youth church: ministering to young adults through tailored teaching and activities.',
  'Tracking and Integration': 'Follow-up unit: make sure new and returning members are followed up and integrated.',
  'Traffic and Crowd Control': 'Manage vehicle flow and congregation movement for order and safety.',
  'Transportation and Logistics': 'Transport arrangements, member pickups and event logistics.',
  Ushering: 'Welcome members, guide them to seats and keep the auditorium orderly.',
  'Venue Management': 'Prepare and maintain the venue before, during and after services.',
  'Welcome Center': 'Info desk: information, directions and support for first-timers and members.',
  Welfare: "Respond to members' needs through care packages, support and crisis help.",
};

export const DEFAULT_CHURCH_DEPARTMENTS: ChurchDepartment[] = [
  ...DEPARTMENTS,
  'Foundation of Faith Teachers',
  'HF/Clusters Coordinators',
]
  .sort((a, b) => a.localeCompare(b))
  .map((name) => (DESCRIPTIONS[name] ? { name, description: DESCRIPTIONS[name] } : { name }));

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
