import React, { useState } from 'react';
import Spinner from './Spinner';

// "Anything from today's class to flag?" — shown to a support once a week,
// after the notification prompt, once the configured feedback time has
// passed. Same shell as NotificationPromptModal.

interface Props {
  weekNumber: number;
  onSend: (note: string) => Promise<void> | void;
  onNone: () => Promise<void> | void;
  onDismiss: () => void;
}

const ClassFeedbackModal: React.FC<Props> = ({ weekNumber, onSend, onNone, onDismiss }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'send' | 'none' | null>(null);
  const [error, setError] = useState('');

  const send = async () => {
    if (!note.trim()) { setError('Write a note, or choose None.'); return; }
    setBusy('send');
    setError('');
    try {
      await onSend(note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.');
    } finally {
      setBusy(null);
    }
  };

  const none = async () => {
    setBusy('none');
    setError('');
    try {
      await onNone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
        <div className="bg-primary px-6 pt-6 pb-5 text-white text-center">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold">Week {weekNumber}'s class</h2>
          <p className="text-sm text-white/80 mt-1">Anything from today's class to flag?</p>
        </div>

        <div className="px-6 py-5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What happened, and with whom"
            className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <button
            onClick={() => { void send(); }}
            disabled={busy !== null}
            className="w-full mt-4 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors text-sm disabled:opacity-60"
          >
            {busy === 'send' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Send'}
          </button>
          <button
            onClick={() => { void none(); }}
            disabled={busy !== null}
            className="w-full mt-2 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {busy === 'none' ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'None'}
          </button>
          <button
            onClick={onDismiss}
            disabled={busy !== null}
            className="w-full py-2.5 mt-2 text-gray-400 text-sm hover:text-gray-600 transition-colors disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassFeedbackModal;
