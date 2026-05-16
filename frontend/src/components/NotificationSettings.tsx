import React, { useState, useEffect } from 'react';
import { notificationSettingsApi } from '../services/api';

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIMING_OPTIONS: { label: string; value: number }[] = [
  { label: '15 mins before', value: 15 },
  { label: '30 mins before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '1 day before', value: 1440 },
];

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ isOpen, onClose }) => {
  const [selected, setSelected] = useState<number[]>([60]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setStatus('');
    notificationSettingsApi
      .get()
      .then((res) => setSelected(res.remindBeforeMinutes))
      .catch(() => setSelected([60]))
      .finally(() => setLoading(false));
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
      <div className="bg-white rounded-lg max-w-sm w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Notification Timing</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Choose when supports receive push reminders before their assigned activities. Multiple times can be selected.
          </p>

          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {TIMING_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {status && (
            <p className={`mt-3 text-sm ${status.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
              {status}
            </p>
          )}

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || selected.length === 0}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;
