import React, { useState } from 'react';
import type { FollowUpContact, FollowUpIssue, User } from '../../types';
import AppSelect from '../AppSelect';
import ModalShell from './ModalShell';
import FollowUpStatusPill from './FollowUpStatusPill';
import { ISSUE_STATUS_META } from '../../utils/followUps';
import { followUpIssuesApi } from '../../services/api';

interface FollowUpIssuesPanelProps {
  issues: FollowUpIssue[];
  onIssuesChanged: (issues: FollowUpIssue[]) => void;
  contacts: FollowUpContact[];
  owners: User[];
  currentUserId?: string;
  canResolve?: boolean;
  canAssignOwner?: boolean;
}

const inputClass =
  'w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100';

const FollowUpIssuesPanel: React.FC<FollowUpIssuesPanelProps> = ({
  issues,
  onIssuesChanged,
  contacts,
  owners,
  currentUserId,
  canResolve = true,
  canAssignOwner = true,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [contactId, setContactId] = useState('');
  const [issueText, setIssueText] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [neededFrom, setNeededFrom] = useState('');
  const [resolving, setResolving] = useState<FollowUpIssue | null>(null);
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!issueText.trim()) {
      setError('Describe the issue or question.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { issue } = await followUpIssuesApi.create({
        contactId: contactId || null,
        issue: issueText.trim(),
        reportedById: currentUserId || null,
        ownerId: canAssignOwner ? (ownerId || null) : null,
        neededFrom: neededFrom.trim() || null,
      });
      onIssuesChanged([issue, ...issues]);
      setShowForm(false);
      setContactId(''); setIssueText(''); setOwnerId(''); setNeededFrom('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log issue.');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!resolving) return;
    setSaving(true);
    try {
      const { issue } = await followUpIssuesApi.update(resolving.id, {
        status: 'RESOLVED',
        resolution: resolution.trim() || null,
      });
      onIssuesChanged(issues.map((i) => (i.id === issue.id ? issue : i)));
      setResolving(null);
      setResolution('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">Issues & questions</p>
          <p className="text-xs text-gray-500">Put messy questions here, not inside people's heads.</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
          Log issue
        </button>
      </div>

      {issues.length === 0 ? (
        <p className="rounded-3xl bg-orange-50/60 px-4 py-10 text-center text-sm text-gray-500">No issues logged.</p>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={issue.id} className="surface-card rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FollowUpStatusPill label={ISSUE_STATUS_META[issue.status].label} tone={ISSUE_STATUS_META[issue.status].tone} />
                    {(issue.contactName || issue.person) && (
                      <span className="text-xs font-semibold text-gray-700">{issue.contactName || issue.person}</span>
                    )}
                    <span className="text-xs text-gray-400">Opened {issue.openedAt}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-800">{issue.issue}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {issue.reportedByName ? `Reported by: ${issue.reportedByName} • ` : ''}
                    {issue.ownerName ? `Owner: ${issue.ownerName}` : 'No owner'}
                    {issue.neededFrom ? ` • Needed from: ${issue.neededFrom}` : ''}
                  </p>
                  {issue.resolution && <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Resolution: {issue.resolution}</p>}
                </div>
                {canResolve && issue.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => { setResolving(issue); setResolution(''); }}
                    className="shrink-0 rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalShell
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Log an issue or question"
        footer={(
          <>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
            <button type="button" onClick={() => { void handleCreate(); }} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {saving ? 'Saving…' : 'Log issue'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <AppSelect
            label="Related contact (optional)"
            value={contactId}
            onChange={setContactId}
            options={[{ value: '', label: 'No specific contact' }, ...contacts.map((c) => ({ value: c.id, label: c.fullName }))]}
            placeholder="No specific contact"
          />
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Issue / question</label>
            <textarea className={`${inputClass} min-h-[90px]`} value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder="What needs answering or unblocking?" />
          </div>
          {canAssignOwner && (
            <AppSelect
              label="Owner (optional)"
              value={ownerId}
              onChange={setOwnerId}
              options={[{ value: '', label: 'No owner' }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
              placeholder="No owner"
            />
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Needed from (optional)</label>
            <input className={inputClass} value={neededFrom} onChange={(e) => setNeededFrom(e.target.value)} placeholder="e.g. Pastor, Admin team" />
          </div>
        </div>
      </ModalShell>

      {canResolve && (
        <ModalShell
          isOpen={!!resolving}
          onClose={() => setResolving(null)}
          title="Resolve issue"
          footer={(
            <>
              <button type="button" onClick={() => setResolving(null)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
              <button type="button" onClick={() => { void handleResolve(); }} disabled={saving} className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Mark resolved'}
              </button>
            </>
          )}
        >
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Resolution (optional)</label>
            <textarea className={`${inputClass} min-h-[90px]`} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="How was it resolved?" />
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default FollowUpIssuesPanel;
