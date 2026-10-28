import React from 'react';
import { NavLink } from 'react-router-dom';
import ModalShell from '../followups/ModalShell';
import { PERSON_HEALTH_LABEL, type PersonHealth, type ProgrammeRules } from '../../utils/programmeRules';
import type { MissDetail } from '../../utils/participantHealthReason';

interface Props {
  name: string;
  health: PersonHealth;
  detail: MissDetail | null;
  rules: ProgrammeRules;
  /** The support who leads their group, when they have one. */
  supportName: string | null;
  /** In a group (the group may still have no support). */
  hasGroup: boolean;
  isTeen: boolean;
  profileTo: string;
  onClose: () => void;
}

const weekList = (weeks: number[]) => weeks.map((w) => `Week ${w}`).join(', ');
const times = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why someone shows as Keep an eye on or Needs attention, and what to do about it. Opens from the chip on the Participants list. */
const HealthReasonModal: React.FC<Props> = ({ name, health, detail, rules, supportName, hasGroup, isTeen, profileTo, onClose }) => {
  const sundayMisses = detail?.sunday.length ?? 0;
  const meetingMisses = detail?.meeting.length ?? 0;
  const critical = health === 'critical';
  const ruleParts = [
    rules.participantRedSundayMisses > 0 ? `${rules.participantRedSundayMisses}+ missed Sunday classes` : '',
    rules.participantRedMeetingMisses > 0 ? `${rules.participantRedMeetingMisses}+ missed group meetings` : '',
  ].filter(Boolean);
  const ruleText = ruleParts.join(' and ');

  const noSupport = hasGroup ? 'Their group has no support yet. Assign one so someone can follow up.' : 'They are not in a group yet. Place them in a group so someone can follow up.';
  const steps: string[] = [];
  if (critical) {
    steps.push(supportName ? `Ask ${supportName}, their group support, to reach ${isTeen ? 'their parent or guardian' : 'them'} today and find out what is stopping them.` : noSupport);
    steps.push('Record what you learn on their profile, and raise a concern if they need more than a call.');
    steps.push('If they can still join the next class or meeting, tell them the day and time.');
  } else {
    steps.push(supportName ? `Let ${supportName}, their group support, know so they can check in this week.` : noSupport);
    steps.push(`A short message or call is enough${isTeen ? ' (through their parent or guardian)' : ''}: ask if they are well and what would help them come next time.`);
    steps.push('If they miss another, they may move to Needs attention.');
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={name}
      subtitle={PERSON_HEALTH_LABEL[health]}
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700">Close</button>
          <NavLink to={profileTo} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Open profile</NavLink>
        </>
      )}
    >
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Why</h3>
        {detail && (sundayMisses > 0 || meetingMisses > 0) ? (
          <ul className="mt-2 space-y-2 text-sm text-gray-800">
            {sundayMisses > 0 && (
              <li>
                <span className="font-semibold">Missed {times(sundayMisses, 'Sunday class', 'Sunday classes')}:</span>{' '}
                {detail.sunday.map((m) => `Week ${m.weekNumber} (${m.how})`).join(', ')}
              </li>
            )}
            {meetingMisses > 0 && (
              <li>
                <span className="font-semibold">Missed {times(meetingMisses, 'group meeting', 'group meetings')}:</span>{' '}
                {weekList(detail.meeting)}
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-700">No missed class or meeting is recorded for them right now. The status may be from marks that have since been corrected; it will update on the next refresh.</p>
        )}
        {detail && detail.unmarked.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">No class mark yet for {weekList(detail.unmarked)}. Those do not count against them.</p>
        )}
        <p className="mt-3 rounded-2xl bg-gray-50 px-3.5 py-3 text-xs text-gray-600">
          How it is decided: one missed class or meeting is Keep an eye on. Needs attention starts at {ruleText}. Excused meetings and excused late arrivals do not count.
        </p>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next steps</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-gray-800">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>
    </ModalShell>
  );
};

export default HealthReasonModal;
