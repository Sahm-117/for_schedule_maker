import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { participantAppApi } from '../services/api';
import AppSelect from '../components/AppSelect';
import AppMultiSelect from '../components/AppMultiSelect';
import BirthDateSelect from '../components/BirthDateSelect';
import Spinner from '../components/Spinner';
import { AGE_RANGE_OPTIONS, DEPARTMENTS, toSelectOptions } from '../constants/departments';

// Add someone on this number (FLOW_MAP rule 95): a husband, wife, child, brother or sister who uses the same
// phone number. Three short steps with the registration form's questions; they join this number's login and
// can be picked from the picture at the top. Adults are Access confirmed straight away; a teen needs the parent's tick.

type Step = 'who' | 'details' | 'check' | 'done';
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const STEP_NO: Record<Exclude<Step, 'done'>, number> = { who: 1, details: 2, check: 3 };

const Choice: React.FC<{ on: boolean; title: string; hint?: string; onPick: () => void }> = ({ on, title, hint, onPick }) => (
  <button
    type="button"
    role="radio"
    aria-checked={on}
    onClick={onPick}
    className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-4 text-left transition ${on ? 'bg-[#fff1e6] ring-[1.5px] ring-inset ring-primary' : 'border border-gray-200 bg-white'}`}
  >
    <span className={`h-5 w-5 flex-none rounded-full ${on ? 'border-[6px] border-primary' : 'border-2 border-gray-300'}`} aria-hidden="true" />
    <span className="min-w-0">
      <span className="block text-[15px] font-bold text-gray-900">{title}</span>
      {hint && <span className="block text-[13px] text-gray-500">{hint}</span>}
    </span>
  </button>
);

const ParticipantAddPersonPage: React.FC = () => {
  const navigate = useNavigate();
  const { home } = useParticipantApp();
  const [open, setOpen] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('who');
  const [isTeen, setIsTeen] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [request, setRequest] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<{ participantId: string; name: string; isTeen: boolean } | null>(null);
  const [switching, setSwitching] = useState(false);

  const cohortId = home?.cohort?.id;
  useEffect(() => {
    if (!cohortId) return undefined;
    let cancelled = false;
    participantAppApi.getAddOnNumberState(cohortId).then((s) => { if (!cancelled) setOpen(s.open); }).catch(() => { if (!cancelled) setOpen(false); });
    return () => { cancelled = true; };
  }, [cohortId]);

  const me = home?.participant.name ?? '';
  const them = firstName(fullName) || 'them';
  const pronoun = gender === 'Female' ? 'She' : gender === 'Male' ? 'He' : 'They';

  const next = () => {
    setError('');
    if (step === 'who') {
      if (isTeen === null) { setError('Choose an adult or a teenager.'); return; }
      if (fullName.trim().length < 2) { setError('Enter their full name.'); return; }
      if (!gender) { setError('Choose their gender.'); return; }
      setStep('details');
    } else if (step === 'details') {
      if (!isTeen && !ageRange) { setError('Choose their age range.'); return; }
      if (isTeen && !consent) { setError(`Only a parent or guardian can add a teenager. Tick the box to say you agree.`); return; }
      setStep('check');
    }
  };
  const back = () => { setError(''); if (step === 'details') setStep('who'); else if (step === 'check') setStep('details'); else navigate('/me/profile'); };

  const add = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await participantAppApi.addOnNumber({
        fullName: fullName.trim(), gender, isTeen: !!isTeen, ageRange: isTeen ? null : ageRange,
        dateOfBirth: dateOfBirth || null, email: email.trim() || null, departments, request: request.trim() || null, consent,
      });
      setAdded({ participantId: res.participantId, name: res.name, isTeen: res.isTeen });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const switchNow = async () => {
    if (!added) return;
    setSwitching(true);
    try {
      await participantAppApi.switchTo(added.participantId);
      window.location.assign('/me');
    } catch {
      setSwitching(false);
      setError(`Could not open ${firstName(added.name)}'s space. Tap your picture at the top and choose them.`);
    }
  };

  if (open === false) {
    return (
      <div className="mx-auto max-w-md rounded-[22px] border border-[#eef0f4] bg-white p-6 text-center">
        <p className="text-[17px] font-bold text-gray-900">Adding people is closed</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-gray-500">Ask your support if someone on your number would like to join.</p>
        <button type="button" onClick={() => navigate('/me/profile')} className="mt-4 min-h-[44px] rounded-xl border border-gray-200 px-5 text-sm font-semibold text-gray-700">Back to profile</button>
      </div>
    );
  }

  if (step === 'done' && added) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3.5 rounded-[22px] border border-[#eef0f4] bg-white p-6 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600" aria-hidden="true">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M5 12l5 5L20 7" /></svg>
        </span>
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-gray-900">{firstName(added.name)} is in</h1>
        <div className="flex flex-wrap justify-center gap-1.5">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-bold text-emerald-800">Access confirmed</span>
          {added.isTeen && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-bold text-emerald-800">Parent consent given</span>}
        </div>
        <p className="max-w-[320px] text-[15px] leading-relaxed text-gray-600">
          {added.isTeen
            ? `A Teen Support of the same gender will look after ${firstName(added.name)}.`
            : `${firstName(added.name)} is now on this number. ${pronoun} will be put in a group with a support before the first class.`}
        </p>
        <p className="text-[13px] leading-relaxed text-gray-500">To use {firstName(added.name)}&apos;s space, tap the picture at the top and choose {firstName(added.name)}.</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="mt-1 flex w-full flex-col gap-2">
          <button type="button" onClick={() => void switchNow()} disabled={switching} className="min-h-[50px] rounded-xl bg-primary px-5 text-[15px] font-bold text-white disabled:opacity-60">
            {switching ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-4 w-4" />Opening…</span>) : `Switch to ${firstName(added.name)} now`}
          </button>
          <button type="button" onClick={() => navigate('/me/profile')} className="min-h-[46px] rounded-xl border border-gray-200 bg-white px-5 text-[15px] font-semibold text-gray-700">Stay as {firstName(me)}</button>
        </div>
      </div>
    );
  }

  const stepNo = STEP_NO[step as Exclude<Step, 'done'>];
  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center gap-2">
        <button type="button" onClick={back} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-white text-gray-700 shadow-sm">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="min-w-0 flex-1 text-[17px] font-bold text-gray-900">Add someone on this number</h1>
        <span className="text-xs font-semibold text-gray-500">{stepNo} of 3</span>
      </div>
      <div className="mt-3 h-1 rounded-full bg-gray-200"><div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${(stepNo / 3) * 100}%` }} /></div>

      <div className="mt-4 flex flex-col gap-4 rounded-[22px] border border-[#eef0f4] bg-white p-5">
        {open === null ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
        ) : step === 'who' ? (
          <>
            <h2 className="text-[20px] font-bold text-gray-900">Who are you adding?</h2>
            <div role="radiogroup" aria-label="Who are you adding?" className="flex flex-col gap-2.5">
              <Choice on={isTeen === false} onPick={() => setIsTeen(false)} title="An adult (18 or older)" hint="Your husband, wife or another adult" />
              <Choice on={isTeen === true} onPick={() => setIsTeen(true)} title="A teenager (10 to 17)" hint="Your child, or a brother or sister" />
            </div>
            <label className="block">
              <span className="text-[13px] font-semibold text-gray-900">Their full name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" className="mt-1.5 min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 text-[16px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>
            <div>
              <span className="text-[13px] font-semibold text-gray-900">Gender</span>
              <div role="radiogroup" aria-label="Gender" className="mt-1.5 grid grid-cols-2 gap-2">
                {['Female', 'Male'].map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={gender === g} onClick={() => setGender(g)} className={`min-h-[46px] rounded-xl text-[15px] font-semibold ${gender === g ? 'bg-[#fff1e6] text-[#9a3412] ring-[1.5px] ring-inset ring-primary' : 'border border-gray-200 bg-white text-gray-700'}`}>{g}</button>
                ))}
              </div>
            </div>
            <p className="rounded-xl bg-[#f6f8fb] px-3.5 py-3 text-[13px] leading-relaxed text-gray-600">Only add someone who really uses this phone number. Each person gets their own support, group and journey.</p>
          </>
        ) : step === 'details' ? (
          <>
            <h2 className="text-[20px] font-bold text-gray-900">{them}&apos;s details</h2>
            {isTeen ? (
              <div>
                <span className="text-[13px] font-semibold text-gray-900">Date of birth</span>
                <div className="mt-1.5"><BirthDateSelect value={dateOfBirth} onChange={setDateOfBirth} /></div>
              </div>
            ) : (
              <AppSelect label="Age range" value={ageRange} onChange={setAgeRange} options={[{ value: '', label: 'Choose…' }, ...toSelectOptions(AGE_RANGE_OPTIONS.filter((a) => a !== '10 - 17'))]} placeholder="Choose…" />
            )}
            {!isTeen && (
              <label className="block">
                <span className="text-[13px] font-semibold text-gray-900">Email (optional)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </label>
            )}
            {!isTeen && (
              <AppMultiSelect label="Department in church (optional)" values={departments} onChange={setDepartments} options={toSelectOptions(DEPARTMENTS)} placeholder="Choose…" />
            )}
            <label className="block">
              <span className="text-[13px] font-semibold text-gray-900">What would {them} like God to do for {gender === 'Male' ? 'him' : gender === 'Female' ? 'her' : 'them'} during FOF?</span>
              <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={3} maxLength={600} className="mt-1.5 w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>
            {isTeen && (
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 ${consent ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[rgb(var(--color-primary-rgb))]" />
                <span className="text-[14px] leading-relaxed text-gray-800"><b>I am {them}&apos;s parent or guardian</b> and I agree to {gender === 'Male' ? 'him' : gender === 'Female' ? 'her' : 'them'} taking part in FOF.</span>
              </label>
            )}
          </>
        ) : (
          <>
            <h2 className="text-[20px] font-bold text-gray-900">Check {them}&apos;s details</h2>
            <dl className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 text-[14px]">
              {[
                ['Name', fullName.trim()],
                ['Gender', gender],
                [isTeen ? 'Date of birth' : 'Age range', isTeen ? (dateOfBirth || 'Not given') : ageRange],
                ['Phone number', 'Same as yours'],
                ...(isTeen ? [['Parent consent', 'Given']] : [['Department', departments.join(', ') || 'None']]),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-3.5 py-3"><dt className="text-gray-500">{k}</dt><dd className="text-right font-semibold text-gray-900">{v}</dd></div>
              ))}
            </dl>
            <div className="rounded-2xl bg-[#fff7ed] px-3.5 py-3">
              <p className="text-[14px] font-bold text-[#7c2d12]">How {them} will use the app</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-[#431407]">
                <li>{pronoun} signs in with this phone number and the same password as you.</li>
                <li>The app asks who is using it. {pronoun} taps {gender === 'Male' ? 'his' : gender === 'Female' ? 'her' : 'their'} name.</li>
                <li>To change between you, tap the picture at the top and choose a name.</li>
              </ol>
            </div>
          </>
        )}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {open && (
          step === 'check' ? (
            <button type="button" onClick={() => void add()} disabled={saving} className="min-h-[50px] rounded-xl bg-primary px-5 text-[15px] font-bold text-white disabled:opacity-60">
              {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-4 w-4" />Adding…</span>) : `Add ${them}`}
            </button>
          ) : (
            <button type="button" onClick={next} className="min-h-[50px] rounded-xl bg-primary px-5 text-[15px] font-bold text-white">Next</button>
          )
        )}
      </div>
    </div>
  );
};

export default ParticipantAddPersonPage;
