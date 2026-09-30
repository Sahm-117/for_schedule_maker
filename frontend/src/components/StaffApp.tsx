import React from 'react';
import AppShell from './AppShell';
import { AppDataProvider } from '../context/AppDataContext';
import { ToastProvider } from './Toast';

// The staff (admin and support) app: its data, toasts and shell. Loaded only when a staff
// member is signed in, so participants and the login page don't download it.
const StaffApp: React.FC = () => (
  <AppDataProvider>
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  </AppDataProvider>
);

export default StaffApp;
