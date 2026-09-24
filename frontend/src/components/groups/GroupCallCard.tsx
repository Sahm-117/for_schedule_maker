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

export interface MeetingSaveInput {
  meetingDay: string | null;
  meetingTime: string | null;
  meetingDurationMins: number | null;
  callPlatform: GroupCallPlatform;
  callLink: string | null;
}

export interface MeetingCallCardProps {
  slot: MeetingSlot;
  callPlatform: GroupCallPlatform | null;
  callLink: string | null;
  // Extra key to force the draft to reset when the underlying entity changes
  // (e.g. the group id), even if its slot values happen to be identical.
  resetKey?: string | null;
  // Shown until the entity has its own link (older groups used the support's WhatsApp group link).
  fallbackLink?: string | null;
  // False when there's nothing to attach a meeting to yet (e.g. support not linked
  // to a group) — shows configureHint instead of the editor. Defaults to true.
  canConfigure?: boolean;
  configureHint?: string;
  linkLabel?: string;
  saveLabel?: string;
  // Omit to render read-only (no edit/set-up affordance) — e.g. a hub member viewing
  // the lead's meeting.
  onSave?: (input: MeetingSaveInput) => Promise<void>;
}

// Recurring call + meeting slot editor/display, shared by a group's own call
// (GroupCallCard below) and a hub's recap meeting (SupportMyHubPage).
export const MeetingCallCard: React.FC<MeetingCallCardProps> = ({
  slot,
  callPlatform,
  callLink: savedCallLink,
  resetKey,
  fallbackLink,
  canConfigure = true,
  configureHint = 'Meeting details can be set once this is linked up.',
  linkLabel = 'Call Link',
  saveLabel = 'Save meeting',
  onSave,
}) => {
  const callLink = savedCallLink?.trim() || fallbackLink?.trim() || null;
  const hasSetup = !!callLink && !!slot.meetingDay && !!slot.meetingTime;
  const savedPlatform: GroupCallPlatform = callPlatform ?? platformFromLink(callLink) ?? 'WHATSAPP';

  const [editing, setEditing] = useState(false);
  const [platform, setPlatform] = useState<GroupCallPlatform>(savedPlatform);
  const [linkDraft, setLinkDraft] = useState(callLink ?? '');
  const [slotDraft, setSlotDraft] = useState<MeetingSlot>(slot);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSlotDraft(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, slot.meetingDay, slot.meetingTime, slot.meetingDurationMins]);

  const startEditing = () => {
    setLinkDraft(callLink ?? '');
    setPlatform(savedPlatform);
    setSlotDraft(slot);
    setError('');
    setEditing(true);
  };

  const save = async () => {
    if (!canConfigure || !onSave) {
      setError(configureHint);
      return;
    }
    if (!linkDraft.trim() || !slotDraft.meetingDay || !slotDraft.meetingTime) {
      setError('Add the call link and meeting time before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...slotDraft,
        callPlatform: platform,
        callLink: linkDraft.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the call schedule.');
    } finally {
      setSaving(false);
    }
  };

  const meetingTime = formatMeetingTime(slot.meetingDay, slot.meetingTime);
  const canEdit = !!onSave;

  return (
    <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      {editing && <h2 className="text-base font-bold text-gray-900">Meeting setup</h2>}

      {editing ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {canConfigure ? (
            <>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-gray-900">{linkLabel}</label>
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
                <InfoTip label="Meeting time rules">Meetings run on Wednesday, Friday or Saturday, between 5 and 9 pm, for 45 minutes to 1 hour.</InfoTip>
              </div>
              <GroupMeetingSlotEditor value={slotDraft} onChange={setSlotDraft} />
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">{configureHint}</p>
          )}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2.5">
            {hasSetup && (
              <button type="button" onClick={() => setEditing(false)} className="min-h-[46px] flex-none rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700">
                Cancel
              </button>
            )}
            <button type="button" onClick={() => { void save(); }} disabled={saving} className="min-h-[46px] min-w-0 flex-auto rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Saving…' : saveLabel}
            </button>
          </div>
        </div>
      ) : !hasSetup ? (
        canEdit ? (
          <button type="button" onClick={startEditing} className="min-h-11 text-sm font-semibold text-primary">Set up meeting</button>
        ) : (
          <p className="text-sm text-gray-400">Meeting time not set yet.</p>
        )
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-auto overflow-hidden">
            <p className="truncate text-sm font-bold text-gray-900">{meetingTime ?? 'Meeting time not set'}</p>
            {slot.meetingDurationMins && <p className="mt-0.5 text-xs text-gray-500">{slot.meetingDurationMins} min</p>}
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
            {canEdit && (
              <button
                type="button"
                onClick={startEditing}
                aria-label="Edit meeting"
                title="Edit meeting"
                className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 bg-white p-0 leading-none text-gray-600 hover:text-gray-900"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

interface GroupCallCardProps {
  group: Group | null;
  // Shown until the group has its own link (older groups used the support's WhatsApp group link).
  fallbackLink: string | null;
  onGroupUpdated: (group: Group) => void;
}

// Recurring group call and meeting slot, all stored on the group. Thin wrapper
// around MeetingCallCard that keeps its previous behaviour (and prop shape)
// exactly the same for SupportParticipantsPage.
const GroupCallCard: React.FC<GroupCallCardProps> = ({ group, fallbackLink, onGroupUpdated }) => {
  const slot: MeetingSlot = {
    meetingDay: group?.meetingDay ?? null,
    meetingTime: group?.meetingTime ?? null,
    meetingDurationMins: group?.meetingDurationMins ?? null,
  };

  const handleSave = async (input: MeetingSaveInput) => {
    if (!group) throw new Error('Your group is not set up yet. Ask an admin to assign you a group.');
    const { group: updated } = await groupsApi.update(group.id, input);
    onGroupUpdated(updated);
  };

  return (
    <MeetingCallCard
      slot={slot}
      callPlatform={group?.callPlatform ?? null}
      callLink={group?.callLink ?? null}
      resetKey={group?.id ?? null}
      fallbackLink={fallbackLink}
      canConfigure={!!group}
      configureHint="The meeting day and time can be set once your group is linked to you."
      linkLabel="Group Call Link"
      saveLabel="Save group meeting"
      onSave={handleSave}
    />
  );
};

export default GroupCallCard;
