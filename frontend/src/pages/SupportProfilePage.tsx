import React, { useEffect, useRef, useState } from 'react';

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

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your details, activity tags, and how you want to receive reminders."
        tourId="support:profile"
      />

      <div className="mb-6 grid items-start gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <section data-wt="profile-groups" className={CARD}>
          <h2 className="mb-4 text-lg font-bold text-gray-900">Account</h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative flex-shrink-0 focus:outline-none"
              title="Change photo"
            >
              <Avatar name={user.name} avatarUrl={avatarUrl} size="lg" />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition hover:opacity-100">
                {uploadingAvatar ? (
                  <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                ) : (
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </span>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-gray-900">{user.name}</p>
              <p className="truncate text-sm text-gray-500">{user.email || user.phone || 'No contact detail'}</p>
              <p className="mt-0.5 text-xs text-gray-400">Tap photo to change</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <InfoRow label="Name" value={user.name} />
            <InfoRow label="Role" value="Support" />
            <InfoRow label="Group" value={userLabels[0]?.name || 'Not assigned'} />
            <InfoRow label="Cohort" value={activeCohort?.name || 'No active cohort'} />
            <InfoRow
              label="Activity tags"
              value={userLabelIds.length === 0 ? 'None assigned' : undefined}
              content={activityTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {activityTags.map((tag) => (
                    <LabelChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
                  ))}
                </div>
              ) : undefined}
            />
          </div>

          {/* WhatsApp group link — collapsed by default, Edit expands a URL field */}
          <div className="mt-5 border-t border-[#f1f2f5] pt-4">
            {!editingWhatsapp ? (
              <div className="flex items-center gap-3">
                <span className="w-[90px] flex-none text-[13px] text-gray-500">WhatsApp group</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{whatsappGroupUrl || 'Not set'}</span>
                <button
                  type="button"
                  onClick={() => setEditingWhatsapp(true)}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">WhatsApp group link</p>
                <p className="text-xs text-gray-500">Paste your WhatsApp group's invite link here. It also shows as the group call link on My Group.</p>
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
                    {savingWhatsapp ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className={CARD}>
          <div data-wt="profile-theme">
          <h2 className="mb-1.5 text-lg font-bold text-gray-900">Accent colour</h2>
          <p className="text-[13px] text-gray-500">Your theme colour, applied across the app.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
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
                  className={`h-10 w-10 rounded-xl transition focus:outline-none ${selected ? 'border-2 border-gray-800' : 'border border-gray-200 hover:scale-105'}`}
                />
              );
            })}
            <label title="Custom colour" className="relative h-10 w-10 cursor-pointer overflow-hidden rounded-xl border border-dashed border-gray-300" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
              <input type="color" value={themeColor} onChange={(e) => handleThemeChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          </div>
          {themeColor.toLowerCase() !== (user?.themeColor ?? DEFAULT_THEME).toLowerCase() && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">{THEME_SWATCHES.find((s) => s.hex === themeColor.toLowerCase())?.label ?? themeColor}</span>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => { const saved = user?.themeColor ?? DEFAULT_THEME; setThemeColor(saved); applyTheme(saved); }} className="rounded-2xl border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={() => void handleSaveTheme()} disabled={savingTheme} className="rounded-2xl bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                  {savingTheme ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          </div>

          <h2 className="mb-1.5 mt-6 text-lg font-bold text-gray-900">Alerts</h2>
          <div data-wt="profile-notifications">
            <NotificationSettings isOpen onClose={() => {}} embedded />
          </div>
        </section>
      </div>

    </div>
  );
};

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const InfoRow: React.FC<{ label: string; value?: string; content?: React.ReactNode }> = ({ label, value, content }) => (
  <div className="flex items-center gap-3">
    <span className="w-[90px] flex-none text-[13px] text-gray-500">{label}</span>
    {content || <span className="min-w-0 text-sm font-semibold text-gray-900">{value}</span>}
  </div>
);

export default SupportProfilePage;
