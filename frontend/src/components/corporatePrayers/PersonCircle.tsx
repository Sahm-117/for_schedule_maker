import React from 'react';
import { gradientFor, initialsOf } from '../../utils/prayerText';

// A person's photo, or a coloured gradient circle with their initials when they have none.
const PersonCircle: React.FC<{ name: string; avatarUrl: string | null; size: number; className?: string }> = ({ name, avatarUrl, size, className = '' }) => {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`flex-none rounded-full object-cover ${className}`} style={{ width: size, height: size }} />;
  }
  const [from, to] = gradientFor(name);
  return (
    <span
      className={`grid flex-none place-items-center rounded-full font-bold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
};

export default PersonCircle;
