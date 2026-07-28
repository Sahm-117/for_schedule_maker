import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import NotificationSettings from '../components/NotificationSettings';
import { settingsApi } from '../services/api';

// Editable contact behind the floating "Need Support" button. Lets admins change
// who help routes to (name + WhatsApp number) without a deploy.
const SupportContactCard: React.FC = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.getSupportContact()
      .then((c) => { if (!cancelled) { setName(c.name); setPhone(c.phone); } })
      .catch(() => { /* keep blank on error */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      setStatus('Please enter both a name and a phone number.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      await settingsApi.setSupportContact({ name, phone });
      setStatus('Saved. The Need Support button now points here.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Support contact</h3>
        <p className="mt-1 text-sm text-gray-500">Who the floating “Need Support” button opens a WhatsApp chat with.</p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading || saving}
            placeholder="e.g. Adetutu"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading || saving}
            placeholder="e.g. 2348184742850 or 08184742850"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status && (
          <p className={`text-sm ${status.toLowerCase().includes('could not') || status.toLowerCase().includes('please enter') ? 'text-red-600' : 'text-gray-600'}`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
};

const AdminSettingsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Control notification timings and the support contact."
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <NotificationSettings isOpen onClose={() => {}} embedded />

        <SupportContactCard />
      </div>
    </div>
  );
};

export default AdminSettingsPage;
