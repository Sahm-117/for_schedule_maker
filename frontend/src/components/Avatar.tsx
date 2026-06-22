import React, { useEffect, useState } from 'react';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

const Avatar: React.FC<AvatarProps> = ({ name, avatarUrl, size = 'md', className = '' }) => {
  const [errored, setErrored] = useState(false);

  // Reset the error state when the URL changes (e.g. after a re-upload).
  useEffect(() => { setErrored(false); }, [avatarUrl]);

  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

  if (avatarUrl && !errored) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeMap[size]} flex-shrink-0 rounded-full object-cover ${className}`}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div className={`${sizeMap[size]} flex flex-shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${className}`}>
      {initials}
    </div>
  );
};

export default Avatar;
