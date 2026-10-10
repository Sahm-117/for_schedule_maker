import React from 'react';
import AppOverflowMenu from '../AppOverflowMenu';
import { usePermissions } from '../../hooks/usePermissions';
import type { PrayerOverview, PrayerSlot } from '../../types';
import { clockLabel } from '../../utils/prayerText';
import { PRIMARY_BTN } from './ui';

// The live prayers (Telegram), one per live slot: each has its own link, wait and audience, set when you add or edit the slot.

const LivePrayerTab: React.FC<{ overview: PrayerOverview; onEdit: (slot: PrayerSlot) => void; onAdd: () => void }> = ({ overview, onEdit, onAdd }) => {
  const { can } = usePermissions();
  const canAdd = can('corporate_prayers', 'add');
  const canEdit = can('corporate_prayers', 'edit');
  const live = overview.slots.filter((slot) => slot.slotType === 'LIVE');
  const hubName = (id: string) => overview.hubs.find((hub) => hub.id === id)?.name ?? 'A hub';

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Live prayers on Telegram</h2>
        <p className="mt-1 text-[13px] leading-normal text-gray-500">At a live slot, the hubs you chose see a pop-up with that slot’s link. It cannot be closed until they tap Prayed. For a different link per hub, make a live slot for each hub at the same time.</p>
      </div>
      {live.length === 0 ? (
        <div className="rounded-2xl bg-gray-50/80 px-4 py-10 text-center">
          <p className="text-sm text-gray-500">No live prayers yet. Add a slot and choose the Live prayer type.</p>
          {canAdd && <button type="button" onClick={onAdd} className={`${PRIMARY_BTN} mt-3`}>Add a slot</button>}
        </div>
      ) : (
        <ul className="space-y-3">
          {live.map((slot) => (
            <li key={slot.id} className={`surface-card flex items-start justify-between gap-3 p-4 ${slot.active ? '' : 'opacity-60'}`}>
              <div className="min-w-0 space-y-1">
                <p className="text-lg font-extrabold tracking-tight text-gray-900">{clockLabel(slot.time)}<span className="ml-2 text-sm font-medium text-gray-500">{slot.name || ''}</span></p>
                <p className="text-[13px] text-gray-700"><span className="font-semibold">Goes to:</span> {slot.audienceAll ? 'Everyone' : slot.hubIds.map(hubName).join(', ')}</p>
                <p className="truncate text-[13px] text-gray-600">{slot.telegramLink}</p>
                <p className="text-xs text-gray-500">Prayed unlocks {slot.liveWaitMinutes === 0 ? 'at once' : `${slot.liveWaitMinutes} min after the link is tapped`}{slot.active ? '' : ' · Off'}</p>
                {slot.telegramLink && (
                  <a href={slot.telegramLink} target="_blank" rel="noopener noreferrer" className="inline-block text-[13px] font-semibold text-primary underline-offset-2 hover:underline">Open the link to test it</a>
                )}
              </div>
              {canEdit && <AppOverflowMenu align="right" items={[{ label: 'Edit', onClick: () => onEdit(slot) }]} />}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-gray-500">If someone cannot open Telegram, a way out appears for them ten minutes after they opened the pop-up.</p>
    </div>
  );
};

export default LivePrayerTab;
