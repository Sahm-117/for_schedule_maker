import { useEffect, useRef, useState } from 'react';
import HomeSheet from './participantApp/HomeSheet';
import { BIRTHDAY_QUOTES, GRAPHIC_H, GRAPHIC_W, downloadFromUrl, drawBirthdayGraphic, fileName, hashOf } from '../utils/birthdayGraphic';
import type { BirthdayPerson } from '../types';

// Every birthday graphic for the people given (this week's), made one after another with the same
// drawing code and the same quote choice as the single-graphic sheet. Each can be downloaded on its own,
// or all in a row.

interface Made { person: BirthdayPerson; url: string | null; photoUsed: boolean }

const BirthdayGraphicsBatchSheet: React.FC<{ people: BirthdayPerson[]; roleLabel: string; onClose: () => void }> = ({ people, roleLabel, onClose }) => {
  const [made, setMade] = useState<Made[]>([]);
  const [working, setWorking] = useState(true);
  const urlsRef = useRef<string[]>([]);
  // False once the sheet is closed (or the people change), so a running Download all stops.
  const aliveRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    aliveRef.current = true;
    const canvas = document.createElement('canvas');
    (async () => {
      for (const person of people) {
        if (cancelled) return;
        let entry: Made = { person, url: null, photoUsed: true };
        try {
          const r = await drawBirthdayGraphic(canvas, { name: person.name, photoUrl: person.avatarUrl, month: person.month, day: person.day, roleLabel, quote: BIRTHDAY_QUOTES[hashOf(person.id) % BIRTHDAY_QUOTES.length] }, () => cancelled);
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (blob) {
            const url = URL.createObjectURL(blob);
            // Closed while the picture was being made: the cleanup has already run, so free this one straight away.
            if (cancelled) { URL.revokeObjectURL(url); return; }
            urlsRef.current.push(url);
            entry = { person, url, photoUsed: r.photoUsed };
          }
        } catch { /* shown as "Could not make this one" below */ }
        if (cancelled) return;
        setMade((prev) => [...prev, entry]);
      }
      if (!cancelled) setWorking(false);
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, [people, roleLabel]);

  const ready = made.filter((m) => m.url);
  // Browsers may ask before allowing several downloads at once; a short gap between them helps, and each card still has its own button.
  const downloadAll = async () => {
    for (const m of ready) {
      if (!aliveRef.current) return;
      if (m.url) downloadFromUrl(m.url, fileName(m.person.name));
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  return (
    <HomeSheet label="This week's birthday graphics" onClose={onClose}>
      <p className="mb-1 pr-10 text-[15px] font-semibold text-gray-900">This week&apos;s birthday graphics</p>
      <p className="mb-3 text-[12.5px] text-gray-500">{working ? `Making ${made.length + 1} of ${people.length}...` : `${ready.length} of ${people.length} ready.`}</p>
      <button type="button" disabled={working || ready.length === 0} onClick={() => { void downloadAll(); }} className="mb-3 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Download all</button>
      <ul className="grid grid-cols-2 gap-3">
        {made.map((m) => (
          <li key={m.person.id} className="flex flex-col gap-1.5">
            {m.url ? (
              <img src={m.url} alt={`Birthday graphic for ${m.person.name}`} className="w-full rounded-xl bg-[#fff1e6] object-cover" style={{ aspectRatio: `${GRAPHIC_W} / ${GRAPHIC_H}` }} />
            ) : (
              <p className="grid place-items-center rounded-xl bg-red-50 px-2 text-center text-[12.5px] text-red-600" style={{ aspectRatio: `${GRAPHIC_W} / ${GRAPHIC_H}` }}>Could not make this one</p>
            )}
            <p className="truncate text-[12.5px] font-semibold text-gray-800">{m.person.name}</p>
            {m.url && !m.photoUsed && <p className="text-[12px] text-gray-500">{m.person.avatarUrl ? 'Their photo would not load, so initials are shown.' : 'They have no photo yet, so initials are shown.'}</p>}
            {m.url && <button type="button" onClick={() => downloadFromUrl(m.url as string, fileName(m.person.name))} className="rounded-full bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">Download</button>}
          </li>
        ))}
      </ul>
    </HomeSheet>
  );
};

export default BirthdayGraphicsBatchSheet;
