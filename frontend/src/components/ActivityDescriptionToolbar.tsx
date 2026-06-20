import React from 'react';

interface ActivityDescriptionToolbarProps {
  value: string;
  onChange: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const toolbarButtons = [
  { label: 'Bold', icon: 'B', className: 'font-bold', action: 'bold' },
  { label: 'Italic', icon: 'I', className: 'italic', action: 'italic' },
  { label: 'Bullet list', icon: '•', className: '', action: 'bullet' },
  { label: 'Numbered list', icon: '1.', className: '', action: 'numbered' },
] as const;

const stripListMarker = (line: string) => line.replace(/^\s*([-*]\s+|\d+\.\s+)/, '').trim();

const splitTopLevelListItems = (text: string): string[] => {
  const items: string[] = [];
  let current = '';
  let squareDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;

  for (const char of text) {
    if (char === '[') squareDepth += 1;
    if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (char === '{') braceDepth += 1;
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1);

    const atTopLevel = squareDepth === 0 && parenDepth === 0 && braceDepth === 0;
    if ((char === ',' || char === ';') && atTopLevel) {
      const item = stripListMarker(current);
      if (item) items.push(item);
      current = '';
      continue;
    }

    current += char;
  }

  const finalItem = stripListMarker(current);
  if (finalItem) items.push(finalItem);
  return items;
};

const getSmartListItems = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, '\n');
  if (normalized.includes('\n')) {
    return normalized
      .split('\n')
      .map(stripListMarker)
      .filter(Boolean);
  }

  const splitItems = splitTopLevelListItems(normalized);
  return splitItems.length > 0 ? splitItems : ['item'];
};

const ActivityDescriptionToolbar: React.FC<ActivityDescriptionToolbarProps> = ({
  value,
  onChange,
  textareaRef,
}) => {
  const focusSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  };

  const wrapSelection = (marker: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end) || 'text';
    const nextValue = `${value.slice(0, start)}${marker}${selectedText}${marker}${value.slice(end)}`;

    onChange(nextValue);
    focusSelection(start + marker.length, start + marker.length + selectedText.length);
  };

  const prefixSelectedLines = (ordered: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end) || 'item';
    const items = getSmartListItems(selectedText);
    const formatted = items
      .map((item, index) => `${ordered ? `${index + 1}. ` : '- '}${item}`)
      .join('\n');
    const nextValue = `${value.slice(0, start)}${formatted}${value.slice(end)}`;

    onChange(nextValue);
    focusSelection(start, start + formatted.length);
  };

  const runAction = (action: (typeof toolbarButtons)[number]['action']) => {
    if (action === 'bold') wrapSelection('**');
    if (action === 'italic') wrapSelection('*');
    if (action === 'bullet') prefixSelectedLines(false);
    if (action === 'numbered') prefixSelectedLines(true);
  };

  return (
    <div className="mb-1.5 flex items-center gap-1" aria-label="Description formatting">
      {toolbarButtons.map((button) => (
        <button
          key={button.label}
          type="button"
          title={button.label}
          aria-label={button.label}
          onClick={() => runAction(button.action)}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 ${button.className}`}
        >
          {button.icon}
        </button>
      ))}
    </div>
  );
};

export default ActivityDescriptionToolbar;
