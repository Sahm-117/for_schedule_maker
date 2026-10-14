import React from 'react';

// Links people paste into free text (discussion posts, hub notes, announcement
// bodies, recaps, testimonies, message previews) open in the device browser,
// never trapped in the app. Pair with MentionText for @names plus links.

const URL_PATTERN = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/g;
const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

// An Inspirational Scripture picture shared into a discussion post (the "Today's scripture" conversation
// starter) shows as the picture itself, tappable to open it full size, instead of a long web address.
// Only where a caller asks for it (`images`): previews and one-line summaries keep showing a plain link.
const SCRIPTURE_IMAGE = /\/storage\/v1\/object\/public\/resources\/scriptures\//;

const hrefFor = (value: string): string =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

export const linkifyText = (text: string, options: { images?: boolean } = {}): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;
  let key = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCT, '');
    const start = match.index;
    if (start > last) nodes.push(text.slice(last, start));
    if (trimmed && options.images && SCRIPTURE_IMAGE.test(trimmed)) {
      nodes.push(
        <a key={key++} href={hrefFor(trimmed)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="my-1 block">
          <img src={hrefFor(trimmed)} alt="Inspirational scripture" loading="lazy" className="max-h-80 w-full max-w-[260px] rounded-2xl object-cover" />
        </a>,
      );
    } else if (trimmed) {
      nodes.push(
        <a
          key={key++}
          href={hrefFor(trimmed)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="break-all font-semibold text-primary underline underline-offset-2"
        >
          {trimmed}
        </a>,
      );
    }
    last = start + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
};

const LinkText: React.FC<{ text: string }> = ({ text }) => <>{linkifyText(text)}</>;

export default LinkText;
