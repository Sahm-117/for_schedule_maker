import React, { useEffect, useMemo, useRef, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import SegmentedTabs from '../SegmentedTabs';
import Spinner from '../Spinner';
import ResourceAccordion from './ResourceAccordion';
import AudienceFields from './AudienceFields';
import { announcementsApi, resourcesApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../context/AppDataContext';
import { audienceError, audienceFromResource, audienceSummary, audienceToPayload, defaultAudience, type ResourceAudience } from './audience';
import type { Resource, SupportHub } from '../../types';

type Kind = 'file' | 'link';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 'add' makes a new resource; 'update' swaps the file or link (or just who sees it). */
  mode: 'add' | 'update';
  resource?: Resource | null;
  hubs: SupportHub[];
  onSaved: (resource: Resource) => void;
}

const INPUT = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const formatBytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

const ResourceEditorModal: React.FC<Props> = ({ isOpen, onClose, mode, resource, hubs, onSaved }) => {
  const { user } = useAuth();
  const { activeCohort, cohorts } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [audience, setAudience] = useState<ResourceAudience>(defaultAudience(null));
  const [notify, setNotify] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const formCohortId = (mode === 'update' ? resource?.cohortId : null) ?? activeCohort?.id ?? null;
  const cohortLabel = (formCohortId && cohorts.find((c) => c.id === formCohortId)?.name) || activeCohort?.name || 'This cohort';

  useEffect(() => {
    if (!isOpen) return;
    setKind('file'); setTitle(''); setDescription(''); setUrl(''); setFile(null); setNote('');
    setNotify(false); setAudienceOpen(false); setMoreOpen(false); setSaving(false); setError('');
    setAudience(mode === 'update' && resource ? audienceFromResource(resource) : defaultAudience(activeCohort?.id ?? null));
    if (fileRef.current) fileRef.current.value = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, resource?.id]);

  const summary = audienceSummary(audience, hubs, cohortLabel);
  const moreSummary = useMemo(() => {
    const parts: string[] = [];
    if (mode === 'add' && description.trim()) parts.push('Description added');
    if (mode === 'update' && note.trim()) parts.push('Note added');
    parts.push(notify ? 'Telling people' : 'Not telling people');
    return parts.join(' · ');
  }, [mode, description, note, notify]);

  const tellPeople = async (subject: string, body: string) => {
    if (!user) return;
    const base = { scope: audience.cohortId ? 'ACTIVE_COHORT' as const : 'ALL_USERS' as const, cohortId: audience.cohortId };
    const supportsAll = audience.supports && !audience.hubsOnly;
    const supportsHubs = audience.supports && audience.hubsOnly;
    if (supportsAll && audience.participants) {
      await announcementsApi.send(subject, body, user.id, { ...base, audience: 'EVERYONE' });
      return;
    }
    if (supportsAll) await announcementsApi.send(subject, body, user.id, { ...base, audience: 'SUPPORTS' });
    if (supportsHubs) {
      for (const hubId of audience.hubIds) {
        await announcementsApi.send(subject, body, user.id, { ...base, audience: 'SUPPORTS', targetHubId: hubId });
      }
    }
    if (audience.participants) await announcementsApi.send(subject, body, user.id, { ...base, audience: 'PARTICIPANTS' });
  };

  const handleSave = async () => {
    if (!user) return;
    const problem = audienceError(audience);
    if (problem) { setError(problem); setAudienceOpen(true); return; }
    const finalUrl = url.trim() ? (url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`) : '';
    if (mode === 'add') {
      if (!title.trim()) { setError('Add a title.'); return; }
      if (kind === 'file' && !file) { setError('Choose a file.'); return; }
      if (kind === 'link' && !finalUrl) { setError('Paste a link.'); return; }
    }
    setSaving(true);
    setError('');
    try {
      const payload = audienceToPayload(audience);
      let saved: Resource;
      if (mode === 'add') {
        saved = kind === 'link'
          ? (await resourcesApi.addLink({ title: title.trim(), description: description.trim() || undefined, url: finalUrl, addedBy: user.id, audience: payload })).resource
          : (await resourcesApi.uploadFile({ title: title.trim(), description: description.trim() || undefined, file: file as File, addedBy: user.id, audience: payload })).resource;
      } else {
        if (!resource) return;
        saved = (await resourcesApi.replaceDocument(resource.id, {
          file: kind === 'file' ? file : null,
          url: kind === 'link' ? finalUrl || null : null,
          note: note.trim(),
          audience: payload,
        })).resource;
      }
      if (notify) {
        try {
          const name = mode === 'add' ? title.trim() : resource?.title || saved.title;
          await tellPeople(mode === 'add' ? 'New resource added' : `Updated: ${name}`, mode === 'add'
            ? `"${name}" has been added to Resources. Open the app to view it.`
            : `"${name}" has been updated in Resources.${note.trim() ? ` ${note.trim().replace(/[.!?]+$/, '')}.` : ''} Open the app to view it.`);
        } catch {
          // The notice failing never undoes the save.
        }
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changesFile = mode === 'update' && (kind === 'file' ? !!file : !!url.trim());

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (!saving) onClose(); }}
      title={mode === 'add' ? 'Add resource' : 'Update document'}
      subtitle={mode === 'add' ? 'Upload a file or add a link.' : resource?.title}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : mode === 'add' ? 'Add resource' : changesFile ? 'Save update' : 'Save'}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        {mode === 'update' && resource && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">Currently</p>
            <p className="mt-1 rounded-xl bg-[#f6f7f9] px-3 py-2 text-[13px] text-gray-700">
              {resource.type === 'link' ? resource.url : `${resource.fileName ?? 'File'}${resource.fileSize ? ` · ${formatBytes(resource.fileSize)}` : ''}`}
              {` · ${shortDate(resource.updatedAt ?? resource.createdAt)}`}
            </p>
          </div>
        )}

        <SegmentedTabs tabs={[{ key: 'file', label: 'File' }, { key: 'link', label: 'Link' }]} active={kind} onChange={(k) => setKind(k as Kind)} />

        {mode === 'add' && (
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={80} className={INPUT} />
        )}

        {kind === 'link' ? (
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={mode === 'update' ? 'New link (optional)' : 'https://...'} className={INPUT} />
        ) : (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.pptx,.zip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-dark"
            />
            <p className="mt-1 text-xs text-gray-400">{mode === 'update' ? 'Leave empty to change only who sees it. ' : ''}PDF, Word, Excel, PowerPoint, images, ZIP</p>
          </div>
        )}

        <ResourceAccordion title="Who can see it" summary={summary} active open={audienceOpen} onToggle={() => setAudienceOpen((v) => !v)}>
          <AudienceFields value={audience} onChange={setAudience} hubs={hubs} cohortId={formCohortId} cohortLabel={cohortLabel} />
        </ResourceAccordion>

        <ResourceAccordion title="More options" summary={moreSummary} active={notify} open={moreOpen} onToggle={() => setMoreOpen((v) => !v)}>
          {mode === 'add' ? (
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" maxLength={120} className={INPUT} />
          ) : (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">What changed (optional)</p>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Corrected the attendance rule on page 4" maxLength={140} className={INPUT} />
            </div>
          )}
          <button type="button" role="switch" aria-checked={notify} onClick={() => setNotify((v) => !v)} className="flex w-full items-center justify-between gap-4 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-left">
            <span>
              <span className="block text-[14px] font-semibold text-gray-800">Tell people</span>
              <span className="block text-[11px] text-gray-500">Send a notification to the people who can see it</span>
            </span>
            <span className={`relative h-[22px] w-[38px] flex-none rounded-full transition ${notify ? 'bg-primary' : 'bg-gray-300'}`}>
              <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${notify ? 'left-[19px]' : 'left-[3px]'}`} />
            </span>
          </button>
        </ResourceAccordion>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
};

export default ResourceEditorModal;
