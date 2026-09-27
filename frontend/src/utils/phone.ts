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

// Any way a Nigerian number gets pasted ("+234 803 123 4567", "2348031234567",
// "+234 0803…", "803-123-4567") → the 080… form people sign in with.
// Null when it isn't a Nigerian mobile number.
export const toLocalNigerianPhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) digits = digits.slice(3);
  if (!digits.startsWith('0')) digits = `0${digits}`;
  return /^0[7-9][01]\d{8}$/.test(digits) ? digits : null;
};

export const buildWhatsAppLink = (phone: string | null | undefined, message: string): string | null => {
  const intl = normalizeToIntlPhone(phone);
  if (!intl) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
};
