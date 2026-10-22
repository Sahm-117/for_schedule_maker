import React, { useEffect, useState } from 'react';
import AppSelect from '../AppSelect';
import { settingsApi } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';

// Settings > Add someone on this number (FLOW_MAP rule 95): whether participants may add a husband, wife,
// child, brother or sister on their own number in the app, and until which week's class.

const WEEK_CHOICES = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Until the end of week ${i + 1}'s class day` }));

const AddOnNumberCard: React.FC = () => {
  const { can } = usePermissions();
  const canEdit = can('settings', 'edit');
  const [value, setValue] = useState<{ enabled: boolean; untilWeek: number } | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsApi.getAddOnNumberSetting().then((v) => { if (!cancelled) setValue(v); }).catch(() => { if (!cancelled) setStatus('Could not load this setting.'); });
    return () => { cancelled = true; };
  }, []);

  const save = async (next: { enabled: boolean; untilWeek: number }) => {
    const before = value;
    setValue(next);
    setSaving(true);
    setStatus('');
    try {
      await settingsApi.setAddOnNumberSetting(next);
      setStatus('Saved.');
    } catch {
      setValue(before);
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card p-6">
      <h3 className="text-lg font-semibold text-gray-900">Add someone on this number</h3>
      <p className="mt-1 text-sm text-gray-500">
        Lets a participant add a husband, wife, child, brother or sister who uses the same phone number, from their Profile.
        They are Access confirmed straight away (teens need the parent&apos;s tick) and use the same password. Admins are told each time.
      </p>
      {!value ? (
        <p className="mt-4 text-sm text-gray-400">{status || 'Loading…'}</p>
      ) : (
        <div className="mt-4 space-y-3">
          <button
            type="button"
            role="switch"
            aria-checked={value.enabled}
            disabled={!canEdit || saving}
            onClick={() => void save({ ...value, enabled: !value.enabled })}
            className="flex min-h-[44px] items-center gap-3 rounded-xl bg-gray-50 px-3.5 text-sm font-semibold text-gray-800 disabled:opacity-60"
          >
            <span className={`relative h-6 w-10 flex-none rounded-full transition ${value.enabled ? 'bg-primary' : 'bg-gray-300'}`} aria-hidden="true">
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value.enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            {value.enabled ? 'On' : 'Off'}
          </button>
          {value.enabled && (
            <AppSelect label="Open" value={String(value.untilWeek)} onChange={(v) => void save({ ...value, untilWeek: Number(v) })} options={WEEK_CHOICES} placeholder="Choose a week" disabled={!canEdit || saving} />
          )}
          {status && <p className={`text-xs ${status === 'Saved.' ? 'text-emerald-700' : 'text-red-600'}`} role="status">{status}</p>}
        </div>
      )}
    </div>
  );
};

export default AddOnNumberCard;
