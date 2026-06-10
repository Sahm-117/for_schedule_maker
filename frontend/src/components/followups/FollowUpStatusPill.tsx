import React from 'react';

const FollowUpStatusPill: React.FC<{ label: string; tone: string }> = ({ label, tone }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
    {label}
  </span>
);

export default FollowUpStatusPill;
