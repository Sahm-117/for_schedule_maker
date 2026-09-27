import React, { useEffect, useRef, useState } from 'react';
import Spinner from '../components/Spinner';

const THEME_SWATCHES = [
  { hex: '#ff914d', label: 'Coral' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#8b5cf6', label: 'Purple' },
  { hex: '#0ea5e9', label: 'Sky' },
  { hex: '#14b8a6', label: 'Teal' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#f43f5e', label: 'Rose' },
  { hex: '#64748b', label: 'Slate' },
];
import { Navigate } from 'react-router-dom';
import LabelChip from '../components/LabelChip';
import PageHeader from '../components/PageHeader';
import { useAppData } from '../context/AppDataContext';
import { usersApi } from '../services/api';
import type { Label, User } from '../types';
import NotificationSettings from '../components/NotificationSettings';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/Avatar';
import { applyTheme, DEFAULT_THEME } from '../utils/theme';
import AppSelect from '../components/AppSelect';
import { AGE_RANGE_OPTIONS, GENDER_OPTIONS, toSelectOptions } from '../constants/departments';
import ProfileCompletionStrip from '../components/supports/ProfileCompletionStrip';

const SupportProfilePage: React.FC = () => {
  const { user } = useAuth();
  if (user?.role !== 'SUPPORT') return <Navigate to="/settings" replace />;
  return <SupportProfileContent user={user} />;
};

const SupportProfileContent: React.FC<{ user: User }> = ({ user }) => {
  const { userLabelIds, userLabels, refreshUser } = useAuth();
  const [activityTags, setActivityTags] = useState<Label[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [themeColor, setThemeColor] = useState<string>(user?.themeColor ?? DEFAULT_THEME);
  const [savingTheme, setSavingTheme] = useState(false);
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState<string>(user?.whatsappGroupUrl ?? '');
  const [editingWhatsapp, setEditingWhatsapp] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [gender, setGender] = useState<string>(user?.gender ?? '');
  const [ageRange, setAgeRange] = useState<string>(user?.ageRange ?? '');
  const [detailsError, setDetailsError] = useState('');
  const [phone, setPhone] = useState<string>(user?.phone?.trim() ?? '');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { liveRevision, activeCohort } = useAppData();

  useEffect(() => {
    let cancelled = false;

    usersApi.getUserLabels(user.id)
      .then((response) => {
        if (!cancelled) setActivityTags(response.labels);
      })
      .catch(() => {
        if (!cancelled) setActivityTags([]);
      });

    return () => {
      cancelled = true;
    };
  }, [liveRevision, user.id]);

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

  const handleSaveWhatsapp = async () => {
    const trimmed = whatsappGroupUrl.trim();
    setSavingWhatsapp(true);
    try {
      await usersApi.saveWhatsappGroupUrl(user.id, trimmed || null);
      refreshUser({ whatsappGroupUrl: trimmed || null });
      setWhatsappGroupUrl(trimmed);
      setEditingWhatsapp(false);
    } catch { /* silent */ } finally {
      setSavingWhatsapp(false);
    }
  };

  // Gender and age range save as soon as they are picked.
  const saveDetails = async (next: { gender: string; ageRange: string }) => {
    const previous = { gender, ageRange };
    setGender(next.gender);
    setAgeRange(next.ageRange);
    setDetailsError('');
    try {
      await usersApi.saveProfileDetails(user.id, { gender: next.gender || null, ageRange: next.ageRange || null });
      refreshUser({ gender: next.gender || null, ageRange: next.ageRange || null });
    } catch {
      setGender(previous.gender);
      setAgeRange(previous.ageRange);
      setDetailsError('Could not save. Please try again.');
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

  // Saved the same way sign-up stores it (080…), so it works for WhatsApp and phone sign-in.
  const handleSavePhone = async () => {
    const digits = phoneDraft.replace(/\D/g, '');
    const local = /^234[7-9][01]\d{8}$/.test(digits) ? `0${digits.slice(3)}` : digits;
    if (!/^0[7-9][01]\d{8}$/.test(local)) {
      setPhoneError('Enter a valid Nigerian number, e.g. 08012345678.');
      return;
    }
    setSavingPhone(true);
    setPhoneError('');
    try {
      await usersApi.savePhone(user.id, local);
      setPhone(local);
      refreshUser({ phone: local });
      setEditingPhone(false);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your details, activity tags, and how you want to receive reminders."
        tourId="support:profile"
      />

      <div className="mb-6 grid items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <section data-wt="profile-groups" className={CARD}>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <Avatar name={user.name} avatarUrl={avatarUrl} size="lg" enlargeable />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  title="Change photo"
                  aria-label="Change photo"
                  className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-gray-900 text-white shadow-md hover:bg-gray-800 disabled:opacity-60"
                >
                  {uploadingAvatar ? <Spinner className="h-3.5 w-3.5" /> : <CameraIcon />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold leading-tight text-gray-900">{user.name}</p>
                <p className="truncate text-sm text-gray-500">{user.email || user.phone || 'No contact detail'}</p>
              </div>
            </div>
            <div className="mt-4">
              <ProfileCompletionStrip user={{ avatarUrl, gender, ageRange, phone }} variant="profile" />
            </div>
          </section>

          <div>
            <SectionLabel>Your details</SectionLabel>
            <section className={LIST}>
              <Row label="Photo" missing={photoMissing}>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} className="rounded-lg text-sm font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60">
                  {uploadingAvatar ? 'Uploading…' : photoMissing ? 'Add photo' : 'Change'}
                </button>
              </Row>
              <Row label="Gender" missing={!gender}>
                <div className="w-40"><AppSelect value={gender} onChange={(value) => { void saveDetails({ gender: value, ageRange }); }} options={toSelectOptions(GENDER_OPTIONS)} placeholder="Choose…" compact /></div>
              </Row>
              <Row label="Age range" missing={!ageRange}>
                <div className="w-40"><AppSelect value={ageRange} onChange={(value) => { void saveDetails({ gender, ageRange: value }); }} options={toSelectOptions(AGE_RANGE_OPTIONS)} placeholder="Choose…" compact /></div>
              </Row>
{!editingPhone ? (
                <Row label="Phone" missing={!phone}>
                  {phone
                    ? <span className="truncate text-sm font-semibold text-gray-900">{phone}</span>
                    : <button type="button" onClick={() => { setPhoneDraft(''); setPhoneError(''); setEditingPhone(true); }} className="rounded-lg text-sm font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">Add number</button>}
                </Row>
              ) : (
                <div className="space-y-2 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">Your WhatsApp number</p>
                  <p className="text-xs text-gray-500">Participants and admins tap this to message you on WhatsApp.</p>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoFocus
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSavePhone(); }}
                    placeholder="08012345678"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {phoneError && <p className="text-xs font-medium text-red-700">{phoneError}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setEditingPhone(false)} className="rounded-2xl border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button type="button" onClick={() => void handleSavePhone()} disabled={savingPhone || !phoneDraft.trim()} className="rounded-2xl bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                      {savingPhone ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </section>
            {detailsError && <p className="mt-2 px-1 text-xs font-medium text-red-700">{detailsError}</p>}
          </div>

          <div>
            <SectionLabel>Programme</SectionLabel>
            <section className={LIST}>
              <Row label="Group"><span className="truncate text-sm font-semibold text-gray-900">{userLabels[0]?.name || 'Not assigned'}</span></Row>
              <Row label="Cohort"><span className="truncate text-sm font-semibold text-gray-900">{activeCohort?.name || 'No active cohort'}</span></Row>
              <Row label="Tags">
                {activityTags.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {activityTags.map((tag) => (
                      <LabelChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
                    ))}
                  </div>
                ) : <span className="text-sm text-gray-400">{userLabelIds.length === 0 ? 'None' : ''}</span>}
              </Row>
              {!editingWhatsapp ? (
                <Row label="WhatsApp group">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`min-w-0 truncate text-sm ${whatsappGroupUrl ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{whatsappGroupUrl ? whatsappGroupUrl.replace(/^https?:\/\//, '') : 'Not set'}</span>
                    <button type="button" onClick={() => setEditingWhatsapp(true)} className="flex-none text-sm font-semibold text-primary">{whatsappGroupUrl ? 'Edit' : 'Add'}</button>
                  </span>
                </Row>
              ) : (
                <div className="space-y-2 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">WhatsApp group link</p>
                  <p className="text-xs text-gray-500">Paste your group's invite link. It also shows as the group call link on My Group.</p>
                  <input
                    type="url"
                    value={whatsappGroupUrl}
                    onChange={(e) => setWhatsappGroupUrl(e.target.value)}
                    placeholder="https://chat.whatsapp.com/..."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { setWhatsappGroupUrl(user?.whatsappGroupUrl ?? ''); setEditingWhatsapp(false); }}
                      className="rounded-2xl border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveWhatsapp()}
                      disabled={savingWhatsapp}
                      className="rounded-2xl bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {savingWhatsapp ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
                    </button>
                  </div>
                </div>
              )}
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
