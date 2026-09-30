import React, { useState } from 'react';
import { followUpContactsApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { FollowUpContact, FollowUpContactUpdate } from '../../types';

// What someone wrote under "Any other questions or concerns?" on the sign-up
// form, on their follow-up card so the support sees it when they reach out.
// A support or admin marks it answered; a later form with a new question makes
// it unanswered again.

interface FormQuestionBoxProps {
  contact: FollowUpContact;
  /** Called with the saved contact. */
  onChange?: (contact: FollowUpContact) => void;
  /** Or hand the change to the page to save (the Follow-ups table does this). */
  onPatch?: (patch: FollowUpContactUpdate) => Promise<void> | void;
  className?: string;
}

const formatDay = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const hasOpenFormQuestion = (contact: FollowUpContact) =>
  !!contact.formQuestion?.trim() && !contact.formQuestionAnsweredAt;

const FormQuestionBox: React.FC<FormQuestionBoxProps> = ({ contact, onChange, onPatch, className = '' }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const question = contact.formQuestion?.trim();
  if (!question) return null;
  const answered = !!contact.formQuestionAnsweredAt;

  const setAnswered = async (value: boolean) => {
    setSaving(true);
    setError('');
    try {
      const patch: FollowUpContactUpdate = {
        formQuestionAnsweredAt: value ? new Date().toISOString() : null,
        formQuestionAnsweredById: value ? user?.id ?? null : null,
      };
      if (onPatch) {
        await onPatch(patch);
      } else {
        const { contact: saved } = await followUpContactsApi.update(contact.id, patch);
        onChange?.(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-[12px] px-3 py-2.5 ${answered ? 'bg-gray-50' : 'bg-sky-50'} ${className}`}>
      <div className="flex items-center gap-2">
        <p className={`min-w-0 flex-1 text-[11px] font-bold uppercase tracking-[0.04em] ${answered ? 'text-gray-500' : 'text-sky-700'}`}>
          They asked on the registration form
        </p>
        {answered && (
          <span className="flex-none text-[11px] font-semibold text-emerald-700">
            Answered {formatDay(contact.formQuestionAnsweredAt!)}
          </span>
        )}
      </div>
      <p className={`mt-1 whitespace-pre-line text-[13px] leading-snug ${answered ? 'text-gray-500' : 'text-gray-800'}`}>“{question}”</p>
      {(onChange || onPatch) && (
        answered ? (
          <button type="button" disabled={saving} onClick={() => void setAnswered(false)} className="mt-1.5 text-[12px] font-semibold text-gray-500 underline-offset-2 hover:underline disabled:opacity-60">
            Not answered yet
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={() => void setAnswered(true)} className="mt-2 min-h-[36px] w-full rounded-[10px] border border-sky-200 bg-white px-3 text-[12.5px] font-semibold text-sky-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Mark as answered'}
          </button>
        )
      )}
      {error && <p className="mt-1.5 text-[12px] text-red-700">{error}</p>}
    </div>
  );
};

export default FormQuestionBox;
