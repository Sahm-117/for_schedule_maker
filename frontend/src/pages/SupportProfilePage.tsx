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
import type { Label } from '../types';
import NotificationSettings from '../components/NotificationSettings';
import { useAuth } from '../hooks/useAuth';
import { useWalkthrough } from '../hooks/useWalkthrough';
import WalkthroughPopup from '../components/walkthrough/WalkthroughPopup';
import Avatar from '../components/Avatar';
import { applyTheme, DEFAULT_THEME } from '../utils/theme';

const SupportProfilePage: React.FC = () => {
  const { user, userLabelIds, refreshUser } = useAuth();
  const [activityTags, setActivityTags] = useState<Label[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [themeColor, setThemeColor] = useState<string>(user?.themeColor ?? DEFAULT_THEME);
  const [savingTheme, setSavingTheme] = useState(false);
  const [editingTheme, setEditingTheme] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { liveRevision } = useAppData();
  const wt = useWalkthrough('profile');

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/settings" replace />;
  }

  useEffect(() => {
    usersApi.getUserLabels(user.id)
      .then((response) => setActivityTags(response.labels))
      .catch(() => setActivityTags([]));
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
      setEditingTheme(false);
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

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your details, activity tags, and how you want to receive reminders."
        onHelp={wt.reopen}
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div data-wt="profile-groups" className="surface-card p-6">
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
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{user.name}</h3>
              <p className="text-sm text-gray-500">{user.email || user.phone || 'No contact detail'}</p>
              <p className="mt-0.5 text-xs text-gray-400">Tap photo to change</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <InfoRow label="Role" value={user.role} />
            <InfoRow
              label="Activity tags"
              value={userLabelIds.length === 0 ? 'None assigned' : undefined}
              content={activityTags.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {activityTags.map((tag) => (
                    <LabelChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
                  ))}
                </div>
              ) : undefined}
            />
          </div>

          {/* Accent colour — collapsed by default, Edit expands picker */}
          <div className="mt-3">
            {!editingTheme ? (
              <div className="surface-muted flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Accent colour</span>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full shadow-sm" style={{ backgroundColor: themeColor }} />
                  <span className="text-xs text-gray-500">
                    {THEME_SWATCHES.find((s) => s.hex === themeColor.toLowerCase())?.label ?? themeColor}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingTheme(true)}
                    className="ml-2 rounded-full px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <div className="surface-muted px-4 py-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Accent colour</p>
                <div className="flex flex-wrap gap-2">
                  {THEME_SWATCHES.map((s) => (
                    <button
                      key={s.hex}
                      type="button"
                      title={s.label}
                      onClick={() => handleThemeChange(s.hex)}
                      style={{ backgroundColor: s.hex, ['--tw-ring-color' as any]: s.hex }}
                      className={`h-8 w-8 rounded-full transition focus:outline-none ${themeColor.toLowerCase() === s.hex ? 'ring-2 ring-offset-2' : 'hover:scale-110'}`}
                    >
                      {themeColor.toLowerCase() === s.hex && (
                        <svg className="mx-auto h-4 w-4 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                  ))}
                  <label title="Custom colour" className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-gray-300 hover:border-gray-400" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                    <input type="color" value={themeColor} onChange={(e) => handleThemeChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </label>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-6 w-6 flex-shrink-0 rounded-full shadow-sm" style={{ backgroundColor: themeColor }} />
                  <span className="text-xs text-gray-500">
                    {THEME_SWATCHES.find((s) => s.hex === themeColor.toLowerCase())?.label ?? themeColor}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => { const saved = user?.themeColor ?? DEFAULT_THEME; setThemeColor(saved); applyTheme(saved); setEditingTheme(false); }} className="rounded-2xl border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button type="button" onClick={() => void handleSaveTheme()} disabled={savingTheme} className="rounded-2xl bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                      {savingTheme ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div data-wt="profile-notifications">
          <NotificationSettings isOpen onClose={() => {}} embedded />
        </div>
      </div>

      {wt.show && (
        <WalkthroughPopup
          steps={[
            { targetSelector: '[data-wt="profile-groups"]', title: 'Your activity tags', body: 'These are the tags assigned to you. Your schedule and activities are filtered to these tags.', position: 'top' },
            { targetSelector: '[data-wt="profile-notifications"]', title: 'Reminder alerts', body: 'Set up reminder alerts here so you never miss a follow-up.', position: 'top' },
          ]}
          onDone={wt.done}
          onSkip={wt.skipAll}
        />
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value?: string; content?: React.ReactNode }> = ({ label, value, content }) => (
  <div className="surface-muted flex items-center justify-between px-4 py-3">
    <span className="text-sm text-gray-500">{label}</span>
    {content || <span className="text-sm font-semibold text-gray-900">{value}</span>}
  </div>
);

export default SupportProfilePage;
