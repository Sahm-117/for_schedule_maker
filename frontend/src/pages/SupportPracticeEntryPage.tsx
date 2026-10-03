import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageLoader from '../components/PageLoader';
import { usePracticeEntry } from '../context/PracticeEntryContext';

// The Practice tile and the More-menu entry both come here: switch to the Practice cohort, open
// the pop-up, and land on Home (where the pop-up sits on top).
const SupportPracticeEntryPage: React.FC = () => {
  const { ready, on, open, retry } = usePracticeEntry();
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!ready || !on || opening || opened || error) return;
    setOpening(true);
    void open().then(() => { setError(null); setOpened(true); }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not open Practice. Please try again.');
    }).finally(() => setOpening(false));
  }, [ready, on, open, opening, opened, error]);

  useEffect(() => {
    if (ready) { setSlow(false); return undefined; }
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [ready, retryKey]);

  if (ready && !on) return <Navigate to="/support" replace />;
  if (error || slow) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-gray-700">{error || 'Practice is taking longer than expected to load.'}</p>
        <button type="button" onClick={() => {
          setError(null);
          setSlow(false);
          setRetryKey((value) => value + 1);
          setOpening(true);
          void retry().then(() => setError(null)).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'Could not open Practice. Please try again.');
          }).finally(() => setOpening(false));
        }} disabled={opening} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {opening ? 'Trying again…' : 'Try again'}
        </button>
      </div>
    );
  }
  if (opened) return <Navigate to="/support" replace />;
  return <PageLoader label={opening ? 'Opening Practice…' : 'Checking Practice…'} />;
};

export default SupportPracticeEntryPage;
