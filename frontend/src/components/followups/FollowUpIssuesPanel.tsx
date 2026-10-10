import React, { useEffect, useMemo, useState } from 'react';
import type { FollowUpContact, FollowUpIssue, User } from '../../types';
import AppSelect from '../AppSelect';
import LinkText from '../LinkText';
import AppOverflowMenu from '../AppOverflowMenu';
import ModalShell from './ModalShell';
import FollowUpStatusPill from './FollowUpStatusPill';
import { ISSUE_STATUS_META } from '../../utils/followUps';
import { followUpIssuesApi } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { sortByText } from '../../utils/sort';
import { selectedFirst } from '../../utils/selectedFirst';
import Spinner from '../Spinner';
import { genderAgeLine } from '../../utils/people';

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
  /** Show the "Log an issue" button. */
  canCreate?: boolean;
  onIssuesOpen?: () => void;
  /** Open the "Log an issue or question" form straight away with these contacts picked. */
  startWithContactIds?: string[];
}

const inputClass =
  'w-full rounded-xl bg-gray-100 px-4 py-3 text-base text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-orange-200';
const labelClass = 'mb-1.5 block text-[13px] font-medium text-gray-500';

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
  canCreate = true,
  onIssuesOpen,
  startWithContactIds,
}) => {
  useEffect(() => { onIssuesOpen?.(); }, [onIssuesOpen]);
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(!!startWithContactIds?.length);
  const [selectedIds, setSelectedIds] = useState<string[]>(startWithContactIds ?? []);
  const [contactSearch, setContactSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [issueText, setIssueText] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [neededFrom, setNeededFrom] = useState('');
  const [resolving, setResolving] = useState<FollowUpIssue | null>(null);
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [view, setView] = useState<'open' | 'closed'>('open');
  const [showDetails, setShowDetails] = useState(false);
  const [deleting, setDeleting] = useState<FollowUpIssue | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const list = q
      ? sortByText(contacts.filter((c) => c.fullName.toLowerCase().includes(q)), (contact) => contact.fullName)
      : sortByText(contacts, (contact) => contact.fullName);
    return selectedFirst(list, (c) => selectedIds.includes(c.id));
  }, [contacts, contactSearch, selectedIds]);

  const toggleContact = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const selectedNames = useMemo(
    () => sortByText(selectedIds.map((id) => contacts.find((c) => c.id === id)?.fullName || 'Unknown'), (name) => name),
    [selectedIds, contacts]
  );

  const isClosed = (i: FollowUpIssue) => i.status !== 'OPEN';
  const openCount = useMemo(() => issues.filter((i) => i.status === 'OPEN').length, [issues]);
  const visibleIssues = useMemo(
    () => issues.filter((i) => (view === 'open' ? !isClosed(i) : isClosed(i))),
    [issues, view]
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
        contactIds: selectedIds,
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
      setShowDetails(false);
      setView('open');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log issue.');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!resolving) return;
    setSaving(true);
    setActionError('');
    try {
      const { issue } = await followUpIssuesApi.update(resolving.id, {
        status: 'RESOLVED',
        resolution: resolution.trim() || null,
      });
      onIssuesChanged(issues.map((i) => (i.id === issue.id ? issue : i)));
      setResolving(null);
      setResolution('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not mark it resolved.');
      setResolving(null);
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async (issue: FollowUpIssue) => {
    setSaving(true);
    setActionError('');
    try {
      const { issue: updated } = await followUpIssuesApi.update(issue.id, { status: 'OPEN' });
      onIssuesChanged(issues.map((i) => (i.id === updated.id ? updated : i)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reopen it.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setActionError('');
    try {
      await followUpIssuesApi.delete(deleting.id);
      onIssuesChanged(issues.filter((i) => i.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete it.');
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  };

  const handleReply = async (issue: FollowUpIssue) => {
    const actingAsAdminOfMany = user?.role === 'ADMIN' && (user.roles?.length ?? 0) > 1;
    if (!replyText.trim()) return;
    setSaving(true);
    setActionError('');
    try {
      const updatedIssue = `${issue.issue}\n\n---\nReply: ${replyText.trim()}`;
      const { issue: updated } = await followUpIssuesApi.update(issue.id, { issue: updatedIssue });
      onIssuesChanged(issues.map((i) => (i.id === updated.id ? updated : i)));
      setReplyingTo(null);
      setReplyText('');
      if (issue.reportedById && issue.reportedById !== currentUserId) {
        void supabase.functions.invoke('notify-followup-issue', {
          body: { issueId: issue.id, reporterId: issue.reportedById, replierId: currentUserId, replierSuffix: actingAsAdminOfMany ? '(Admin)' : undefined, kind: 'REPLY' },
        }).catch(() => undefined);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send the reply.');
    } finally {
      setSaving(false);
    }
  };

  const contactChips = selectedIds.length > 0 && (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {selectedIds.map((id) => {
        const c = contacts.find((x) => x.id === id);
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-orange-50 py-1 pl-3 pr-1.5 text-[13px] font-semibold text-orange-800">
            {c?.fullName || 'Unknown'}
            <button type="button" onClick={() => toggleContact(id)} aria-label={`Remove ${c?.fullName || 'contact'}`} className="grid h-5 w-5 place-items-center rounded-full text-orange-700/70 hover:bg-orange-100">&times;</button>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div role="group" aria-label="Show issues" className="flex flex-1 rounded-xl bg-gray-100 p-1">
          {([['open', `Open${openCount ? ` · ${openCount}` : ''}`], ['closed', 'Closed']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`min-h-[36px] flex-1 rounded-lg px-3 text-sm font-semibold transition ${view === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {canCreate && (
          <button type="button" onClick={() => { setError(''); setShowForm(true); }} className="min-h-[44px] flex-none rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">
            Log an issue
          </button>
        )}
      </div>

      {actionError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}

      {visibleIssues.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-base font-semibold text-gray-900">{view === 'open' ? 'All clear' : 'Nothing closed yet'}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
            {view === 'open' ? 'No open issues. When something is stuck or you have a question, log it here.' : 'Resolved issues show up here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleIssues.map((issue) => {
            const personNames = issue.person ? issue.person.split(', ').filter(Boolean) : [];
            const meta = [
              `Opened ${issue.openedAt}`,
              issue.reportedByName ? `by ${issue.reportedByName}` : '',
              issue.ownerName ? `Owner: ${issue.ownerName}` : '',
              issue.neededFrom ? `Needed from: ${issue.neededFrom}` : '',
            ].filter(Boolean).join(' · ');
            const canReopen = isClosed(issue) && canResolve;
            const canClose = !isClosed(issue) && canResolve;
            const canReplyHere = canReply && !isClosed(issue);
            return (
              <li key={issue.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {personNames.length > 0 ? personNames.map((name, i) => (
                      <span key={i} className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[13px] font-semibold text-orange-800">{name}</span>
                    )) : (
                      <span className="text-[13px] font-semibold text-gray-700">{issue.contactName || issue.person || 'General'}</span>
                    )}
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    {isClosed(issue) && <FollowUpStatusPill label={ISSUE_STATUS_META[issue.status].label} tone={ISSUE_STATUS_META[issue.status].tone} />}
                    {canDelete && (
                      <AppOverflowMenu items={[{ label: 'Delete', onClick: () => setDeleting(issue), tone: 'danger' as const }]} />
                    )}
                  </div>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900"><LinkText text={issue.issue} /></p>
                <p className="mt-2 text-xs text-gray-500">{meta}</p>
                {issue.resolution && (
                  <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800"><span className="font-semibold">Resolved:</span> {issue.resolution}</p>
                )}
                {(canReplyHere || canClose || canReopen) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {replyingTo === issue.id ? (
                      <div className="space-y-2">
                        <textarea
                          autoFocus
                          className={`${inputClass} min-h-[72px]`}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write a reply"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => { setReplyingTo(null); setReplyText(''); }} className="min-h-[40px] rounded-xl px-4 text-sm font-semibold text-gray-500">Cancel</button>
                          <button
                            type="button"
                            onClick={() => { void handleReply(issue); }}
                            disabled={saving || !replyText.trim()}
                            className="min-h-[40px] rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                          >
                            Send reply
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-5">
                        {canReplyHere && (
                          <button type="button" onClick={() => { setReplyingTo(issue.id); setReplyText(''); }} className="min-h-[36px] text-sm font-semibold text-primary">Reply</button>
                        )}
                        {canClose && (
                          <button type="button" onClick={() => { setResolving(issue); setResolution(''); }} className="min-h-[36px] text-sm font-semibold text-emerald-700">Resolve</button>
                        )}
                        {canReopen && (
                          <button type="button" onClick={() => { void handleReopen(issue); }} disabled={saving} className="min-h-[36px] text-sm font-semibold text-primary disabled:opacity-50">Reopen</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ModalShell
        isOpen={showForm}
        onClose={() => { setShowForm(false); setError(''); }}
        title="Log an issue"
        subtitle="Say what is stuck, or ask your question."
        stacked
        footer={(
          <>
            <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-gray-500">Cancel</button>
            <button type="button" onClick={() => { void handleCreate(); }} disabled={saving || !issueText.trim()} className="min-h-[44px] rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Log issue'}
            </button>
          </>
        )}
      >
        <div className="space-y-5">
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div>
            <label className={labelClass} htmlFor="issue-text">What is happening?</label>
            <textarea id="issue-text" className={`${inputClass} min-h-[110px]`} value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder="Describe the issue or question" />
          </div>

          <div className="relative">
            <label className={labelClass} htmlFor="issue-contact">Who is it about? <span className="text-gray-400">(optional)</span></label>
            {contactChips}
            <div className="relative">
              <input
                id="issue-contact"
                className={inputClass}
                value={contactSearch}
                onChange={(e) => { setContactSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search a name"
                autoComplete="off"
              />
              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg">
                    {filteredContacts.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">No one found</p>
                    ) : filteredContacts.slice(0, 50).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onPointerDown={() => toggleContact(c.id)}
                        className={`flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-[15px] transition hover:bg-orange-50 ${selectedIds.includes(c.id) ? 'bg-orange-50/60 font-semibold text-orange-800' : 'text-gray-800'}`}
                      >
                        <span className="w-4 flex-none text-primary">{selectedIds.includes(c.id) ? '✓' : ''}</span>
                        <span>{c.fullName}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {showDetails ? (
            <div className="space-y-5">
              {canAssignOwner && (
                <AppSelect
                  label="Owner"
                  value={ownerId}
                  onChange={setOwnerId}
                  options={[{ value: '', label: 'No owner' }, ...sortByText(owners, (o) => o.name).map((o) => ({ value: o.id, label: o.name, meta: genderAgeLine(o) || undefined }))]}
                  placeholder="No owner"
                />
              )}
              <div>
                <label className={labelClass} htmlFor="issue-needed">Needed from</label>
                <input id="issue-needed" className={inputClass} value={neededFrom} onChange={(e) => setNeededFrom(e.target.value)} placeholder="e.g. Pastor, Admin team" />
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowDetails(true)} className="min-h-[36px] text-sm font-semibold text-primary">
              {canAssignOwner ? 'Add owner or who it is needed from' : 'Add who it is needed from'}
            </button>
          )}
        </div>
      </ModalShell>

      {canResolve && (
        <ModalShell
          isOpen={!!resolving}
          onClose={() => setResolving(null)}
          title="Resolve issue"
          stacked
          footer={(
            <>
              <button type="button" onClick={() => setResolving(null)} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-gray-500">Cancel</button>
              <button type="button" onClick={() => { void handleResolve(); }} disabled={saving} className="min-h-[44px] rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Mark resolved'}
              </button>
            </>
          )}
        >
          <div>
            <label className={labelClass}>How was it resolved? <span className="text-gray-400">(optional)</span></label>
            <textarea className={`${inputClass} min-h-[90px]`} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Add a short note" />
          </div>
        </ModalShell>
      )}

      {canDelete && (
        <ModalShell
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete issue"
        stacked
        footer={(
          <>
            <button type="button" onClick={() => setDeleting(null)} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-gray-500">Cancel</button>
            <button type="button" onClick={() => { void handleDelete(); }} disabled={saving} className="min-h-[44px] rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Deleting…</span>) : 'Delete'}
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
