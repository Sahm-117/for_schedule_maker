import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModalShell from './followups/ModalShell';
import Avatar from './Avatar';
import { useAuth } from '../hooks/useAuth';
import { usersApi, groupsApi } from '../services/api';
import type { Group, Participant, User } from '../types';

interface HubAuthorProfileModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const formatLastActive = (iso?: string | null) => {
  if (!iso) return 'Never';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
};

const HubAuthorProfileModal: React.FC<HubAuthorProfileModalProps> = ({ userId, isOpen, onClose }) => {
  const { isAdmin, isSopPreparer } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    setLoading(true);
    setProfileUser(null);
    setGroup(null);
    setParticipants([]);
    setLightboxOpen(false);

    (async () => {
      try {
        const { user } = await usersApi.getById(userId);
        if (cancelled) return;
        setProfileUser(user);

        if (user.role === 'SUPPORT') {
          const { group: assignedGroup } = await groupsApi.getForSupport(userId);
          if (cancelled) return;
          setGroup(assignedGroup);

          if (assignedGroup) {
            const { participants: groupParticipants } = await groupsApi.getParticipants(assignedGroup.id);
            if (cancelled) return;
            setParticipants(groupParticipants);
          }
        }
      } catch (error) {
        console.error('Failed to load Hub author profile:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, userId]);

  const canViewFullProfile = isAdmin || isSopPreparer;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Profile">
      {loading || !profileUser ? (
        <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="flex-shrink-0 focus:outline-none"
              title="View photo"
            >
              <Avatar name={profileUser.name} avatarUrl={profileUser.avatarUrl} size="lg" />
            </button>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-gray-900">{profileUser.name}</h3>
              <span className="mt-1 inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
                {profileUser.role}
              </span>
            </div>
          </div>

          <div className="surface-muted flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500">Last active in Hub</span>
            <span className="text-sm font-semibold text-gray-900">{formatLastActive(profileUser.hubLastSeenAt)}</span>
          </div>

          {profileUser.role === 'SUPPORT' && (
            <div className="space-y-3">
              <div className="surface-muted flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Group</span>
                <span className="text-sm font-semibold text-gray-900">{group?.name ?? 'Not assigned'}</span>
              </div>

              {group && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Participants ({participants.length})
                  </p>
                  {participants.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-orange-200 py-6 text-center text-sm text-gray-500">
                      No participants in this group yet.
                    </div>
                  ) : (
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {participants.map((participant) => (
                        <div key={participant.id} className="surface-muted px-3 py-2 text-sm text-gray-700">
                          {participant.fullName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {canViewFullProfile && (
            <button
              type="button"
              onClick={() => { onClose(); navigate('/users'); }}
              className="w-full rounded-2xl border border-orange-200 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-orange-50"
            >
              View full profile
            </button>
          )}
        </div>
      )}

      {lightboxOpen && profileUser && (
        <button
          type="button"
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
          aria-label="Close photo"
        >
          {profileUser.avatarUrl ? (
            <img src={profileUser.avatarUrl} alt={profileUser.name} className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl" />
          ) : (
            <div className="grid h-56 w-56 place-items-center rounded-full bg-white text-4xl font-bold text-primary">
              {profileUser.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </button>
      )}
    </ModalShell>
  );
};

export default HubAuthorProfileModal;
