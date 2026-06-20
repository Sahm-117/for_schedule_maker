export type ActivityPlatform = 'whatsapp' | 'telegram';

export type ActivityInlineToken = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  platform?: ActivityPlatform;
};

export type ActivityDescriptionBlock =
  | { type: 'paragraph'; inlines: ActivityInlineToken[] }
  | { type: 'list'; ordered: boolean; items: Array<{ marker: string; inlines: ActivityInlineToken[] }> };

const MENTION_TOKEN = /(whatsapp|telegram)/gi;

const appendInlineTokens = (
  tokens: ActivityInlineToken[],
  text: string,
  styles: Pick<ActivityInlineToken, 'bold' | 'italic'>
) => {
  if (!text) return;

  const parts = text.split(MENTION_TOKEN);
  parts.forEach((part) => {
    if (!part) return;
    const lower = part.toLowerCase();
    tokens.push({
      text: part,
      ...styles,
      platform: lower === 'whatsapp' || lower === 'telegram' ? lower : undefined,
    });
  });
};

export const parseActivityInlineMarkdown = (
  text: string,
  styles: Pick<ActivityInlineToken, 'bold' | 'italic'> = {}
): ActivityInlineToken[] => {
  const tokens: ActivityInlineToken[] = [];
  let index = 0;

  while (index < text.length) {
    const boldStart = text.indexOf('**', index);
    const italicStart = text.indexOf('*', index);
    const nextBold = boldStart >= 0 ? boldStart : Number.POSITIVE_INFINITY;
    const nextItalic = italicStart >= 0 && text[italicStart + 1] !== '*'
      ? italicStart
      : Number.POSITIVE_INFINITY;
    const nextMarker = Math.min(nextBold, nextItalic);

    if (nextMarker === Number.POSITIVE_INFINITY) {
      appendInlineTokens(tokens, text.slice(index), styles);
      break;
    }

    appendInlineTokens(tokens, text.slice(index, nextMarker), styles);

    if (nextMarker === nextBold) {
      const close = text.indexOf('**', nextMarker + 2);
      if (close < 0) {
        appendInlineTokens(tokens, text.slice(nextMarker), styles);
        break;
      }
      tokens.push(...parseActivityInlineMarkdown(text.slice(nextMarker + 2, close), { ...styles, bold: true }));
      index = close + 2;
    } else {
      const close = text.indexOf('*', nextMarker + 1);
      if (close < 0) {
        appendInlineTokens(tokens, text.slice(nextMarker), styles);
        break;
      }
      tokens.push(...parseActivityInlineMarkdown(text.slice(nextMarker + 1, close), { ...styles, italic: true }));
      index = close + 1;
    }
  }

  return tokens;
};

export const parseActivityDescription = (text: string): ActivityDescriptionBlock[] => {
  const blocks: ActivityDescriptionBlock[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);

    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const content = bullet?.[1] ?? numbered?.[2] ?? '';
      const marker = ordered ? `${numbered?.[1] ?? 1}.` : '•';
      const previous = blocks[blocks.length - 1];

      if (previous?.type === 'list' && previous.ordered === ordered) {
        previous.items.push({ marker, inlines: parseActivityInlineMarkdown(content) });
      } else {
        blocks.push({
          type: 'list',
          ordered,
          items: [{ marker, inlines: parseActivityInlineMarkdown(content) }],
        });
      }
      continue;
    }

    if (line.trim().length === 0) {
      blocks.push({ type: 'paragraph', inlines: [] });
    } else {
      blocks.push({ type: 'paragraph', inlines: parseActivityInlineMarkdown(line) });
    }
  }

  return blocks;
};

export const inlineTokensToText = (tokens: ActivityInlineToken[]): string =>
  tokens.map((token) => token.text).join('');

export const activityDescriptionToPlainText = (text: string): string =>
  parseActivityDescription(text)
    .map((block) => {
      if (block.type === 'paragraph') return inlineTokensToText(block.inlines);
      return block.items
        .map((item, index) => {
          const marker = block.ordered ? `${index + 1}.` : '-';
          return `${marker} ${inlineTokensToText(item.inlines)}`;
        })
        .join('\n');
    })
    .join('\n');
