import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';

// The person's photo at the top left of the header. Tapping it opens a small
// menu: View profile, Log out.

interface ProfileMenuProps {
  name: string;
  avatarUrl?: string | null;
  profilePath: string;
  onLogout: () => void;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({ name, avatarUrl, profilePath, onLogout }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 8, left: rect.left });
    setOpen((v) => !v);
  };

  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition';

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex-none rounded-full ring-2 ring-white transition active:scale-95"
      >
        <Avatar name={name} avatarUrl={avatarUrl} size="md" />
      </button>
      {open && createPortal(
        <div
          ref={menu}
          role="menu"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[120] w-52 rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-12px_rgba(17,24,39,0.28)] ring-1 ring-black/5"
        >
          <p className="truncate px-3 pb-1.5 pt-2 text-xs font-medium text-gray-500">{name}</p>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate(profilePath); }} className={`${item} text-gray-800 hover:bg-orange-50`}>
            <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>
            View profile
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }} className={`${item} text-red-700 hover:bg-red-50`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" /></svg>
            Log out
          </button>
        </div>,
        document.body
      )}
    </>
  );
};

export default ProfileMenu;
