import React, { useEffect, useState } from 'react';
import { startPolling } from '../../hooks/usePolling';
import Spinner from '../Spinner';
import ModalShell from '../followups/ModalShell';
import SegmentedTabs from '../SegmentedTabs';
import { practiceApi } from '../../services/api';
import { useToast } from '../Toast';
import type { PracticeSeatKey, PracticeTeamMember } from '../../types';

const SEATS: Array<{ key: PracticeSeatKey; label: string }> = [
  { key: 'SUPPORT', label: 'Support' },
  { key: 'HUB_LEAD', label: 'Hub Lead' },
  { key: 'ASSISTANT', label: 'Assistant' },
  { key: 'RECAP_LEAD', label: 'Recap' },
  { key: 'PRAYER_LEAD', label: 'Prayer' },
  { key: 'PARTICIPANT', label: 'Participant' },
];

const LABEL = 'mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-gray-500';

const PeerWalkthroughSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  mySeat: PracticeSeatKey;
  onSent: () => void;
}> = ({ isOpen, onClose, mySeat, onSent }) => {
  const toast = useToast();
  const [team, setTeam] = useState<PracticeTeamMember[]>([]);
  const [mine, setMine] = useState<PracticeSeatKey>(mySeat);
  const [theirs, setTheirs] = useState<PracticeSeatKey>('PARTICIPANT');
  const [pick, setPick] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setMine(mySeat);
    setPick('');
    setQuery('');
    let live = true;
    const load = () => practiceApi.team().then((rows) => { if (live) setTeam(rows); }).catch(() => {});
    void load();
    const stopPolling = startPolling(load, 5000);
    return () => { live = false; stopPolling(); };
  }, [isOpen, mySeat]);

  const bothParticipants = mine === 'PARTICIPANT' && theirs === 'PARTICIPANT';
  const send = async () => {
    if (!pick || bothParticipants) return;
    setBusy(true);
    try {
      await practiceApi.peerRequest(pick, mine, theirs);
      toast({ message: 'Request sent.' });
      onSent();
      onClose();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Could not send the request.' });
    } finally { setBusy(false); }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Peer walkthrough" subtitle="You and one other person, in opposite seats.">
      <p className={LABEL.replace('mt-4', 'mt-0')}>I’ll be</p>
      <SegmentedTabs tabs={SEATS} active={mine} onChange={(k) => setMine(k as PracticeSeatKey)} wrap />
      <p className={LABEL}>They’ll be</p>
      <SegmentedTabs tabs={SEATS} active={theirs} onChange={(k) => setTheirs(k as PracticeSeatKey)} wrap />
      {bothParticipants && <p className="mt-2 text-[12px] text-rose-600">Only one of you can be the participant.</p>}
      <p className={LABEL}>Pick a person</p>
      {team.length > 6 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="mb-1 h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
        />
      )}
      {team.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No one else is on the Practice team yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {team.filter((member) => member.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40).map((member) => (
            <li key={member.userId}>
              <button type="button" onClick={() => setPick(member.userId)} className="flex w-full items-center gap-3 py-2.5 text-left" aria-pressed={pick === member.userId}>
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                  {member.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-gray-900">{member.name}</span>
                <span className={`text-[11.5px] font-semibold ${member.busy ? 'text-amber-600' : member.online ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {member.busy ? 'In a walkthrough' : member.online ? 'Online' : 'Away'}
                </span>
                <span className={`h-5 w-5 flex-none rounded-full border-2 ${pick === member.userId ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_white]' : 'border-gray-300'}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={!pick || bothParticipants || busy}
        onClick={() => void send()}
        className="mt-4 flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {busy && <Spinner className="mr-2 h-4 w-4" />}{busy ? 'Sending…' : 'Send request'}
      </button>
    </ModalShell>
  );
};

export default PeerWalkthroughSheet;
