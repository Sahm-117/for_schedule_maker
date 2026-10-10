// The birthday graphic: a fixed template drawn on a canvas. It takes a name, a photo (optional), the date, a role label and a quote.
// Look: a big tone-on-tone "HAPPY BIRTHDAY" wall, a tilted card with a pill-shaped photo and a date badge, the name on a banner. 1080 x 1350 (4:5) so it sits well on WhatsApp status, Instagram and a group chat.

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
const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ORANGE_DEEP = '#E5822D';
const BURNT = '#C2410C';
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
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, ry);
  ctx.bezierCurveTo(-14, ry + 30, 16, ry + 55, -4, ry + 90);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, ry - 2);
  ctx.lineTo(-8, ry + 12);
  ctx.lineTo(8, ry + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.38, -ry * 0.4, rx * 0.16, ry * 0.26, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const spaced = (ctx: CanvasRenderingContext2D, px: number) => { if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; };

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
  /** 1 to 12 and the day of the month. */
  month: number;
  day: number;
  /** Short label on the pill above the name, e.g. "Support". */
  roleLabel: string;
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

  // Background: orange to burnt orange, with a soft light from the top left.
  const bg = ctx.createLinearGradient(0, 0, GRAPHIC_W, GRAPHIC_H);
  bg.addColorStop(0, '#FF9A55');
  bg.addColorStop(0.55, '#E5782A');
  bg.addColorStop(1, '#B93C0A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, GRAPHIC_W, GRAPHIC_H);
  const light = ctx.createRadialGradient(200, 100, 40, 200, 100, 900);
  light.addColorStop(0, 'rgba(255,255,255,0.25)');
  light.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, GRAPHIC_W, GRAPHIC_H);

  // The wall of words: HAPPY / BIRTHDAY repeated, tone on tone, each row shifted.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.font = `900 190px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const words = ['HAPPY', 'BIRTHDAY'];
  for (let row = 0; row < 8; row += 1) {
    const w = words[row % 2];
    const unit = ctx.measureText(`${w}  `).width;
    let x = -((row * 173) % unit) - unit;
    while (x < GRAPHIC_W) { ctx.fillText(w, x, 190 + row * 175); x += unit; }
  }
  ctx.restore();

  // Fine grain so the gradient does not look flat.
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(80,20,0,0.07)';
    ctx.fillRect(rand() * GRAPHIC_W, rand() * GRAPHIC_H, 2, 2);
  }

  // The card: a tilted gold card behind, the cream card in front.
  const cardX = 150;
  const cardY = 120;
  const cardW = 780;
  const cardH = 880;
  ctx.save();
  ctx.translate(cx, cardY + cardH / 2);
  ctx.rotate(0.07);
  ctx.shadowColor = 'rgba(90, 25, 0, 0.3)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = GOLD;
  roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 60);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = 'rgba(90, 25, 0, 0.35)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = '#FFF4E8';
  roundRect(ctx, cardX, cardY, cardW, cardH, 60);
  ctx.fill();
  ctx.restore();

  // Side lettering and balloons, as on a playing card.
  ctx.fillStyle = BURNT;
  ctx.font = `700 21px ${SANS}`;
  ctx.textAlign = 'center';
  spaced(ctx, 9);
  for (const x of [cardX + 50, cardX + cardW - 50]) {
    ctx.save();
    ctx.translate(x, cardY + cardH / 2 - 10);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('HAPPY BIRTHDAY!!!', 0, 7);
    ctx.restore();
  }
  spaced(ctx, 0);
  balloon(ctx, cardX + 56, cardY + 58, 22, BURNT, -0.15);
  balloon(ctx, cardX + cardW - 56, cardY + cardH - 120, 22, BURNT, 0.15);

  // Pill-shaped photo with an orange ring.
  const pw = 450;
  const ph = 620;
  const px = cx - pw / 2;
  const py = cardY + 70;
  ctx.fillStyle = ORANGE;
  roundRect(ctx, px - 14, py - 14, pw + 28, ph + 28, (pw + 28) / 2);
  ctx.fill();
  ctx.save();
  roundRect(ctx, px, py, pw, ph, pw / 2);
  ctx.clip();
  if (photo) {
    const s = Math.max(pw / photo.width, ph / photo.height);
    const w = photo.width * s;
    const h = photo.height * s;
    ctx.drawImage(photo, cx - w / 2, py - (h - ph) * 0.3, w, h);
  } else {
    const g = ctx.createLinearGradient(px, py, px + pw, py + ph);
    g.addColorStop(0, '#FFB27D');
    g.addColorStop(1, ORANGE_DEEP);
    ctx.fillStyle = g;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 190px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(input.name), cx, py + ph / 2 + 6);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Date badge overlapping the photo's lower right.
  const bx = px + pw - 30;
  const by = py + ph - 70;
  ctx.save();
  ctx.shadowColor = 'rgba(90, 25, 0, 0.3)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(bx, by, 76, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(bx, by, 68, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = BURNT;
  ctx.font = `700 24px ${SANS}`;
  spaced(ctx, 4);
  ctx.fillText(MONTHS_SHORT[(input.month - 1 + 12) % 12], bx + 2, by - 14);
  spaced(ctx, 0);
  ctx.fillStyle = INK;
  ctx.font = `800 54px ${SANS}`;
  ctx.fillText(String(input.day).padStart(2, '0'), bx, by + 38);

  // Role pill and name banner, overlapping the card's lower edge.
  const bannerY = cardY + cardH + 50;
  const bannerX = 130;
  const bannerW = GRAPHIC_W - 260;
  ctx.save();
  ctx.shadowColor = 'rgba(90, 25, 0, 0.3)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#FFF4E8';
  roundRect(ctx, bannerX, bannerY + 4, bannerW, 104, 20);
  ctx.fill();
  ctx.restore();
  ctx.font = `600 26px ${SERIF}`;
  const pillText = input.roleLabel;
  ctx.font = `italic 600 26px ${SERIF}`;
  const pillW = ctx.measureText(pillText).width + 70;
  ctx.save();
  ctx.shadowColor = 'rgba(90, 25, 0, 0.3)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = ORANGE_DEEP;
  roundRect(ctx, bannerX + 10, bannerY - 46, pillW, 52, 26);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(`\u2013 ${pillText}`, bannerX + 36, bannerY - 10);
  const label = input.name.toUpperCase();
  let size = 52;
  ctx.fillStyle = INK;
  ctx.font = `800 ${size}px ${SANS}`;
  spaced(ctx, 2);
  while (ctx.measureText(label).width > bannerW - 60 && size > 28) { size -= 2; ctx.font = `800 ${size}px ${SANS}`; }
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, bannerY + 4 + 52 + size * 0.34);
  spaced(ctx, 0);

  // Footer: quote bottom left, crest and programme bottom right.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFF1E6';
  ctx.font = `italic 400 25px ${SERIF}`;
  const lines = wrap(ctx, `\u201C${input.quote.text}\u201D`, 560).slice(0, 3);
  const lineH = 34;
  const qTop = 1240;
  lines.forEach((l, i) => ctx.fillText(l, 70, qTop + i * lineH));
  ctx.fillStyle = GOLD;
  ctx.font = `700 17px ${SANS}`;
  spaced(ctx, 3);
  ctx.fillText(input.quote.ref.toUpperCase(), 70, qTop + lines.length * lineH + 6);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFF1E6';
  ctx.font = `700 15px ${SANS}`;
  ctx.fillText('FOUNDATION OF FAITH', 1010, 1296);
  ctx.font = `600 13px ${SANS}`;
  ctx.fillText('THE COVENANT NATION \u00B7 IKORODU', 1010, 1318);
  spaced(ctx, 0);
  if (crest) ctx.drawImage(crest, 1010 - 62, 1214, 62, 62);

  star(ctx, 60, 1100, 16, GOLD);
  star(ctx, 1030, 90, 20, '#FFFFFF');
  star(ctx, 55, 70, 14, '#FFFFFF');

  return { photoUsed: !!photo };
};
