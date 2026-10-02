import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import PageLoader from '../components/PageLoader';
import { usePracticeEntry } from '../context/PracticeEntryContext';

// The Practice tile and the More-menu entry both come here: switch to the Practice cohort, open
// the pop-up, and land on Home (where the pop-up sits on top).
const SupportPracticeEntryPage: React.FC = () => {
  const { on, open } = usePracticeEntry();
  const started = useRef(false);
  useEffect(() => {
    if (!on || started.current) return;
    started.current = true;
    void open();
  }, [on, open]);
  if (!on) return <PageLoader label="Opening Practice…" />;
  return <Navigate to="/support" replace />;
};

export default SupportPracticeEntryPage;
