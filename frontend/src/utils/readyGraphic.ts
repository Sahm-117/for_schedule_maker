import { BURNT, GOLD, GRAPHIC_H, GRAPHIC_W, INK, ORANGE, ORANGE_DEEP, SANS, initialsOf, loadFonts, loadImage, loadPhoto, roundRect, seeded, spaced, star } from './birthdayGraphic';

// The "I'm fully ready" graphic a participant can make once every Get ready step is done: their photo and name,
// a green tick, and one line saying they are ready for their cohort's class. Same size and look family as the birthday graphic.

export interface ReadyGraphicInput {
  name: string;
  photoUrl?: string | null;
  /** The cohort's name; "Cohort 10" becomes "FOF 10". */
  cohortName?: string | null;
}

export const cohortLabel = (cohortName?: string | null): string => {
  const n = cohortName?.match(/\d+/)?.[0];
  return n ? `FOF ${n}` : 'FOF';
};

export const drawReadyGraphic = async (target: HTMLCanvasElement, input: ReadyGraphicInput, isCancelled: () => boolean = () => false): Promise<{ photoUsed: boolean }> => {
  const canvas = document.createElement('canvas');
  canvas.width = GRAPHIC_W;
  canvas.height = GRAPHIC_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the graphic.');
  await loadFonts();
  const [photo, crest] = await Promise.all([input.photoUrl ? loadPhoto(input.photoUrl) : Promise.resolve(null), loadImage('/logo-crest.webp', false)]);
  const rand = seeded(input.name);
  const cx = GRAPHIC_W / 2;

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

  // Tone-on-tone wall of READY.
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.font = `900 200px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const unit = ctx.measureText('READY  ').width;
  for (let row = 0; row < 8; row += 1) {
    let x = -((row * 211) % unit) - unit;
    while (x < GRAPHIC_W) { ctx.fillText('READY', x, 190 + row * 175); x += unit; }
  }
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(80,20,0,0.07)';
    ctx.fillRect(rand() * GRAPHIC_W, rand() * GRAPHIC_H, 2, 2);
  }

  // Header: crest and the church.
  if (crest) ctx.drawImage(crest, cx - 34, 56, 68, 68);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFF1E6';
  ctx.font = `700 17px ${SANS}`;
  spaced(ctx, 4);
  ctx.fillText('THE COVENANT NATION', cx, 152);
  ctx.font = `600 13px ${SANS}`;
  ctx.fillText('IKORODU', cx, 174);
  spaced(ctx, 0);

  // Photo in a pill, white ring, soft shadow.
  const pw = 440;
  const ph = 560;
  const px = cx - pw / 2;
  const py = 215;
  ctx.save();
  ctx.shadowColor = 'rgba(90, 25, 0, 0.35)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, px - 16, py - 16, pw + 32, ph + 32, (pw + 32) / 2);
  ctx.fill();
  ctx.restore();
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
    ctx.font = `800 180px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(input.name), cx, py + ph / 2 + 6);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Green tick badge.
  const bx = px + pw - 28;
  const by = py + ph - 64;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 60, 20, 0.35)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(bx, by, 74, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#10B981';
  ctx.beginPath(); ctx.arc(bx, by, 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(bx - 26, by + 2); ctx.lineTo(bx - 7, by + 22); ctx.lineTo(bx + 28, by - 20); ctx.stroke();

  // The message.
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = `900 84px ${SANS}`;
  ctx.fillText("I'M FULLY READY", cx, 905);
  ctx.fillStyle = '#FFF1E6';
  ctx.font = `700 40px ${SANS}`;
  ctx.fillText(`for ${cohortLabel(input.cohortName)} class`, cx, 962);
  ctx.font = `italic 400 27px ${SANS}`;
  ctx.fillText('I just completed all my onboarding steps.', cx, 1014);

  // Name banner.
  const bannerW = GRAPHIC_W - 260;
  ctx.save();
  ctx.shadowColor = 'rgba(90, 25, 0, 0.3)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#FFF4E8';
  roundRect(ctx, 130, 1066, bannerW, 104, 20);
  ctx.fill();
  ctx.restore();
  const label = input.name.toUpperCase();
  let size = 50;
  ctx.fillStyle = INK;
  ctx.font = `800 ${size}px ${SANS}`;
  spaced(ctx, 2);
  while (ctx.measureText(label).width > bannerW - 60 && size > 28) { size -= 2; ctx.font = `800 ${size}px ${SANS}`; }
  let shown = label;
  while (ctx.measureText(shown).width > bannerW - 60 && shown.length > 4) shown = `${shown.slice(0, -2).trimEnd()}…`;
  ctx.fillText(shown, cx, 1066 + 52 + size * 0.34);
  spaced(ctx, 0);

  star(ctx, 70, 1240, 18, GOLD);
  star(ctx, 1010, 1260, 22, '#FFFFFF');
  star(ctx, 110, 1290, 11, '#FFFFFF');
  star(ctx, 960, 1215, 12, GOLD);
  ctx.fillStyle = BURNT;

  if (!isCancelled()) {
    target.width = GRAPHIC_W;
    target.height = GRAPHIC_H;
    target.getContext('2d')?.drawImage(canvas, 0, 0);
  }
  return { photoUsed: !!photo };
};

export { ORANGE };
