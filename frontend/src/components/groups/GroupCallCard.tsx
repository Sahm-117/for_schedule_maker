import React, { useEffect, useState } from 'react';
import GroupMeetingSlotEditor, { type MeetingSlot } from '../GroupMeetingSlotEditor';
import InfoTip from '../InfoTip';
import { groupsApi } from '../../services/api';
import type { Group, GroupCallPlatform } from '../../types';

const platformFromLink = (link: string | null | undefined): GroupCallPlatform | null => {
  if (!link?.trim()) return null;
  return /meet\.google\.com/i.test(link) ? 'GOOGLE_MEET' : 'WHATSAPP';
};

// "FRIDAY" + "19:00" + 60 → "Friday, 7:00 PM · 60 minutes"
export const formatMeetingSlot = (day?: string | null, time?: string | null, durationMins?: number | null): string | null => {
  if (!day || !time) return null;
  const [h, m] = time.split(':').map(Number);
  const dayLabel = day.charAt(0) + day.slice(1).toLowerCase();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const base = `${dayLabel}, ${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
  return durationMins ? `${base} · ${durationMins} minutes` : base;
};

const formatMeetingTime = (day?: string | null, time?: string | null): string | null => {
  if (!day || !time) return null;
  const [h, m] = time.split(':').map(Number);
  const dayLabel = day.charAt(0) + day.slice(1).toLowerCase();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dayLabel} · ${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
};

interface GroupCallCardProps {
  group: Group | null;
  // Shown until the group has its own link (older groups used the support's WhatsApp group link).
  fallbackLink: string | null;
  onGroupUpdated: (group: Group) => void;
}

// Recurring group call and meeting slot, all stored on the group.
const GroupCallCard: React.FC<GroupCallCardProps> = ({ group, fallbackLink, onGroupUpdated }) => {
  const callLink = group?.callLink?.trim() || fallbackLink?.trim() || null;
  const savedSlot: MeetingSlot = {
    meetingDay: group?.meetingDay ?? null,
    meetingTime: group?.meetingTime ?? null,
    meetingDurationMins: group?.meetingDurationMins ?? null,
  };
  const hasSetup = !!callLink && !!savedSlot.meetingDay && !!savedSlot.meetingTime;
  const savedPlatform: GroupCallPlatform = group?.callPlatform ?? platformFromLink(callLink) ?? 'WHATSAPP';

  const [editing, setEditing] = useState(false);
  const [platform, setPlatform] = useState<GroupCallPlatform>(savedPlatform);
  const [linkDraft, setLinkDraft] = useState(callLink ?? '');
  const [slotDraft, setSlotDraft] = useState<MeetingSlot>(savedSlot);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSlotDraft({
      meetingDay: group?.meetingDay ?? null,
      meetingTime: group?.meetingTime ?? null,
      meetingDurationMins: group?.meetingDurationMins ?? null,
    });
  }, [group?.id, group?.meetingDay, group?.meetingTime, group?.meetingDurationMins]);

  const startEditing = () => {
    setLinkDraft(callLink ?? '');
    setPlatform(savedPlatform);
    setSlotDraft(savedSlot);
    setError('');
    setEditing(true);
  };

  const save = async () => {
    if (!group) {
      setError('Your group is not set up yet. Ask an admin to assign you a group.');
      return;
    }
    if (!linkDraft.trim() || !slotDraft.meetingDay || !slotDraft.meetingTime) {
      setError('Add the group call link and meeting time before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { group: updated } = await groupsApi.update(group.id, {
        ...slotDraft,
        callPlatform: platform,
        callLink: linkDraft.trim() || null,
      });
      onGroupUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the call schedule.');
    } finally {
      setSaving(false);
    }
  };

  const meetingTime = formatMeetingTime(savedSlot.meetingDay, savedSlot.meetingTime);

  return (
    <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      {editing && <h2 className="text-base font-bold text-gray-900">Meeting setup</h2>}

      {editing ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {group ? (
            <>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-gray-900">Group Call Link</label>
                <input
                  type="url"
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  placeholder="Paste the call link"
                  className="min-h-[46px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-gray-900">Day and time</span>
                <InfoTip label="Meeting time rules">Group meetings run on Wednesday, Friday or Saturday, between 5 and 9 pm, for 45 minutes to 1 hour.</InfoTip>
              </div>
              <GroupMeetingSlotEditor value={slotDraft} onChange={setSlotDraft} />
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">The meeting day and time can be set once your group is linked to you.</p>
          )}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2.5">
            {hasSetup && (
              <button type="button" onClick={() => setEditing(false)} className="min-h-[46px] flex-none rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700">
                Cancel
              </button>
            )}
            <button type="button" onClick={() => { void save(); }} disabled={saving} className="min-h-[46px] min-w-0 flex-auto rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Saving…' : 'Save group meeting'}
            </button>
          </div>
        </div>
      ) : !hasSetup ? <button type="button" onClick={startEditing} className="min-h-11 text-sm font-semibold text-primary">Set up meeting</button> : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-auto overflow-hidden">
            <p className="truncate text-sm font-bold text-gray-900">{meetingTime ?? 'Meeting time not set'}</p>
            {savedSlot.meetingDurationMins && <p className="mt-0.5 text-xs text-gray-500">{savedSlot.meetingDurationMins} min</p>}
          </div>
          <div className="flex flex-none items-center gap-2">
            <a
              href={callLink ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 min-h-11 shrink-0 items-center justify-center rounded-[10px] bg-primary px-3.5 py-0 text-sm font-semibold leading-none text-white"
            >
              Join Call
            </a>
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit group meeting"
              title="Edit group meeting"
              className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 bg-white p-0 leading-none text-gray-600 hover:text-gray-900"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default GroupCallCard;
