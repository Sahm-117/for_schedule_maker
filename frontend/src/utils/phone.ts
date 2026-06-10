// Phone helpers for WhatsApp deep links.
// Nigerian local numbers (080..., 070..., 090...) are converted to 234 format;
// other international numbers are kept as-is.

export const normalizeToIntlPhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (/^0[7-9][01]\d{8}$/.test(digits)) return `234${digits.slice(1)}`;
  if (/^234[7-9][01]\d{8}$/.test(digits)) return digits;
  // Other international numbers (e.g. 447425409061 from "+44 7425 409061")
  if (/^\d{10,15}$/.test(digits) && !digits.startsWith('0')) return digits;
  return null;
};

export const buildWhatsAppLink = (phone: string | null | undefined, message: string): string | null => {
  const intl = normalizeToIntlPhone(phone);
  if (!intl) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
};
