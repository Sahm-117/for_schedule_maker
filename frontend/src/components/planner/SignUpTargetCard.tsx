import React, { useEffect, useState } from 'react';
import { followUpContactsApi, participantPushApi, participantsApi } from '../../services/api';
import { contactInCohortScope } from '../../utils/followUps';
import { computeRegistrationOverview } from '../../utils/registrationOverview';
import { MobilisationTarget } from '../followups/FollowUpDashboard';

/**
 * The sign-up target for one cohort, with how many have registered so far: the Follow-ups card, now shown on the Planner for
 * the next cohort. The registered total is counted the same way as on Follow-ups (from people, not follow-up statuses);
 * until it is known the card shows no progress rather than 0.
 */
const SignUpTargetCard: React.FC<{ cohortId: string; cohortName: string }> = ({ cohortId, cohortName }) => {
  const [registered, setRegistered] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRegistered(null);
    Promise.all([
      participantsApi.getAll({ cohortId }),
      participantPushApi.getSignedInIds(cohortId),
      followUpContactsApi.getAll(),
    ])
      .then(([people, signedIn, contacts]) => {
        if (cancelled) return;
        const scoped = contacts.contacts.filter((c) => !c.isTest && contactInCohortScope(c, cohortId));
        setRegistered(computeRegistrationOverview(people.participants, scoped, new Set(signedIn), cohortId).total.registered);
      })
      .catch(() => { if (!cancelled) setRegistered(null); });
    return () => { cancelled = true; };
  }, [cohortId]);

  return <MobilisationTarget cohortId={cohortId} cohortName={cohortName} signedUp={registered} />;
};

export default SignUpTargetCard;
