import React, { useEffect, useState } from 'react';
import type { MessageTemplate } from '../../types';
import ModalShell from './ModalShell';
import ConfirmationModal from '../ConfirmationModal';
import { messageTemplatesApi, settingsApi } from '../../services/api';

interface MessageBankPanelProps {
  templates: MessageTemplate[];
  onTemplatesChanged: (templates: MessageTemplate[]) => void;
  registrationLink: string;
  onRegistrationLinkChanged: (url: string) => void;
}

const inputClass =
  'w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100';

const MessageBankPanel: React.FC<MessageBankPanelProps> = ({
  templates,
  onTemplatesChanged,
  registrationLink,
  onRegistrationLinkChanged,
}) => {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [useCase, setUseCase] = useState('');
  const [body, setBody] = useState('');
  const [whenToUse, setWhenToUse] = useState('');
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null);
  const [linkDraft, setLinkDraft] = useState(registrationLink);
  const [savingLink, setSavingLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setLinkDraft(registrationLink), [registrationLink]);

  const openForm = (template?: MessageTemplate) => {
    setEditing(template || null);
    setUseCase(template?.useCase || '');
    setBody(template?.body || '');
    setWhenToUse(template?.whenToUse || '');
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!useCase.trim() || !body.trim()) {
      setError('Use case and message body are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const input = { useCase: useCase.trim(), body, whenToUse: whenToUse.trim() || null };
      if (editing) {
        const { template } = await messageTemplatesApi.update(editing.id, input);
        onTemplatesChanged(templates.map((t) => (t.id === template.id ? template : t)));
      } else {
        const { template } = await messageTemplatesApi.create(input);
        onTemplatesChanged([...templates, template]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await messageTemplatesApi.delete(deleting.id);
      onTemplatesChanged(templates.filter((t) => t.id !== deleting.id));
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveLink = async () => {
    setSavingLink(true);
    try {
      const { url } = await settingsApi.setRegistrationLink(linkDraft.trim());
      onRegistrationLinkChanged(url);
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="surface-card rounded-3xl p-5">
        <p className="text-sm font-bold text-gray-900">Registration link</p>
        <p className="mt-0.5 text-xs text-gray-500">Used wherever a template contains {'{{registration_link}}'}.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={inputClass} value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://..." />
          <button
            type="button"
            onClick={() => { void handleSaveLink(); }}
            disabled={savingLink || linkDraft.trim() === registrationLink}
            className="shrink-0 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {savingLink ? 'Saving…' : 'Save link'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">Templates</p>
          <p className="text-xs text-gray-500">Placeholders: {'{{first_name}}'}, {'{{full_name}}'}, {'{{registration_link}}'}</p>
        </div>
        <button
          type="button"
          onClick={() => openForm()}
          className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Add template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-3xl bg-orange-50/60 px-4 py-10 text-center text-sm text-gray-500">No templates yet — add your first WhatsApp message template.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="surface-card flex flex-col rounded-3xl p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">{t.useCase}</p>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => openForm(t)} className="rounded-xl px-2.5 py-1 text-xs font-semibold text-primary hover:bg-orange-50">Edit</button>
                  <button type="button" onClick={() => setDeleting(t)} className="rounded-xl px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                </div>
              </div>
              {t.whenToUse && <p className="mt-1 text-xs font-medium text-amber-700">{t.whenToUse}</p>}
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-gray-600">{t.body}</p>
            </div>
          ))}
        </div>
      )}

      <ModalShell
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Edit template' : 'Add template'}
        footer={(
          <>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
            <button type="button" onClick={() => { void handleSave(); }} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Use case</label>
            <input className={inputClass} value={useCase} onChange={(e) => setUseCase(e.target.value)} placeholder="e.g. First WhatsApp message" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Message</label>
            <textarea className={`${inputClass} min-h-[160px]`} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'Hi {{first_name}}! ...'} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">When to use (optional)</label>
            <input className={inputClass} value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} placeholder="e.g. Send after no response" />
          </div>
        </div>
      </ModalShell>

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete template"
        message={`Delete the "${deleting?.useCase}" template? This cannot be undone.`}
        confirmText="Delete"
      />
    </div>
  );
};

export default MessageBankPanel;
