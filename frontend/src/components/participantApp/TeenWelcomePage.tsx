import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { participantAppApi } from '../../services/api';
import type { ParticipantTeenInfo } from '../../types';
import { buildWhatsAppLink } from '../../utils/phone';
import { firstNameOf } from '../../utils/people';

// Teens (18 and below, while teen handling is on) are looked after by a Teen Support on WhatsApp,
// so this page replaces the participant app for them every time they sign in. Log out is the only
// other control. The Teen Support fills in once one is assigned.

type Gate = { status: 'loading' } | { status: 'app' } | { status: 'teen'; info: ParticipantTeenInfo };

const REFRESH_MS = 60_000;

/** Asks once whether this participant is a teen, then keeps the Teen Support fresh while they stay on the page. */
export const useTeenGate = (): Gate => {
  const [gate, setGate] = useState<Gate>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      participantAppApi.getTeenInfo()
        .then((info) => { if (!cancelled) setGate(info.isTeen ? { status: 'teen', info } : { status: 'app' }); })
        // If the check fails, the normal app opens rather than leaving them stuck on a blank screen.
        .catch(() => { if (!cancelled) setGate((current) => (current.status === 'loading' ? { status: 'app' } : current)); });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  return gate;
};

const STEPS = [
  { title: 'They reach out.', body: 'Your Teen Support messages you or your parent or guardian.' },
  { title: 'You join your teen group', body: 'on WhatsApp, with the other teens they look after.' },
  { title: 'Sunday classes continue.', body: 'Your Teen Support marks your attendance.' },
];

const TeenWelcomePage: React.FC<{ info: ParticipantTeenInfo }> = ({ info }) => {
  const { user, logout } = useAuth();
  const first = firstNameOf(user?.name ?? '') || 'there';
  const support = info.supportName?.trim() || '';
  const whatsapp = buildWhatsAppLink(info.supportPhone, `Hello ${support.split(' ')[0] || ''}, this is ${first} from FOF.`.replace('Hello ,', 'Hello,'));
  const words = support.split(/\s+/).filter(Boolean);
  const initials = [words[0], words.length > 1 ? words[words.length - 1] : ''].map((w) => w?.[0]?.toUpperCase() ?? '').join('');

  return (
    <div className="min-h-screen bg-[#faf7f3] px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo-crest.webp" alt="" className="h-8 w-8 object-contain" />
            <span className="text-sm font-bold text-gray-900">FOF Ikorodu</span>
          </div>
          <button type="button" onClick={logout} className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50 active:scale-95">Log out</button>
        </div>

        <div className="surface-card p-6">
          <h1 className="text-balance text-[22px] font-bold tracking-tight text-gray-900">Hi {first}, your FOF is moving to WhatsApp</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
            Thank you for joining FOF at The Covenant Nation Ikorodu. For teens (18 and below), <b className="font-semibold text-gray-900">a Teen Support looks after you personally on WhatsApp</b>. You do not need this app any more.
          </p>

          <div className="mt-5 rounded-[20px] bg-orange-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Your Teen Support</p>
            {support ? (
              <>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary text-sm font-bold text-white">{initials}</div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-gray-900">{support}</p>
                    <p className="text-[13px] text-gray-500">Looks after you and your group</p>
                  </div>
                </div>
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-3.5 block rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]">Message on WhatsApp</a>
                )}
              </>
            ) : (
              <p className="mt-2.5 flex items-start gap-2.5 text-sm text-gray-600">
                <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-primary" aria-hidden="true" />
                We are matching you with a Teen Support. They will message you or your parent or guardian soon.
              </p>
            )}
          </div>

          <h2 className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-wider text-gray-500">What happens next</h2>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{i + 1}</span>
                <p className="min-w-0 text-[15px] leading-snug text-gray-600"><b className="font-semibold text-gray-900">{step.title}</b> {step.body}</p>
              </li>
            ))}
          </ol>

          <p className="mt-5 rounded-2xl bg-gray-50 px-3.5 py-3 text-[13px] text-gray-500">
            {support ? 'Questions? Ask your Teen Support on WhatsApp. They will help you.' : 'Questions? Ask your parent or guardian to contact the FOF team.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeenWelcomePage;
