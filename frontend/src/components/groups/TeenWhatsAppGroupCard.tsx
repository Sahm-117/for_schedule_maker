import React, { useState } from 'react';
import { usersApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { normalizeLink } from '../../utils/links';
import Spinner from '../Spinner';

interface TeenWhatsAppGroupCardProps {
  userId: string;
  link: string | null | undefined;
}

// A Teen Support's WhatsApp group for their teens. Teens have no call, so this stands in for
// "Join Call": the support creates the group on WhatsApp, saves its link here, and the Welcome
// message picks the link up from this same place.
const TeenWhatsAppGroupCard: React.FC<TeenWhatsAppGroupCardProps> = ({ userId, link }) => {
  const { refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saved = link?.trim() || '';

  const startEditing = () => {
    setDraft(saved);
    setError('');
    setEditing(true);
  };

  const save = async () => {
    const next = normalizeLink(draft);
    if (!next) {
      setError('Paste the WhatsApp group link first.');
      return;
    }
    if (!/chat\.whatsapp\.com/i.test(next)) {
      setError('That does not look like a WhatsApp group link. It starts with chat.whatsapp.com.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await usersApi.saveWhatsappGroupUrl(userId, next);
      refreshUser({ whatsappGroupUrl: next });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the group link.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]" data-testid="teen-whatsapp-group">
      <p className="text-base font-bold text-gray-900">Your teens' WhatsApp group</p>
      {editing ? (
        <div className="mt-3 flex flex-col gap-3.5">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-gray-900">WhatsApp group link</label>
            <input
              type="url"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              className="min-h-[46px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1.5 text-xs text-gray-500">Create the group on WhatsApp first, then copy its invite link and paste it here.</p>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setEditing(false)} className="min-h-[46px] flex-none rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700">
              Cancel
            </button>
            <button type="button" onClick={() => { void save(); }} disabled={saving} className="min-h-[46px] min-w-0 flex-auto rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save WhatsApp group'}
            </button>
          </div>
        </div>
      ) : saved ? (
        <div className="mt-3 flex items-center gap-2">
          <a
            href={normalizeLink(saved)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 min-h-11 min-w-0 flex-auto items-center justify-center rounded-[10px] bg-emerald-600 px-3.5 text-sm font-semibold leading-none text-white hover:bg-emerald-700"
          >
            Open WhatsApp Group
          </a>
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit WhatsApp group link"
            title="Edit WhatsApp group link"
            className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 bg-white p-0 leading-none text-gray-600 hover:text-gray-900"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">Message each teen first, create the group on WhatsApp, then save its link here. The Welcome message uses it.</p>
          <button type="button" onClick={startEditing} className="mt-3 min-h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white">
            Set WhatsApp group
          </button>
        </>
      )}
    </section>
  );
};

export default TeenWhatsAppGroupCard;
