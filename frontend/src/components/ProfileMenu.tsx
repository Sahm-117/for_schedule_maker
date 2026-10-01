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
  /** Roles this login may act as, and the one it is acting as. The menu offers Switch roles when there are two or more. */
  roles?: Array<'ADMIN' | 'SUPPORT'>;
  activeRole?: string;
  onSwitchRole?: (role: 'ADMIN' | 'SUPPORT') => Promise<void>;
}

const ROLE_NAME: Record<string, string> = { ADMIN: 'Admin', SUPPORT: 'Support' };

const ProfileMenu: React.FC<ProfileMenuProps> = ({ name, avatarUrl, profilePath, onLogout, roles, activeRole, onSwitchRole }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'roles'>('main');
  const [switching, setSwitching] = useState(false);
  const canSwitch = !!onSwitchRole && (roles?.length ?? 0) > 1;
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
    setView('main');
    setOpen((v) => !v);
  };

  const pick = async (role: 'ADMIN' | 'SUPPORT') => {
    if (!onSwitchRole || switching) return;
    if (role === activeRole) { setOpen(false); return; }
    setSwitching(true);
    try { await onSwitchRole(role); } catch { setSwitching(false); }
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
          <p className="truncate px-3 pb-1.5 pt-2 text-xs font-medium text-gray-500">{name}{canSwitch && activeRole ? ` · ${ROLE_NAME[activeRole] ?? activeRole}` : ''}</p>
          {view === 'roles' ? (
            <>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Act as</p>
              {roles?.map((role) => (
                <button key={role} type="button" role="menuitemradio" aria-checked={role === activeRole} disabled={switching} onClick={() => void pick(role)} className={`${item} text-gray-800 hover:bg-orange-50 disabled:opacity-60`}>
                  <span className="flex-1">{ROLE_NAME[role] ?? role}</span>
                  {role === activeRole && <span aria-hidden="true" className="text-emerald-600">✓</span>}
                </button>
              ))}
              <button type="button" role="menuitem" onClick={() => setView('main')} className={`${item} font-medium text-gray-500 hover:bg-gray-50`}>Back</button>
            </>
          ) : (
            <>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate(profilePath); }} className={`${item} text-gray-800 hover:bg-orange-50`}>
            <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>
            View profile
          </button>
          {canSwitch && (
            <button type="button" role="menuitem" onClick={() => setView('roles')} className={`${item} text-gray-800 hover:bg-orange-50`}>
              <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M7 7h12l-3-3M17 17H5l3 3" /></svg>
              Switch roles
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }} className={`${item} text-red-700 hover:bg-red-50`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" /></svg>
            Log out
          </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

export default ProfileMenu;
