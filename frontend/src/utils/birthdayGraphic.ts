// The birthday graphic: a fixed template drawn on a canvas. It takes a name, a photo (optional) and a quote,
// nothing else. 1080 x 1350 (4:5) so it sits well on WhatsApp status, Instagram and a group chat.

export const BIRTHDAY_QUOTES: Array<{ text: string; ref: string }> = [
  { text: 'The Lord bless you and keep you.', ref: 'Numbers 6:24' },
  { text: 'This is the day the Lord has made; let us rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: 'The Lord your God is with you; He will rejoice over you with gladness.', ref: 'Zephaniah 3:17' },
  { text: 'His mercies are new every morning; great is Your faithfulness.', ref: 'Lamentations 3:23' },
  { text: 'May He give you the desire of your heart and make all your plans succeed.', ref: 'Psalm 20:4' },
  { text: 'I will bless you, and you will be a blessing.', ref: 'Genesis 12:2' },
];

export const GRAPHIC_W = 1080;
export const GRAPHIC_H = 1350;

const ORANGE = '#FF914D';
const ORANGE_DEEP = '#E5822D';
const BURNT = '#C2410C';
const PEACH = '#FFC9A3';
const CREAM = '#FFF1E6';
const GOLD = '#FFD27A';
const INK = '#1D1D1F';

const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

// A small seeded random so the same person always gets the same arrangement of confetti.
const seeded = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

const loadImage = (src: string, cors: boolean): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

const star = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.14, -r * 0.14, r, 0);
  ctx.quadraticCurveTo(r * 0.14, r * 0.14, 0, r);
  ctx.quadraticCurveTo(-r * 0.14, r * 0.14, -r, 0);
  ctx.quadraticCurveTo(-r * 0.14, -r * 0.14, 0, -r);
  ctx.fill();
  ctx.restore();
};

const balloon = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, color: string, lean: number) => {
  const ry = rx * 1.22;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  // string
  ctx.strokeStyle = 'rgba(120, 70, 30, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, ry);
  ctx.bezierCurveTo(-18, ry + 50, 22, ry + 100, -6, ry + 170);
  ctx.stroke();
  // body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // knot
  ctx.beginPath();
  ctx.moveTo(0, ry - 2);
  ctx.lineTo(-10, ry + 14);
  ctx.lineTo(10, ry + 14);
  ctx.closePath();
  ctx.fill();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.38, -ry * 0.4, rx * 0.16, ry * 0.26, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const partyHat = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const w = size * 0.78;
  const h = size;
  ctx.shadowColor = 'rgba(120, 60, 10, 0.22)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(-w / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // stripes
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 3; i += 1) {
    const yy = -h * (0.22 + i * 0.26);
    ctx.beginPath();
    ctx.moveTo(-w, yy);
    ctx.lineTo(w, yy - h * 0.1);
    ctx.lineTo(w, yy - h * 0.1 + h * 0.07);
    ctx.lineTo(-w, yy + h * 0.07);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // brim and pom-pom
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2 + 6, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(0, -h - 6, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** Wraps text into lines no wider than maxWidth with the current font. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
};

export interface BirthdayGraphicInput {
  name: string;
  photoUrl?: string | null;
  quote: { text: string; ref: string };
}

/** Draws the graphic onto `canvas`. Returns whether the photo was used (false when none was set or it would not load). */
export const drawBirthdayGraphic = async (canvas: HTMLCanvasElement, input: BirthdayGraphicInput): Promise<{ photoUsed: boolean }> => {
  canvas.width = GRAPHIC_W;
  canvas.height = GRAPHIC_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the graphic.');
  const [photo, crest] = await Promise.all([
    input.photoUrl ? loadImage(input.photoUrl, true) : Promise.resolve(null),
    loadImage('/logo-crest.webp', false),
  ]);
  const rand = seeded(input.name);
  const cx = GRAPHIC_W / 2;
  const photoY = 585;
  const photoR = 255;

  // Background: warm paper with a soft glow behind the photo.
  const bg = ctx.createLinearGradient(0, 0, 0, GRAPHIC_H);
  bg.addColorStop(0, '#FFF8F1');
  bg.addColorStop(0.55, '#FFE9D6');
  bg.addColorStop(1, '#FFD8BA');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, GRAPHIC_W, GRAPHIC_H);
  const glow = ctx.createRadialGradient(cx, photoY, photoR * 0.5, cx, photoY, photoR * 2.3);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, GRAPHIC_W, GRAPHIC_H);
  // Big soft blobs in the corners.
  ctx.fillStyle = 'rgba(255, 145, 77, 0.16)';
  ctx.beginPath(); ctx.arc(-60, 1240, 330, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(1130, 1330, 280, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 210, 122, 0.22)';
  ctx.beginPath(); ctx.arc(1150, 120, 260, 0, Math.PI * 2); ctx.fill();

  // Balloons either side of the photo.
  balloon(ctx, 150, 360, 70, ORANGE, -0.12);
  balloon(ctx, 255, 250, 58, PEACH, 0.1);
  balloon(ctx, 95, 560, 52, GOLD, -0.2);
  balloon(ctx, 930, 330, 72, PEACH, 0.12);
  balloon(ctx, 835, 235, 56, ORANGE_DEEP, -0.1);
  balloon(ctx, 990, 560, 52, ORANGE, 0.2);

  // Confetti, kept clear of the photo ring and the lower text.
  const palette = [ORANGE, PEACH, GOLD, ORANGE_DEEP, '#FFFFFF'];
  for (let i = 0; i < 70; i += 1) {
    const x = rand() * GRAPHIC_W;
    const y = rand() * 880 + 40;
    const d = Math.hypot(x - cx, y - photoY);
    if (d < photoR + 60) continue;
    const color = palette[Math.floor(rand() * palette.length)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    const kind = rand();
    if (kind < 0.4) { ctx.fillRect(-7, -3, 14, 6); } else if (kind < 0.75) { ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); } else { ctx.restore(); star(ctx, x, y, 12 + rand() * 8, color); continue; }
    ctx.restore();
  }
  star(ctx, cx - 330, photoY - 250, 26, '#FFFFFF');
  star(ctx, cx + 335, photoY + 215, 30, GOLD);
  star(ctx, cx - 315, photoY + 230, 20, ORANGE);

  // Header: crest and the programme line.
  if (crest) ctx.drawImage(crest, cx - 36, 62, 72, 72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = BURNT;
  ctx.font = `700 22px ${SANS}`;
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '5px';
  ctx.fillText('FOUNDATION OF FAITH', cx, 170);
  ctx.fillStyle = '#A85A2A';
  ctx.font = `600 18px ${SANS}`;
  ctx.fillText('THE COVENANT NATION · IKORODU', cx, 200);
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';

  // Photo: white ring, soft shadow, then the picture (or initials).
  ctx.save();
  ctx.shadowColor = 'rgba(150, 70, 10, 0.3)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(cx, photoY, photoR + 20, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, photoY, photoR, 0, Math.PI * 2); ctx.clip();
  if (photo) {
    const s = Math.max((photoR * 2) / photo.width, (photoR * 2) / photo.height);
    const w = photo.width * s;
    const h = photo.height * s;
    ctx.drawImage(photo, cx - w / 2, photoY - h / 2 - h * 0.04, w, h);
  } else {
    const g = ctx.createLinearGradient(cx - photoR, photoY - photoR, cx + photoR, photoY + photoR);
    g.addColorStop(0, '#FFB27D');
    g.addColorStop(1, ORANGE_DEEP);
    ctx.fillStyle = g;
    ctx.fillRect(cx - photoR, photoY - photoR, photoR * 2, photoR * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 190px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(input.name), cx, photoY + 6);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  // Dotted ring just outside the white border.
  ctx.fillStyle = ORANGE;
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (photoR + 44), photoY + Math.sin(a) * (photoR + 44), i % 2 ? 4 : 6, 0, Math.PI * 2);
    ctx.fill();
  }
  partyHat(ctx, cx + 165, photoY - photoR + 52, 135, 0.38);

  // Headline and name.
  ctx.textAlign = 'center';
  ctx.fillStyle = BURNT;
  ctx.font = `italic 400 112px ${SERIF}`;
  ctx.fillText('Happy Birthday', cx, 1000);
  let size = 78;
  ctx.fillStyle = INK;
  ctx.font = `700 ${size}px ${SANS}`;
  while (ctx.measureText(input.name).width > 920 && size > 44) { size -= 2; ctx.font = `700 ${size}px ${SANS}`; }
  ctx.fillText(input.name, cx, 1092);

  // Quote, bottom left, small and quiet.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7A4A2A';
  ctx.font = `italic 400 29px ${SERIF}`;
  const lines = wrap(ctx, `“${input.quote.text}”`, 640);
  const lineH = 40;
  const top = 1330 - 60 - lines.length * lineH - 14;
  lines.forEach((l, i) => ctx.fillText(l, 70, top + i * lineH));
  ctx.fillStyle = BURNT;
  ctx.font = `700 20px ${SANS}`;
  ctx.fillText(input.quote.ref.toUpperCase(), 70, top + lines.length * lineH + 8);
  // A little flourish bottom right.
  star(ctx, 960, 1235, 24, ORANGE);
  star(ctx, 1010, 1190, 14, GOLD);
  star(ctx, 915, 1195, 11, PEACH);

  return { photoUsed: !!photo };
};
