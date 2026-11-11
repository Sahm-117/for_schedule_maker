import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import { MeetingCallCard, type MeetingSaveInput } from '../groups/GroupCallCard';
import type { GroupCallPlatform } from '../../types';

// Editor for a hub's weekly meeting (admins, the hub's lead, or an assistant lead they allow), or the Hub Leads meeting (admins). The
// people involved get a notification when the time or link actually changes
// (unless the switch is off).
const MeetingSetModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  slot: { meetingDay: string | null; meetingTime: string | null };
  callPlatform: GroupCallPlatform | null;
  callLink: string | null;
  resetKey: string;
  linkLabel: string;
  tellLabel: string;
  onSave: (input: MeetingSaveInput, notify: boolean) => Promise<void>;
  /** A hub's own meeting: HUB_MEETING_MINUTES, so its Join button stays open to the end. */
  openMinutes?: number;
}> = ({ isOpen, onClose, title, subtitle, slot, callPlatform, callLink, resetKey, linkLabel, tellLabel, onSave, openMinutes }) => {
  const [notify, setNotify] = useState(true);
  useEffect(() => { if (isOpen) setNotify(true); }, [isOpen, resetKey]);

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={notify}
          onClick={() => setNotify((v) => !v)}
          className="flex w-full items-center justify-between gap-4 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-left"
        >
          <span className="text-[14px] font-semibold text-gray-800">{tellLabel}</span>
          <span className={`relative h-[22px] w-[38px] flex-none rounded-full transition ${notify ? 'bg-primary' : 'bg-gray-300'}`}>
            <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${notify ? 'left-[19px]' : 'left-[3px]'}`} />
          </span>
        </button>
        <MeetingCallCard
          slot={slot}
          callPlatform={callPlatform}
          callLink={callLink}
          resetKey={resetKey}
          linkLabel={linkLabel}
          saveLabel="Save meeting"
          anySlot
          openMinutes={openMinutes}
          onSave={async (input) => { await onSave(input, notify); onClose(); }}
        />
      </div>
    </ModalShell>
  );
};

export default MeetingSetModal;
