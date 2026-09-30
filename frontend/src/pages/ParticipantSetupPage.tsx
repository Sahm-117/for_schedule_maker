import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAppSetup, appSetupDone } from '../hooks/useAppSetup';
import { useParticipantPush } from '../hooks/useParticipantPush';
import { noteSheetDismissed } from '../hooks/useAppServerState';
import AppSetupSteps from '../components/participantApp/AppSetupSteps';

// Straight after choosing a password: add the app to the Home Screen and turn
// notifications on. It can be skipped, and the app asks again on each launch.

const ParticipantSetupPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const setup = useAppSetup();
  const push = useParticipantPush();
  const [enabling, setEnabling] = useState(false);

  if (!user) return null;
  if (user.mustChangePassword) return <Navigate to="/me/welcome" replace />;

  const done = appSetupDone(setup);
  const next = () => {
    // Asked just now: don't open the same steps again on the next screen.
    try { sessionStorage.setItem('fof_appsetup_dismissed_session', '1'); } catch { /* private browsing etc. */ }
    if (!done) noteSheetDismissed();
    navigate('/me/profile?welcome=1', { replace: true });
  };

  const enableNotifications = async () => {
    setEnabling(true);
    try { await push.enable(); } finally { setEnabling(false); setup.refresh(); }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <img src="/logo-full.png" alt="The Covenant Nation | Ikorodu" className="mx-auto mb-6 h-10 w-auto object-contain" />
        <h1 className="text-2xl font-bold text-gray-900">Get the app</h1>
        <p className="mb-4 mt-1 text-[14px] leading-relaxed text-gray-600">
          Two quick steps so you never miss a class, a group call or a message from your support.
        </p>
        <AppSetupSteps setup={setup} enableNotifications={enableNotifications} enabling={enabling} />
        <button type="button" onClick={next} className={`mt-5 min-h-[48px] w-full rounded-xl text-[15px] font-semibold ${done ? 'bg-primary text-white' : 'text-gray-500 hover:bg-white'}`}>
          {done ? 'Continue' : 'Do this later'}
        </button>
        {!done && <p className="mt-1 text-center text-[12px] text-gray-400">We will remind you when you open the app.</p>}
      </div>
    </div>
  );
};

export default ParticipantSetupPage;
