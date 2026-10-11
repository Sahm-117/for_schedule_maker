import React, { useEffect, useRef, useState } from 'react';
import ModalShell from './followups/ModalShell';
import Avatar from './Avatar';
import Spinner from './Spinner';
import { useAuth } from '../hooks/useAuth';
import { buildWhatsAppLink } from '../utils/phone';
import { useAppData } from '../context/AppDataContext';
import { usersApi, groupsApi } from '../services/api';
import type { Group, Participant, User } from '../types';
import AppSelect from './AppSelect';
import { AGE_RANGE_OPTIONS, GENDER_OPTIONS, toSelectOptions } from '../constants/departments';

interface HubAuthorProfileModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Admin edits made in this window, so the page behind can show them straight away. */
  onUserUpdated?: (userId: string, changes: Partial<User>) => void;
}

const formatLastActive = (iso?: string | null) => {
  if (!iso) return 'Never';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
};

const HubAuthorProfileModal: React.FC<HubAuthorProfileModalProps> = ({ userId, isOpen, onClose, onUserUpdated }) => {
  const { isAdmin, user: viewer } = useAuth();
  // Group and participants are always the ones in the cohort being viewed.
  const { activeCohort } = useAppData();
  const cohortId = activeCohort?.id ?? null;
  const [loading, setLoading] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lastActive, setLastActive] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    setLoading(true);
    setProfileUser(null);
    setGroup(null);
    setParticipants([]);
    setLastActive(null);

    (async () => {
      try {
        const { user } = await usersApi.getById(userId);
        if (cancelled) return;
        setProfileUser(user);
        usersApi.getLastActive(userId).then((at) => { if (!cancelled) setLastActive(at); }).catch(() => {});

        if (user.role === 'SUPPORT') {
          const { group: assignedGroup } = await groupsApi.getForSupport(userId, cohortId);
          if (cancelled) return;
          setGroup(assignedGroup);

          if (assignedGroup) {
            const { participants: groupParticipants } = await groupsApi.getParticipants(assignedGroup.id);
            if (cancelled) return;
            setParticipants(groupParticipants);
          }
        }
      } catch (error) {
        console.error('Failed to load Hub author profile:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, userId, cohortId, isAdmin]);

  // Anyone except a participant can reach a support straight from their profile.
  const canContact = viewer?.role !== 'PARTICIPANT' && profileUser?.role === 'SUPPORT' && !!profileUser.phone;
  const waLink = canContact ? buildWhatsAppLink(profileUser?.phone, `Hi ${profileUser?.name.split(' ')[0]}, `) : null;
  const telLink = canContact ? `tel:${profileUser?.phone?.replace(/[^\d+]/g, '')}` : null;

  // Admins fill in a support's details here when the support hasn't done it themselves.
  const canEdit = isAdmin && profileUser?.role === 'SUPPORT';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => { setSaveError(''); setEditingPhone(false); setPhoneError(''); }, [userId, isOpen]);

  const applyChanges = (changes: Partial<User>) => {
    if (!profileUser) return;
    setProfileUser({ ...profileUser, ...changes });
    onUserUpdated?.(profileUser.id, changes);
  };

  // Each detail saves as soon as it is picked, the same as on the support's own profile.
  const saveField = async (changes: Partial<User>, save: () => Promise<void>) => {
    if (!profileUser) return;
    const previous = { ...profileUser };
    setSaveError('');
    applyChanges(changes);
    try {
      await save();
    } catch {
      setProfileUser(previous);
      onUserUpdated?.(previous.id, Object.fromEntries(Object.keys(changes).map((k) => [k, previous[k as keyof User]])) as Partial<User>);
      setSaveError('Could not save. Please try again.');
    }
  };

  const saveDetails = (next: { gender: string | null; ageRange: string | null }) =>
    saveField(next, () => usersApi.saveProfileDetails(profileUser!.id, next));

  // Birthday is day + month only (MM-DD); it saves once both are picked.
  const [birthdayDraft, setBirthdayDraft] = useState({ month: '', day: '' });
  useEffect(() => {
    const [month = '', day = ''] = (profileUser?.birthday ?? '').split('-');
    setBirthdayDraft({ month, day });
  }, [profileUser?.id, profileUser?.birthday]);
  const pickBirthday = (next: { month: string; day: string }) => {
    setBirthdayDraft(next);
    if (!next.month || !next.day) return;
    const value = `${next.month}-${next.day}`;
    if (value === profileUser?.birthday) return;
    void saveField({ birthday: value }, () => usersApi.saveBirthday(profileUser!.id, value));
  };
  // Birth year is optional; once set, the database sets the age range from it.
  const pickBirthYear = (value: string) => {
    const year = value ? Number(value) : null;
    void saveField({ birthYear: year }, async () => {
      const { ageRange } = await usersApi.saveBirthYear(profileUser!.id, year);
      setProfileUser((prev) => (prev ? { ...prev, ageRange } : prev));
      onUserUpdated?.(profileUser!.id, { ageRange });
    });
  };
  const daysInMonth = birthdayDraft.month ? new Date(2024, Number(birthdayDraft.month), 0).getDate() : 31;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileUser) return;
    setUploadingAvatar(true);
    setSaveError('');
    try {
      const { avatarUrl } = await usersApi.uploadAvatar(profileUser.id, file);
      applyChanges({ avatarUrl });
    } catch {
      setSaveError('Could not upload the photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Saved the same way sign-up stores it (080…), so it works for WhatsApp and phone sign-in.
  const handleSavePhone = async () => {
    if (!profileUser) return;
    const digits = phoneDraft.replace(/\D/g, '');
    const local = /^234[7-9][01]\d{8}$/.test(digits) ? `0${digits.slice(3)}` : digits;
    if (!/^0[7-9][01]\d{8}$/.test(local)) {
      setPhoneError('Enter a valid Nigerian number, e.g. 08012345678.');
      return;
    }
    if (local === profileUser.phone) { setEditingPhone(false); return; }
    setSavingPhone(true);
    setPhoneError('');
    try {
      await usersApi.savePhone(profileUser.id, local);
      applyChanges({ phone: local });
      setEditingPhone(false);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSavingPhone(false);
    }
  };


  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Profile">
      {loading || !profileUser ? (
        <div className="flex items-center justify-center gap-1.5 py-10 text-center text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col items-center text-center">
            <Avatar
              name={profileUser.name}
              avatarUrl={profileUser.avatarUrl}
              size="xl"
              enlargeable
              className="border-4 border-white shadow-[0_12px_30px_-12px_rgba(17,24,39,0.35)]"
            />
            <h3 className="mt-3 max-w-full truncate text-xl font-bold text-gray-900">{profileUser.name}</h3>
            <span className="mt-1.5 inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
              {profileUser.role}
            </span>
            {canEdit ? (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleAvatarChange(e)} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60"
                >
                  {uploadingAvatar ? (<><Spinner className="h-3 w-3" />Uploading…</>) : profileUser.avatarUrl ? 'Change photo' : 'Add photo'}
                </button>
              </>
            ) : profileUser.avatarUrl && <p className="mt-1 text-xs text-gray-400">Tap photo to view full size</p>}
          </div>

          {canContact && (
            <div className="flex items-center justify-center gap-2">
              {telLink && (
                <a href={telLink} aria-label={`Call ${profileUser.name}`} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  Call
                </a>
              )}
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${profileUser.name}`} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-95">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.71.45 3.36 1.3 4.82L2 22l5.4-1.42a9.87 9.87 0 004.64 1.18h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.85 9.85 0 0012.04 2zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.8-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .55.01.18.01.42-.07.65.5.24.58.81 2 .88 2.15.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.94 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.07.18-.27.36-.22.6-.13.24.09 1.55.73 1.82.86.27.14.44.2.51.32.07.11.07.65-.17 1.32z" /></svg>
                  WhatsApp
                </a>
              )}
            </div>
          )}

          {canEdit && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Details</p>
              <div className="surface-muted divide-y divide-gray-200/60">
                <DetailRow label="Gender" missing={!profileUser.gender}>
                  <div className="w-40"><AppSelect value={profileUser.gender ?? ''} onChange={(v) => void saveDetails({ gender: v || null, ageRange: profileUser.ageRange ?? null })} options={toSelectOptions(GENDER_OPTIONS)} placeholder="Choose…" compact /></div>
                </DetailRow>
                <DetailRow label="Age range" missing={!profileUser.ageRange}>
                  <div className="w-40"><AppSelect value={profileUser.ageRange ?? ''} onChange={(v) => void saveDetails({ gender: profileUser.gender ?? null, ageRange: v || null })} options={toSelectOptions(AGE_RANGE_OPTIONS)} placeholder="Choose…" compact disabled={!!profileUser.birthYear} /></div>
                </DetailRow>
                <DetailRow label="Birthday" hint="Optional">
                  <div className="flex w-40 gap-1.5">
                    <div className="w-[4.25rem]"><AppSelect value={birthdayDraft.day} onChange={(v) => pickBirthday({ ...birthdayDraft, day: v })} options={DAY_OPTIONS.slice(0, daysInMonth)} placeholder="Day" compact /></div>
                    <div className="flex-1"><AppSelect value={birthdayDraft.month} onChange={(v) => pickBirthday({ month: v, day: birthdayDraft.day && Number(birthdayDraft.day) <= new Date(2024, Number(v), 0).getDate() ? birthdayDraft.day : '' })} options={MONTH_OPTIONS} placeholder="Month" compact /></div>
                  </div>
                </DetailRow>
                <DetailRow label="Birth year" hint="Optional. Sets the age range">
                  <div className="w-40"><AppSelect value={profileUser.birthYear ? String(profileUser.birthYear) : ''} onChange={pickBirthYear} options={[{ value: '', label: 'Not given' }, ...BIRTH_YEAR_OPTIONS]} placeholder="Year" compact /></div>
                </DetailRow>
                {!editingPhone ? (
                  <DetailRow label="Phone" missing={!profileUser.phone}>
                    <span className="flex min-w-0 items-center gap-2">
                      {profileUser.phone && <span className="truncate text-sm font-semibold text-gray-900">{profileUser.phone}</span>}
                      <button
                        type="button"
                        onClick={() => { setPhoneDraft(profileUser.phone ?? ''); setPhoneError(''); setEditingPhone(true); }}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/15"
                      >
                        {profileUser.phone ? 'Edit' : 'Add number'}
                      </button>
                    </span>
                  </DetailRow>
                ) : (
                  <div className="space-y-2 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">WhatsApp number</p>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoFocus
                      value={phoneDraft}
                      onChange={(e) => setPhoneDraft(e.target.value)}
                      placeholder="08012345678"
                      aria-label="Phone number"
                      className="w-full rounded-xl border-0 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {phoneError && <p className="text-xs text-red-600">{phoneError}</p>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingPhone(false)} disabled={savingPhone} className="rounded-full bg-gray-100 px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
                      <button type="button" onClick={() => void handleSavePhone()} disabled={savingPhone} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                        {savingPhone ? (<><Spinner className="h-3 w-3" />Saving…</>) : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
            </div>
          )}

          {/* When they last used the app at all (sign-in activity or Community). */}
          <div className="surface-muted flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500">Last active</span>
            <span className="text-sm font-semibold text-gray-900">{formatLastActive(lastActive ?? profileUser.hubLastSeenAt)}</span>
          </div>

          {profileUser.role === 'SUPPORT' && (
            <div className="space-y-3">
              <div className="surface-muted flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Group</span>
                <span className="text-sm font-semibold text-gray-900">{group?.name ?? 'Not assigned'}</span>
              </div>

              {group && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Participants ({participants.length})
                  </p>
                  {participants.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-orange-200 py-6 text-center text-sm text-gray-500">
                      No participants in this group yet.
                    </div>
                  ) : (
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {participants.map((participant) => (
                        <div key={participant.id} className="surface-muted px-3 py-2 text-sm text-gray-700">
                          {participant.fullName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </ModalShell>
  );
};

const BIRTH_YEAR_OPTIONS = Array.from({ length: 90 }, (_, i) => { const y = new Date().getFullYear() - 10 - i; return { value: String(y), label: String(y) }; });
const MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  .map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: String(i + 1) }));

const DetailRow: React.FC<{ label: string; missing?: boolean; hint?: string; children: React.ReactNode }> = ({ label, missing, hint, children }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
    <span className="flex items-center gap-1.5 text-sm text-gray-500">
      {label}
      {hint && <span className="text-[11px] text-gray-400">· {hint}</span>}
      {missing && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-label="Still needed" />}
    </span>
    {children}
  </div>
);

export default HubAuthorProfileModal;
