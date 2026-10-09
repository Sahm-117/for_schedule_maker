import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmationModal from '../ConfirmationModal';
import Spinner from '../Spinner';
import { settingsApi } from '../../services/api';
import { ToggleRow } from './FollowUpAssignmentSettings';

// One switch on Settings: whether teens (under 18) are looked after by Teen
// Supports. Off, everyone is handled as before. The number of teens one Teen
// Support looks after sits with the other programme rules.
const TeenSettingsCard: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.getTeenFlowEnabled()
      .then((on) => { if (!cancelled) setEnabled(on); })
      .catch(() => { /* keep the default on error */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = (next: boolean) => {
    setSaving(true);
    setError('');
    setEnabled(next);
    settingsApi.setTeenFlowEnabled(next)
      .catch(() => { setEnabled(!next); setError('Could not save. Please try again.'); })
      .finally(() => setSaving(false));
  };

  return (
    <div className="surface-card p-6">
      <h3 className="text-lg font-semibold text-gray-900">Teens</h3>
      <p className="mt-1 text-sm text-gray-500">
        Teens (under 18) are looked after by supports on the Teen Support tag, away from the app. Choose those supports on the Supports page.
      </p>
      {loading ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
      ) : (
        <div className="mt-2">
          <ToggleRow
            label="Look after teens separately"
            description="Anyone who signs up as under 18 becomes a Teenager and goes to a Teen Support. Supports can also add a teen from Mobilisation."
            checked={enabled}
            disabled={saving}
            onChange={(next) => { if (next) setConfirmOn(true); else save(false); }}
          />
          {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
        </div>
      )}
      {createPortal(
        <div className="relative z-[130]">
          <ConfirmationModal
            isOpen={confirmOn}
            onClose={() => setConfirmOn(false)}
            onConfirm={() => { setConfirmOn(false); save(true); }}
            title="Turn on teen handling?"
            message="From now, anyone who signs up as under 18 becomes a Teenager and goes to a Teen Support instead of the usual follow-up supports. Make sure enough supports are on the Teen Support tag first."
            confirmText="Turn on"
            type="warning"
          />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default TeenSettingsCard;
