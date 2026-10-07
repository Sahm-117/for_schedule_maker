import React from 'react';

// The church FOF email. The same address is in teen_add_prospect (supabase/migrations/20261006180000_teen_assignment.sql).
export const CHURCH_FOF_EMAIL = 'tcn.fof.ikd@gmail.com';

export interface TeenAddState {
  on: boolean;
  gender: '' | 'Male' | 'Female';
  guardianPhone: string;
  guardianName: string;
  /** No email of their own: use the church FOF email. */
  churchEmail: boolean;
  email: string;
}

export const EMPTY_TEEN: TeenAddState = { on: false, gender: '', guardianPhone: '', guardianName: '', churchEmail: false, email: '' };

const INPUT = 'min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const Switch: React.FC<{ checked: boolean; label: string; onChange: (next: boolean) => void }> = ({ checked, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition ${checked ? 'bg-primary' : 'bg-slate-200'}`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

// The "This person is a teen" switch on Mobilisation's add form. Off, nothing
// else shows. On, only what a teen needs appears: gender, a parent's number,
// and an email (or the church's, when they have none).
const TeenAddFields: React.FC<{
  teen: TeenAddState;
  onChange: (patch: Partial<TeenAddState>) => void;
  genderError?: boolean;
}> = ({ teen, onChange, genderError }) => (
  <>
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-gray-900">This person is a teen</p>
        <p className="mt-0.5 text-xs text-gray-500">18 or below. A Teen Support will look after them.</p>
      </div>
      <Switch checked={teen.on} label="This person is a teen" onChange={(on) => onChange({ on })} />
    </div>
    {teen.on && (
      <>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Gender</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Gender">
            {(['Male', 'Female'] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={teen.gender === g}
                onClick={() => onChange({ gender: g })}
                className={`min-h-[44px] rounded-xl text-[14px] font-semibold transition ${teen.gender === g ? 'bg-primary text-white' : 'bg-[#f6f7f9] text-gray-700'}`}
              >
                {g}
              </button>
            ))}
          </div>
          {genderError && <span className="mt-1 block text-xs font-medium text-red-700">Choose Male or Female.</span>}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Parent or guardian name <span className="font-normal text-gray-500">(optional)</span></span>
          <input type="text" value={teen.guardianName} onChange={(e) => onChange({ guardianName: e.target.value })} placeholder="e.g. Mrs Adebayo" className={INPUT} />
          <span className="mt-1 block text-xs text-gray-500">Used to greet them in the parent messages.</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Parent or guardian number</span>
          <input type="tel" value={teen.guardianPhone} onChange={(e) => onChange({ guardianPhone: e.target.value })} placeholder="0803 000 0000" className={INPUT} />
          <span className="mt-1 block text-xs text-gray-500">We message and call them first.</span>
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-gray-900">No email, use the church FOF email</p>
          <Switch checked={teen.churchEmail} label="No email, use the church FOF email" onChange={(churchEmail) => onChange({ churchEmail })} />
        </div>
        {teen.churchEmail ? (
          <p className="-mt-1 text-xs text-gray-500">Using {CHURCH_FOF_EMAIL}</p>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Email <span className="font-normal text-gray-500">(optional)</span></span>
            <input type="email" value={teen.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="name@example.com" className={INPUT} />
          </label>
        )}
      </>
    )}
  </>
);

export default TeenAddFields;
