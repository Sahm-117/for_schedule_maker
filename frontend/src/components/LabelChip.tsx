import React from 'react';
import { getContrastingTextColor, normalizeHexColor } from '../utils/color';

type LabelChipSize = 'sm' | 'md';

interface LabelChipProps {
  name: string;
  color?: string | null;
  size?: LabelChipSize;
  title?: string;
  className?: string;
}

const SIZE_CLASS: Record<LabelChipSize, string> = {
  // Fixed height + explicit line-height keeps text visually centered across browsers (esp iOS).
  sm: 'h-5 px-2 text-[11px] leading-4',
  md: 'h-6 px-2.5 text-xs leading-5',
};

const LabelChip: React.FC<LabelChipProps> = ({
  name,
  color,
  size = 'sm',
  title,
  className = '',
}) => {
  const bg = normalizeHexColor(color || '') || '#E5E7EB';
  const fg = getContrastingTextColor(bg);

  return (
    <span
      className={[
        'inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium text-center',
        SIZE_CLASS[size],
        className,
      ].join(' ')}
      style={{ backgroundColor: bg, color: fg }}
      title={title || name}
    >
      {name}
    </span>
  );
};

export default LabelChip;
