export const parseTimeToMinutes = (raw: string): number | null => {
  if (!raw) return null;
  const s = raw.trim();

  // 24h: "HH:MM" or "H:MM"
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return h * 60 + m;
    }
  }

  // 12h: "H:MM AM" / "H:MMAM" / "HH:MM pm"
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (m12) {
    let h = Number(m12[1]);
    const m = Number(m12[2]);
    const ap = m12[3].toUpperCase();
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 1 || h > 12 || m < 0 || m > 59) {
      return null;
    }
    if (ap === 'AM') {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return h * 60 + m;
  }

  return null;
};

export const formatTimeForDisplay = (raw: string): string => {
  const minutes = parseTimeToMinutes(raw);
  if (minutes === null) return raw;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mm = String(m).padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
};

export const compareTimeStrings = (a: string, b: string): number => {
  const am = parseTimeToMinutes(a);
  const bm = parseTimeToMinutes(b);
  if (am === null && bm === null) return a.localeCompare(b);
  if (am === null) return 1;
  if (bm === null) return -1;
  return am - bm;
};

