import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useShellHelp } from '../shellHelp';

// A support with no participant group this cohort. In a hub (hub-only roles): their hub lives on My Hub.
// In neither yet: they are waiting to be placed, so say so instead of sending them to an empty My Hub.
// Until the hub is known (still loading, or it failed) the My Hub card shows, as before.
const NoGroupCard: React.FC<{ hubOnlyText: string }> = ({ hubOnlyText }) => {
  const { myHub, myHubLoaded } = useAppData();
  const openHelp = useShellHelp();

  if (!myHubLoaded || myHub?.hub) {
    return (
      <section className="surface-card p-8 text-center">
        <p className="text-sm font-semibold text-gray-700">You don&apos;t have a participant group this cohort</p>
        <p className="mt-1 text-xs text-gray-400">{hubOnlyText}</p>
        <NavLink to="/support/my-hub" className="mt-4 inline-flex min-h-[38px] items-center rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white">
          Open My Hub
        </NavLink>
      </section>
    );
  }

  return (
    <section data-wt="sp-no-group" className="surface-card p-8 text-center">
      <p className="text-base font-bold text-gray-900">You&apos;ll be given a group soon</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-gray-500">
        The FOF team places supports in groups and hubs before the first class. Once you&apos;re placed, your group&apos;s people, chat and meetings show here.
      </p>
      {openHelp && (
        <button type="button" onClick={openHelp} className="mt-4 inline-flex min-h-[38px] items-center rounded-2xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-[#c2410c]">
          Need help?
        </button>
      )}
    </section>
  );
};

export default NoGroupCard;
