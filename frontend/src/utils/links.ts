// Meeting/call link helpers.
// Links pasted without a scheme (e.g. "www.google.com" or "meet.google.com/abc")
// get treated as a relative path by the browser and fail to open — add https:// so
// both newly-saved links and older rows already in the DB open correctly.

export const normalizeLink = (raw: string | null | undefined): string => {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};
