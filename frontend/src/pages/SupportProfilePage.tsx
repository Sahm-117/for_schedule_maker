import React, { useEffect, useRef, useState } from 'react';
import Spinner from '../components/Spinner';

import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAppData } from '../context/AppDataContext';
import { followUpLoginIssuesApi, groupsApi, usersApi } from '../services/api';
import type { User } from '../types';
import NotificationSettings from '../components/NotificationSettings';
import AppStatusCard from '../components/AppStatusCard';
import TelegramCard from '../components/TelegramCard';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/Avatar';
import { applyTheme, DEFAULT_THEME, THEME_SWATCHES } from '../utils/theme';
import AppSelect from '../components/AppSelect';
import { AGE_RANGE_OPTIONS, GENDER_OPTIONS, toSelectOptions } from '../constants/departments';
import ProfileCompletionStrip from '../components/supports/ProfileCompletionStrip';

const SupportProfilePage: React.FC = () => {
  const { user } = useAuth();
  if (user?.role !== 'SUPPORT') return <Navigate to="/settings" replace />;
  return <SupportProfileContent user={user} />;
};

const SupportProfileContent: React.FC<{ user: User }> = ({ user }) => {
  const { refreshUser } = useAuth();
  // The group this support leads in the cohort being viewed (not an old cohort's).
  const [myGroupName, setMyGroupName] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [themeColor, setThemeColor] = useState<string>(user?.themeColor ?? DEFAULT_THEME);
  const [savingTheme, setSavingTheme] = useState(false);
  const [gender, setGender] = useState<string>(user?.gender ?? '');
  const [ageRange, setAgeRange] = useState<string>(user?.ageRange ?? '');
  const [detailsError, setDetailsError] = useState('');
  const [phone, setPhone] = useState<string>(user?.phone?.trim() ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { liveRevision, activeCohort } = useAppData();

  useEffect(() => {
    if (!activeCohort) { setMyGroupName(null); return; }
    let cancelled = false;
    groupsApi.getAll({ cohortId: activeCohort.id })
      .then(({ groups }) => {
        if (!cancelled) setMyGroupName(groups.find((g) => g.supportId === user.id)?.name ?? null);
      })
      .catch(() => { if (!cancelled) setMyGroupName(null); });
    return () => { cancelled = true; };
  }, [liveRevision, user.id, activeCohort]);

  // IT Support (same signal as the Mobilisation IT issues tab): people who tap
  // ? for help are sent to them on WhatsApp, so a missing number matters more.
  const [isItSupport, setIsItSupport] = useState(false);
  useEffect(() => {
    if (!activeCohort?.id) { setIsItSupport(false); return; }
    let cancelled = false;
    followUpLoginIssuesApi.getForItSupport(activeCohort.id)
      .then((res) => { if (!cancelled) setIsItSupport(res.isItSupport); })
      .catch(() => { if (!cancelled) setIsItSupport(false); });
    return () => { cancelled = true; };
  }, [activeCohort?.id]);

  const handleThemeChange = (hex: string) => {
    setThemeColor(hex);
    // Apply the full theme (primary + all derived pastel tints) live, not just --color-primary.
    applyTheme(hex);
  };

  const handleSaveTheme = async () => {
    setSavingTheme(true);
    try {
      await usersApi.saveThemeColor(user.id, themeColor);
      refreshUser({ themeColor });
    } catch { /* silent */ } finally {
      setSavingTheme(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { avatarUrl: url } = await usersApi.uploadAvatar(user.id, file);
      setAvatarUrl(url);
      refreshUser({ avatarUrl: url });
    } catch { /* silent */ } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const photoMissing = !avatarUrl;

  // Details are edited together and saved with one button, the same as a participant's profile.
  const [editing, setEditing] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [birthday, setBirthday] = useState<string>(user.birthday ?? '');
  const [birthYear, setBirthYear] = useState<string>(user.birthYear ? String(user.birthYear) : '');
  const [draft, setDraft] = useState({ gender: '', ageRange: '', month: '', day: '', year: '', phone: '' });
  const startEditing = () => {
    const [m, d] = birthday.split('-');
    setDraft({ gender, ageRange, month: m ?? '', day: d ?? '', year: birthYear, phone });
    setDetailsError('');
    setEditing(true);
  };
  const draftDays = draft.month ? new Date(2024, Number(draft.month), 0).getDate() : 31;

  const saveAll = async () => {
    // Saved the same way sign-up stores it (080…), so it works for WhatsApp and phone sign-in.
    const digits = draft.phone.replace(/\D/g, '');
    const local = /^234[7-9][01]\d{8}$/.test(digits) ? `0${digits.slice(3)}` : digits;
    if (draft.phone.trim() && !/^0[7-9][01]\d{8}$/.test(local)) { setDetailsError('Enter a valid Nigerian number, e.g. 08012345678.'); return; }
    if ((draft.month && !draft.day) || (!draft.month && draft.day)) { setDetailsError('Pick both the day and the month of your birthday, or neither.'); return; }
    setSavingDetails(true);
    setDetailsError('');
    // Each part saves on its own; if one fails, the message says which, and the ones before it stay saved.
    let step = 'your details';
    try {
      if (draft.gender !== gender || draft.ageRange !== ageRange) {
        await usersApi.saveProfileDetails(user.id, { gender: draft.gender || null, ageRange: draft.ageRange || null });
        refreshUser({ gender: draft.gender || null, ageRange: draft.ageRange || null });
        setGender(draft.gender);
        setAgeRange(draft.ageRange);
      }
      step = 'your birthday';
      const nextBirthday = draft.month ? `${draft.month}-${draft.day}` : '';
      if (nextBirthday !== birthday) {
        await usersApi.saveBirthday(user.id, nextBirthday || null);
        refreshUser({ birthday: nextBirthday || null });
        setBirthday(nextBirthday);
      }
      step = 'your birth year';
      if (draft.year !== birthYear) {
        // Adding the year sets the age range from it (the database does the sum).
        const { ageRange: derived } = await usersApi.saveBirthYear(user.id, draft.year ? Number(draft.year) : null);
        refreshUser({ birthYear: draft.year ? Number(draft.year) : null, ageRange: derived });
        setBirthYear(draft.year);
        if (draft.year && derived) setAgeRange(derived);
      }
      step = 'your number';
      // A blank number leaves the saved one alone: it can be changed here, not removed.
      if (local && local !== phone) {
        await usersApi.savePhone(user.id, local);
        setPhone(local);
        refreshUser({ phone: local });
      }
      setEditing(false);
    } catch (err) {
      setDetailsError(`Could not save ${step}${err instanceof Error && err.message ? `: ${err.message}` : '.'} Anything above it was saved.`);
    } finally {
      setSavingDetails(false);
    }
  };

  const birthdayLabel = (() => {
    if (!birthday) return '';
    const [m, d] = birthday.split('-');
    const label = new Date(2024, Number(m) - 1, Number(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    return birthYear ? `${label} ${birthYear}` : label;
  })();
  const detailRows: Array<[string, string]> = [
    ['Gender', gender],
    ['Age range', ageRange],
    ['Birthday', birthdayLabel],
    ['WhatsApp number', phone],
  ];
  // What is blank among the things the profile counts, as chips under the progress line.
  const missingChips = [
    !avatarUrl && { label: 'Photo', photo: true },
    !gender && { label: 'Gender', photo: false },
    !ageRange && { label: 'Age range', photo: false },
    !phone && { label: 'Phone', photo: false },
  ].filter(Boolean) as Array<{ label: string; photo: boolean }>;

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your details, activity tags, and how you want to receive reminders."
        tourId="support:profile"
      />

      <div className="mb-6 grid items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Who you are: the photo is the upload button, and what is still missing is one tap away. */}
          <section data-wt="profile-groups" className={`${CARD} flex flex-col items-center !pt-6 text-center`}>
            <div className="relative">
              {avatarUrl ? (
                <Avatar name={user.name} avatarUrl={avatarUrl} size="hero" enlargeable />
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} aria-label="Add a photo" className="block rounded-full disabled:opacity-60">
                  <Avatar name={user.name} avatarUrl={null} size="hero" />
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label={avatarUrl ? 'Change photo' : 'Add a photo'}
                className={`absolute -bottom-0.5 -right-0.5 grid h-9 w-9 place-items-center rounded-full border-[3px] border-white text-white shadow-md disabled:opacity-60 ${photoMissing ? 'bg-orange-600' : 'bg-gray-900'}`}
              >
                {uploadingAvatar ? <Spinner className="h-4 w-4" /> : <CameraIcon />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <h2 className="mt-3.5 max-w-full truncate text-[21px] font-extrabold tracking-tight text-gray-900">{user.name}</h2>
            {photoMissing && <p className="mt-0.5 text-[13.5px] text-gray-500">Tap your photo to add one</p>}
            <div className="mt-[18px] w-full text-left">
              <ProfileCompletionStrip user={{ avatarUrl, gender, ageRange, phone }} variant="profile" />
              {!editing && missingChips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {missingChips.map((chip) => (
                    <button key={chip.label} type="button" onClick={chip.photo ? () => fileInputRef.current?.click() : startEditing} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#ffdeca] bg-[#fff4ec] px-3.5 text-[13px] font-bold text-[#c2410c]">
                      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2.4" d="M12 5v14M5 12h14" /></svg>
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {isItSupport && !phone && !editing && (
            <section className="flex items-start gap-3 rounded-2xl bg-amber-100/80 px-4 py-3.5 text-amber-700">
              <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">You're IT Support. People who tap ? for help are sent to you on WhatsApp, so please add your number.</p>
              <button type="button" onClick={startEditing} className="flex-none rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-white">Add number</button>
            </section>
          )}

          {/* The details: one clear Edit button and one Save, the same as the participant profile. */}
          <section data-wt="profile-details" className={`${CARD} !py-2`}>
            <div className="flex items-center justify-between py-3">
              <h3 className="text-[17px] font-extrabold text-gray-900">Your details</h3>
              {!editing && (
                <button type="button" onClick={startEditing} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-white">
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m16.86 4.49 1.69-1.69a1.88 1.88 0 1 1 2.65 2.65L6.83 19.82a4.5 4.5 0 0 1-1.9 1.13l-2.68.8.8-2.69a4.5 4.5 0 0 1 1.13-1.89L16.86 4.49Z" /></svg>
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="flex flex-col gap-3.5 pb-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="mb-1 block text-[13px] font-semibold text-gray-900">Gender</span>
                    <AppSelect value={draft.gender} onChange={(value) => setDraft((prev) => ({ ...prev, gender: value }))} options={toSelectOptions(GENDER_OPTIONS)} placeholder="Choose…" />
                  </div>
                  <div>
                    <span className="mb-1 block text-[13px] font-semibold text-gray-900">Age range</span>
                    <AppSelect value={draft.ageRange} onChange={(value) => setDraft((prev) => ({ ...prev, ageRange: value }))} options={toSelectOptions(AGE_RANGE_OPTIONS)} placeholder="Choose…" disabled={!!draft.year} />
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[13px] font-semibold text-gray-900">Birthday <span className="font-normal text-gray-400">(optional)</span></span>
                  <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-2 [&>*]:min-w-0">
                    <AppSelect value={draft.day} onChange={(day) => setDraft((prev) => ({ ...prev, day }))} options={BIRTHDAY_DAYS.slice(0, draftDays)} placeholder="Day" />
                    <AppSelect value={draft.month} onChange={(month) => setDraft((prev) => ({ ...prev, month, day: prev.day && Number(prev.day) <= new Date(2024, Number(month), 0).getDate() ? prev.day : '' }))} options={BIRTHDAY_MONTHS} placeholder="Month" />
                    <AppSelect value={draft.year} onChange={(year) => setDraft((prev) => ({ ...prev, year }))} options={BIRTH_YEARS} placeholder="Year" />
                  </div>
                  <span className="mt-1 block text-[12px] text-gray-500">The day and month let admins celebrate you. Adding your year also sets your age range.</span>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-semibold text-gray-900">WhatsApp number</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={draft.phone}
                    onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="08012345678"
                    className="min-h-[44px] w-full rounded-xl border border-gray-200 px-3.5 py-2 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="mt-1 block text-[12px] text-gray-500">Lets your participants, your hub and IT Support reach you.{phone ? ' If you sign in with your phone number, use the new one next time.' : ''}</span>
                </label>
                {detailsError && <p className="text-xs font-medium text-red-700">{detailsError}</p>}
                <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
                  <button type="button" onClick={() => setEditing(false)} disabled={savingDetails} className="min-h-[48px] rounded-[14px] border border-gray-200 bg-white text-[15px] font-bold text-gray-700">Cancel</button>
                  <button type="button" onClick={() => void saveAll()} disabled={savingDetails} className="min-h-[48px] rounded-[14px] bg-primary text-[15px] font-bold text-white disabled:opacity-60">
                    {savingDetails ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <dl className="divide-y divide-gray-100 border-t border-gray-100">
                {detailRows.map(([label, value]) => (
                  <div key={label} className="flex min-h-[52px] items-center justify-between gap-4 py-2 text-[15px]">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="min-w-0 text-right font-semibold text-gray-900">
                      {value ? <span className="block truncate">{value}</span> : (
                        <button type="button" onClick={startEditing} className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#ffdeca] bg-[#fff4ec] px-3 text-[13px] font-bold text-[#c2410c]">
                          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2.6" d="M12 5v14M5 12h14" /></svg>
                          Add
                        </button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <div>
            <SectionLabel>Programme</SectionLabel>
            <section className={LIST}>
              <Row label="Group"><span className={`truncate text-sm font-semibold ${myGroupName ? 'text-gray-900' : 'text-gray-400'}`}>{myGroupName || 'Not assigned yet'}</span></Row>
              <Row label="Cohort"><span className="truncate text-sm font-semibold text-gray-900">{activeCohort?.name || 'No active cohort'}</span></Row>
            </section>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div data-wt="profile-theme">
            <SectionLabel>Accent colour</SectionLabel>
            <section className={CARD}>
              <div className="grid max-w-[360px] grid-cols-9 gap-1.5 sm:gap-2">
                {THEME_SWATCHES.map((s) => {
                  const selected = themeColor.toLowerCase() === s.hex;
                  return (
                    <button
                      key={s.hex}
                      type="button"
                      title={s.label}
                      aria-label={s.label}
                      aria-pressed={selected}
                      onClick={() => handleThemeChange(s.hex)}
                      style={{ backgroundColor: s.hex }}
                      className={`aspect-square w-full max-w-8 rounded-full transition focus:outline-none ${selected ? 'ring-2 ring-gray-900 ring-offset-2' : 'hover:scale-110'}`}
                    />
                  );
                })}
                <label title="Custom colour" className="relative aspect-square w-full max-w-8 cursor-pointer overflow-hidden rounded-full" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                  <input type="color" value={themeColor} onChange={(e) => handleThemeChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </label>
              </div>
              {themeColor.toLowerCase() !== (user?.themeColor ?? DEFAULT_THEME).toLowerCase() && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">{THEME_SWATCHES.find((s) => s.hex === themeColor.toLowerCase())?.label ?? themeColor}</span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => { const saved = user?.themeColor ?? DEFAULT_THEME; setThemeColor(saved); applyTheme(saved); }} className="rounded-2xl border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button type="button" onClick={() => void handleSaveTheme()} disabled={savingTheme} className="rounded-2xl bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                      {savingTheme ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <AppStatusCard />

          <TelegramCard />

          <div data-wt="profile-notifications">
            <SectionLabel>Reminders</SectionLabel>
            <section className={CARD}>
              <NotificationSettings isOpen onClose={() => {}} embedded bare />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
// Settings-style grouped list: one card, hairline dividers between rows.
const LIST = 'divide-y divide-[#f1f2f5] overflow-hidden rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400">{children}</p>
);

// One row: label on the left (orange dot when it's still needed), control on the right.
const BIRTH_YEARS = Array.from({ length: 90 }, (_, i) => { const y = new Date().getFullYear() - 10 - i; return { value: String(y), label: String(y) }; });
const BIRTHDAY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));
const BIRTHDAY_DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: String(i + 1) }));

const Row: React.FC<{ label: string; missing?: boolean; children: React.ReactNode }> = ({ label, missing, children }) => (
  <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2">
    <span className="flex flex-none items-center gap-2 text-sm text-gray-600">
      {label}
      {missing && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-label="Still needed" />}
    </span>
    <div className="flex min-w-0 justify-end">{children}</div>
  </div>
);

const CameraIcon: React.FC = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);

export default SupportProfilePage;
