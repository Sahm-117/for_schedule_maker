import React from 'react';
import AppShell from './AppShell';
import { AppDataProvider, useAppData } from '../context/AppDataContext';
import { ToastProvider } from './Toast';
import PrayerSignalProvider from './corporatePrayers/PrayerSignalProvider';

// The staff (admin and support) app: its data, toasts and shell. Loaded only when a staff
// member is signed in, so participants and the login page don't download it.
// A support who has switched to the Practice cohort receives Practice prayers there.
const StaffPrayers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeCohort } = useAppData();
  return <PrayerSignalProvider audience="staff" cohortId={activeCohort?.isPractice ? activeCohort.id : null}>{children}</PrayerSignalProvider>;
};

const StaffApp: React.FC = () => (
  <AppDataProvider>
    <ToastProvider>
      <StaffPrayers>
        <AppShell />
      </StaffPrayers>
    </ToastProvider>
  </AppDataProvider>
);

export default StaffApp;
