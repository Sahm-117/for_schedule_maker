import { GRAPHIC_H, GRAPHIC_W, SANS, initialsOf, loadFonts, loadPhoto, spaced } from './birthdayGraphic';
import { cohortLabel } from './readyGraphic';
import type { MilestoneTier } from './prayerMilestones';

// The picture a person can share when they reach a prayer streak badge: their photo (or initials), the badge and how many days,
// with the church footer in the brand orange. Same size as the birthday and ready pictures.

export interface StreakGraphicInput {
  name: string;
  photoUrl?: string | null;
  cohortName?: string | null;
  tier: MilestoneTier;
}

export const FOOTER_ORANGE = '#F97316';
export const FOOTER_TEXT = 'TCN Ikorodu | FOF';

export const drawStreakGraphic = async (target: HTMLCanvasElement, input: StreakGraphicInput, isCancelled: () => boolean = () => false): Promise<{ photoUsed: boolean }> => {
  const { tier } = input;
  const canvas = document.createElement('canvas');
  canvas.width = GRAPHIC_W;
  canvas.height = GRAPHIC_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the graphic.');
  await loadFonts();
  const photo = input.photoUrl ? await loadPhoto(input.photoUrl) : null;
  const cx = GRAPHIC_W / 2;
  const footerH = 130;

  ctx.fillStyle = tier.bg;
  ctx.fillRect(0, 0, GRAPHIC_W, GRAPHIC_H);
  // Soft rings behind the photo.
  const cy = 470;
  for (const [r, color] of [[470, tier.ring2], [380, tier.ring1]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  // Photo (or initials) in a circle with a white ring.
  const pr = 200;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(cx, cy, pr + 14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.clip();
  if (photo) {
    const s = Math.max((pr * 2) / photo.width, (pr * 2) / photo.height);
    const w = photo.width * s;
    const h = photo.height * s;
    ctx.drawImage(photo, cx - w / 2, cy - h * 0.45, w, h);
  } else {
    ctx.fillStyle = tier.badge;
    ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);
    ctx.fillStyle = tier.fg;
    ctx.font = `800 150px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(input.name), cx, cy + 6);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Badge on the photo's lower right.
  const bx = cx + pr - 30;
  const by = cy + pr - 30;
  ctx.fillStyle = tier.bg;
  ctx.beginPath(); ctx.arc(bx, by, 84, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tier.badge;
  ctx.beginPath(); ctx.arc(bx, by, 72, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(bx - 36, by - 36);
  ctx.scale(3, 3);
  ctx.fillStyle = tier.fg;
  ctx.fill(new Path2D(tier.icon));
  ctx.restore();

  // The words.
  ctx.textAlign = 'center';
  const first = input.name.trim().split(/\s+/)[0] || input.name;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 76px ${SANS}`;
  ctx.fillText(tier.pic.toUpperCase(), cx, 880);
  ctx.fillStyle = tier.light;
  ctx.font = `800 54px ${SANS}`;
  let shown = first;
  while (ctx.measureText(shown).width > GRAPHIC_W - 160 && shown.length > 3) shown = `${shown.slice(0, -2)}…`;
  ctx.fillText(shown, cx, 960);
  ctx.font = `600 40px ${SANS}`;
  ctx.fillText(`${tier.name} badge · ${cohortLabel(input.cohortName)}`, cx, 1030);

  // Footer band.
  ctx.fillStyle = FOOTER_ORANGE;
  ctx.fillRect(0, GRAPHIC_H - footerH, GRAPHIC_W, footerH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 40px ${SANS}`;
  spaced(ctx, 1);
  ctx.fillText(FOOTER_TEXT, cx, GRAPHIC_H - footerH / 2 + 14);
  spaced(ctx, 0);

  if (!isCancelled()) {
    target.width = GRAPHIC_W;
    target.height = GRAPHIC_H;
    target.getContext('2d')?.drawImage(canvas, 0, 0);
  }
  return { photoUsed: !!photo };
};
