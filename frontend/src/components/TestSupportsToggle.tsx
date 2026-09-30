import React from 'react';

// A quiet checkbox under a "pick a support" dropdown. Test supports are left
// out of those lists by default; this brings them back for an admin who really
// does need to assign to one.
const TestSupportsToggle: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; className?: string }> = ({ checked, onChange, className = '' }) => (
  <label className={`inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-500 ${className}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 accent-primary" />
    Show test supports
  </label>
);

export default TestSupportsToggle;
