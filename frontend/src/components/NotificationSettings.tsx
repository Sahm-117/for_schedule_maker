import React, { useState, useEffect } from 'react';
import { notificationSettingsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

const TIMING_OPTIONS: { label: string; value: number }[] = [
  { label: '15 mins before', value: 15 },
  { label: '30 mins before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '1 day before', value: 1440 },
];

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ isOpen, onClose, embedded = false }) => {
  const { user } = useAuth();
  const { enable, status: deviceStatus } = usePushNotifications(user?.id);
  const [selected, setSelected] = useState<number[]>([60]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(false);

  const shouldRender = embedded || isOpen;

  useEffect(() => {
    if (!shouldRender) return;
    setLoading(true);
    setStatus('');
    notificationSettingsApi
      .get()
      .then((res) => setSelected(res.remindBeforeMinutes))
      .catch(() => setSelected([60]))
      .finally(() => setLoading(false));
  }, [shouldRender]);

  const toggle = (value: number) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      await notificationSettingsApi.set(selected);
      setStatus('Notification settings saved.');
    } catch {
      setStatus('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!shouldRender) return null;

  const summary = selected
    .slice()
    .sort((a, b) => a - b)
    .map((value) => TIMING_OPTIONS.find((option) => option.value === value)?.label || `${value} mins`)
    .join(' • ');
  const deviceStatusText = {
    unsupported: 'Push notifications are not supported on this browser.',
    blocked: 'Notifications are blocked for this browser. Enable them in browser settings first.',
    ready: 'Not enabled on this device yet.',
    saving: 'Saving this device...',
    enabled: 'Notifications enabled on this device.',
    failed: 'Failed to enable notifications on this device. Try again.',
  }[deviceStatus];
  const canEnableDevice = deviceStatus !== 'unsupported' && deviceStatus !== 'blocked' && deviceStatus !== 'saving';

  const editor = (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {TIMING_OPTIONS.map((opt) => {
            const enabled = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  enabled ? 'border-primary bg-orange-50/60' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
                <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${enabled ? 'bg-primary' : 'bg-slate-200'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {status && (
        <p className={`text-sm ${status.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
          {status}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            if (!embedded) onClose();
          }}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || selected.length === 0}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );

  const content = (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Reminder Preferences</h3>
        {!embedded && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Pick when you would like reminder nudges before your assigned activities. You can choose more than one.
      </p>
      <div className="mb-4 rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-primary shadow-sm">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Device notifications</p>
              <p className={`mt-1 text-sm ${deviceStatus === 'blocked' || deviceStatus === 'failed' ? 'text-red-600' : deviceStatus === 'enabled' ? 'text-green-700' : 'text-gray-500'}`}>
                {deviceStatusText}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={enable}
            disabled={!canEnableDevice}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deviceStatus === 'saving' ? 'Saving...' : 'Enable on this device'}
          </button>
        </div>
      </div>
      {embedded ? (
        <>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Your reminder plan</p>
                <p className="mt-1 text-sm text-gray-500">{summary || 'No reminder times selected yet.'}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-full border border-primary p-2 text-primary hover:bg-primary/5"
                aria-label="Edit reminder preferences"
                title="Edit reminder preferences"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m15.232 5.232 3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 1 1 3.536 3.536L12.536 14.5A4 4 0 0 1 10.7 15.6L7 17l1.4-3.7a4 4 0 0 1 1.1-1.836Z" />
                </svg>
              </button>
            </div>
          </div>
        </>
      ) : editor}
    </div>
  );

  return embedded ? (
    <>
      <div className="surface-card overflow-hidden">{content}</div>
      {editing && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Edit Reminder Preferences</h3>
                <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {editor}
            </div>
          </div>
        </div>
      )}
    </>
  ) : (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
      <div className="bg-white rounded-lg max-w-sm w-full">
        {content}
      </div>
    </div>
  );
};

export default NotificationSettings;
