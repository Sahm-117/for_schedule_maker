import React, { useRef, useState } from 'react';
import Avatar from '../Avatar';
import { linkifyText } from '../LinkText';
import type { DiscussionMember, DiscussionMention } from '../../types';

// A textarea that offers the group's people when you type "@". Picking one
// inserts "@Full Name " and records the tag; tags whose "@Name" is later
// deleted from the text are dropped by mentionsInText() before sending.

export const mentionsInText = (text: string, mentions: DiscussionMention[]): DiscussionMention[] => {
  const seen = new Set<string>();
  return mentions.filter((m) => {
    const key = `${m.kind}:${m.id}`;
    if (seen.has(key) || !m.name || !text.includes(`@${m.name}`)) return false;
    seen.add(key);
    return true;
  });
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Post or reply text with each "@Name" of a tagged person highlighted. */
export const MentionText: React.FC<{ text: string; mentions?: DiscussionMention[] }> = ({ text, mentions }) => {
  const names = Array.from(new Set((mentions ?? []).map((m) => m.name).filter((n): n is string => !!n)))
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return <>{linkifyText(text)}</>;
  const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g');
  return (
    <>
      {text.split(pattern).map((part, i) => (
        i % 2 === 1
          ? <span key={i} className="font-semibold text-primary">{part}</span>
          : <React.Fragment key={i}>{linkifyText(part)}</React.Fragment>
      ))}
    </>
  );
};

/** One thing the "/" menu can put into the message. */
export interface SlashItem {
  id: string;
  label: string;
  text: string;
  /** A picture to show beside it (today's scripture). */
  imageUrl?: string;
}

// "/" at the start or after a space, then up to 20 characters, right before the caret.
const SLASH_AT_CARET = /(^|\s)\/([^\s/]{0,20})$/;

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  mentions: DiscussionMention[];
  onMentionsChange: (mentions: DiscussionMention[]) => void;
  members: DiscussionMember[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** When given, typing "/" offers these (conversation starters) and picking one fills the message. */
  slashItems?: SlashItem[];
}

const MentionTextarea: React.FC<MentionTextareaProps> = ({ value, onChange, mentions, onMentionsChange, members, placeholder, rows = 3, autoFocus, className, textareaRef, slashItems }) => {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;
  const [query, setQuery] = useState<string | null>(null);
  const [slash, setSlash] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  // "@" at the start or after a space, followed by up to 30 non-space characters, right before the caret.
  const updateQuery = (text: string, caret: number) => {
    const match = /(^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
    setQuery(match ? match[2] : null);
    const slashMatch = slashItems && slashItems.length > 0 ? SLASH_AT_CARET.exec(text.slice(0, caret)) : null;
    setSlash(slashMatch ? slashMatch[2] : null);
    setActive(0);
  };

  const slashMatches = slash === null || !slashItems ? [] : slashItems.filter((i) => i.label.toLowerCase().includes(slash.toLowerCase()));

  const pickSlash = (item: SlashItem) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(SLASH_AT_CARET, (_m, lead: string) => lead + item.text);
    onChange(before + value.slice(caret));
    setSlash(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const matches = query === null ? [] : members
    .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  const pick = (member: DiscussionMember) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${member.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    onMentionsChange([...mentions, { kind: member.kind, id: member.id, name: member.name }]);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        rows={rows}
        maxLength={2000}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); updateQuery(e.target.value, e.target.selectionStart); }}
        onKeyDown={(e) => {
          if (slashMatches.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % slashMatches.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + slashMatches.length) % slashMatches.length); }
          else if (e.key === 'Enter') { e.preventDefault(); pickSlash(slashMatches[Math.min(active, slashMatches.length - 1)]); }
          else if (e.key === 'Escape') { e.preventDefault(); setSlash(null); }
        }}
        onKeyUp={(e) => {
          // Moving through the menu must not reset it.
          if (slashMatches.length > 0 && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;
          updateQuery(e.currentTarget.value, e.currentTarget.selectionStart);
        }}
        onClick={(e) => updateQuery(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => window.setTimeout(() => { setQuery(null); setSlash(null); }, 150)}
        className={className}
      />
      {slashMatches.length > 0 && (
        <ul role="listbox" aria-label="Conversation starters" className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-[min(50vh,320px)] overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(17,24,39,0.25)] ring-1 ring-black/5">
          <li role="presentation" className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Conversation starters</li>
          {slashMatches.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSlash(item)}
                className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left hover:bg-gray-50 ${index === active ? 'bg-gray-50' : ''}`}
              >
                {item.imageUrl && <img src={item.imageUrl} alt="" className="h-10 w-8 flex-none rounded-md object-cover" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-gray-900">{item.label}</span>
                  <span className="block truncate text-[12.5px] text-gray-500">{item.imageUrl ? 'Share the picture and ask what stood out' : item.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Tag someone" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(17,24,39,0.25)] ring-1 ring-black/5">
          {matches.map((m) => (
            <li key={`${m.kind}:${m.id}`}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left hover:bg-gray-50"
              >
                <Avatar name={m.name} avatarUrl={m.avatarUrl} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-gray-900">{m.name}</span>
                {m.kind === 'SUPPORT' && <span className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Support</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MentionTextarea;
