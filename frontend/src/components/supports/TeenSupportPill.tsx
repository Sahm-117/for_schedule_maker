import React from 'react';

/** Marks a support who looks after teens (the built-in Teen Support tag). */
const TeenSupportPill: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center rounded-full bg-pink-100/80 px-2 py-0.5 text-[10px] font-semibold text-pink-700 ${className}`}>Teen Support</span>
);

export default TeenSupportPill;
