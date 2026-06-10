import React, { useEffect, useMemo, useState } from 'react';
import type { FollowUpContact, FollowUpIssue, User } from '../../types';
import AppSelect from '../AppSelect';
import AppOverflowMenu from '../AppOverflowMenu';
import ModalShell from './ModalShell';
import FollowUpStatusPill from './FollowUpStatusPill';
import { ISSUE_STATUS_META } from '../../utils/followUps';
import { followUpIssuesApi } from '../../services/api';
import { supabase } from '../../lib/supabase';

interface FollowUpIssuesPanelProps {
  issues: FollowUpIssue[];
  onIssuesChanged: (issues: FollowUpIssue[]) => void;
  contacts: FollowUpContact[];
  owners: User[];
  currentUserId?: string;
  canResolve?: boolean;
  canDelete?: boolean;
  canAssignOwner?: boolean;
  canReply?: boolean;
  onIssuesOpen?: () => void;
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
  canDelete = true,
  canAssignOwner = true,
  canReply = true,
  onIssuesOpen,
}) => {
  useEffect(() => { onIssuesOpen?.(); }, [onIssuesOpen]);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [issueText, setIssueText] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [neededFrom, setNeededFrom] = useState('');
  const [resolving, setResolving] = useState<FollowUpIssue | null>(null);
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [deleting, setDeleting] = useState<FollowUpIssue | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter((c) => c.fullName.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const toggleContact = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const selectedNames = useMemo(
    () => selectedIds.map((id) => contacts.find((c) => c.id === id)?.fullName || 'Unknown'),
    [selectedIds, contacts]
  );

  const visibleIssues = useMemo(
    () => showClosed ? issues : issues.filter((i) => i.status === 'OPEN'),
    [issues, showClosed]
  );

  const handleCreate = async () => {
    if (!issueText.trim()) {
      setError('Describe the issue or question.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const names = selectedNames.join(', ');
      const { issue } = await followUpIssuesApi.create({
        contactId: selectedIds[0] || null,
        person: names || null,
        issue: issueText.trim(),
        reportedById: currentUserId || null,
        ownerId: canAssignOwner ? (ownerId || null) : null,
        neededFrom: neededFrom.trim() || null,
      });
      onIssuesChanged([issue, ...issues]);
      setShowForm(false);
      setSelectedIds([]);
      setContactSearch('');
      setIssueText('');
      setOwnerId('');
      setNeededFrom('');
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

  const handleReopen = async (issue: FollowUpIssue) => {
    setSaving(true);
    try {
      const { issue: updated } = await followUpIssuesApi.update(issue.id, { status: 'OPEN' });
      onIssuesChanged(issues.map((i) => (i.id === updated.id ? updated : i)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await followUpIssuesApi.delete(deleting.id);
      onIssuesChanged(issues.filter((i) => i.id !== deleting.id));
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  };

  const handleReply = async (issue: FollowUpIssue) => {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      const updatedIssue = `${issue.issue}\n\n---\nReply: ${replyText.trim()}`;
      const { issue: updated } = await followUpIssuesApi.update(issue.id, { issue: updatedIssue });
      onIssuesChanged(issues.map((i) => (i.id === updated.id ? updated : i)));
      setReplyingTo(null);
      setReplyText('');
      if (issue.reportedById && issue.reportedById !== currentUserId) {
        void supabase.functions.invoke('notify-followup-issue', {
          body: { issueId: issue.id, reporterId: issue.reportedById },
        }).catch(() => undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const contactChips = (
    <div className="flex flex-wrap gap-1.5">
      {selectedIds.map((id) => {
        const c = contacts.find((x) => x.id === id);
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {c?.fullName || 'Unknown'}
            <button type="button" onClick={() => toggleContact(id)} className="ml-0.5 text-primary/60 hover:text-primary">&times;</button>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">Issues & questions</p>
          <p className="text-xs text-gray-500">Put messy questions here, not inside people&apos;s heads.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className={`rounded-2xl px-3 py-2 text-xs font-semibold ${showClosed ? 'bg-slate-700 text-white' : 'border border-orange-200 bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            {showClosed ? 'Hide closed' : 'Show closed'}
          </button>
          <button type="button" onClick={() => setShowForm(true)} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
            Log issue
          </button>
        </div>
      </div>

      {visibleIssues.length === 0 ? (
        <p className="rounded-3xl bg-orange-50/60 px-4 py-10 text-center text-sm text-gray-500">No issues logged.</p>
      ) : (
        <div className="space-y-3">
          {visibleIssues.map((issue) => {
            const personNames = issue.person ? issue.person.split(', ').filter(Boolean) : [];
            return (
              <div key={issue.id} className="surface-card rounded-3xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FollowUpStatusPill label={ISSUE_STATUS_META[issue.status].label} tone={ISSUE_STATUS_META[issue.status].tone} />
                      {(issue.contactName || issue.person) && (
                        <div className="flex flex-wrap gap-1">
                          {personNames.length > 0 ? personNames.map((name, i) => (
                            <span key={i} className="inline-flex items-center rounded-full bg-amber-100/70 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              {name}
                            </span>
                          )) : (
                            <span className="text-xs font-semibold text-gray-700">{issue.contactName || issue.person}</span>
                          )}
                        </div>
                      )}
                      <span className="text-xs text-gray-400">Opened {issue.openedAt}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{issue.issue}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {issue.reportedByName ? `Reported by: ${issue.reportedByName} • ` : ''}
                      {issue.ownerName ? `Owner: ${issue.ownerName}` : 'No owner'}
                      {issue.neededFrom ? ` • Needed from: ${issue.neededFrom}` : ''}
                    </p>
                    {issue.resolution && <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Resolution: {issue.resolution}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <AppOverflowMenu
                      items={[
                        ...(issue.status === 'OPEN' && canResolve ? [{ label: 'Resolve', onClick: () => { setResolving(issue); setResolution(''); } }] : []),
                        ...(issue.status === 'RESOLVED' && canResolve ? [{ label: 'Reopen', onClick: () => { void handleReopen(issue); } }] : []),
                        ...(canDelete ? [{ label: 'Delete', onClick: () => setDeleting(issue), tone: 'danger' as const }] : []),
                      ]}
                    />
                  </div>
                </div>
                {canReply && issue.status === 'OPEN' && (
                  <div className="mt-3 border-t border-orange-50 pt-3">
                    {replyingTo === issue.id ? (
                      <div className="flex gap-2">
                        <textarea
                          className="min-h-[60px] flex-1 rounded-2xl border border-orange-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type a reply…"
                        />
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => { void handleReply(issue); }}
                            disabled={saving || !replyText.trim()}
                            className="rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                          >
                            Send
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReplyingTo(null); setReplyText(''); }}
                            className="rounded-2xl border border-orange-100 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-orange-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setReplyingTo(issue.id); setReplyText(''); }}
                        className="rounded-2xl border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-orange-50"
                      >
                        Reply
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

          <div className="relative">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Related contacts</label>
            {contactChips}
            <div className="relative mt-1.5">
              <input
                className={inputClass}
                value={contactSearch}
                onChange={(e) => { setContactSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search contacts…"
              />
              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-orange-100 bg-white shadow-lg">
                    {filteredContacts.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-400">No contacts found</p>
                    ) : filteredContacts.slice(0, 50).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onPointerDown={() => toggleContact(c.id)}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition hover:bg-orange-50 ${selectedIds.includes(c.id) ? 'bg-primary/5 font-semibold text-primary' : 'text-gray-700'}`}
                      >
                        {selectedIds.includes(c.id) && <span className="text-primary">✓</span>}
                        <span>{c.fullName}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

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

      {canDelete && (
        <ModalShell
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete issue"
        footer={(
          <>
            <button type="button" onClick={() => setDeleting(null)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
            <button type="button" onClick={() => { void handleDelete(); }} disabled={saving} className="rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </>
        )}
      >
        <p className="text-sm text-gray-700">Delete this issue? This cannot be undone.</p>
      </ModalShell>
      )}
    </div>
  );
};

export default FollowUpIssuesPanel;
