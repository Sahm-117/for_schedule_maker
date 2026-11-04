import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { markPrayerGuideSeen } from '../../utils/prayerText';

// The first time a daily prayer opens on this phone: three short steps, then "Start praying" (which starts their timer).

const STEPS = [
  { title: 'It opens by itself', body: 'When it is time to pray for someone, this screen opens on its own. You don’t need to join anything.' },
  { title: 'It isn’t a call', body: 'Nobody can hear you. Pray quietly, out loud or in your heart, wherever you are, using the prayer and their faith project.' },
  { title: 'Pray for 15 minutes if you can', body: 'Your timer starts when you begin. Amen opens after 3 minutes, so you can finish when you need to, but stay for 15 if you can.' },
];

const PrayerGuide: React.FC<{ goalMinutes: number; amenAfterMinutes: number; onStart: () => void }> = ({ goalMinutes, amenAfterMinutes, onStart }) => {
  const [step, setStep] = useState(0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { titleRef.current?.focus(); }, [step]);
  const steps = STEPS.map((entry, index) => (index === 2
    ? { title: `Pray for ${goalMinutes} minutes if you can`, body: `Your timer starts when you begin. Amen opens after ${amenAfterMinutes} minutes, so you can finish when you need to, but stay for ${goalMinutes} if you can. You can also leave a short word for them on the Wall.` }
    : entry));
  const last = step === steps.length - 1;
  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/55 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="prayer-guide-title">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#c2410c]">Step {step + 1} of {steps.length}</p>
        <h2 id="prayer-guide-title" ref={titleRef} tabIndex={-1} className="mt-1.5 text-[22px] font-extrabold leading-tight text-gray-900 outline-none">{steps[step].title}</h2>
        <p className="mt-2 text-[15.5px] leading-relaxed text-gray-700">{steps[step].body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, index) => <span key={index} className={`h-2 rounded-full ${index === step ? 'w-5 bg-[#0b1020]' : 'w-2 bg-gray-300'}`} />)}
          </div>
          <button
            type="button"
            onClick={() => { if (last) { markPrayerGuideSeen(); onStart(); } else setStep(step + 1); }}
            className="flex h-12 min-w-[150px] items-center justify-center rounded-full bg-[#0b1020] px-6 text-[15px] font-bold text-white active:scale-[0.98]"
          >
            {last ? 'Start praying' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PrayerGuide;
