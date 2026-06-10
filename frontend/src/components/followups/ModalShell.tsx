import React from 'react';
import { createPortal } from 'react-dom';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

const ModalShell: React.FC<ModalShellProps> = ({ isOpen, onClose, title, subtitle, children, footer, wide }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={onClose} aria-label="Close" />
      <div className={`relative m-0 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:m-4 sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-start justify-between border-b border-orange-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-orange-50 hover:text-gray-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-orange-100 bg-white/80 px-6 py-4 backdrop-blur-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ModalShell;
