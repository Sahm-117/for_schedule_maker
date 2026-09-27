import React from 'react';

// A support's two answers after a pre-cohort training.
const LearnedAnswers: React.FC<{ learned: string; willApply?: string | null }> = ({ learned, willApply }) => (
  <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-white px-3 py-2 text-xs text-gray-700 ring-1 ring-gray-100">
    <p><span className="font-semibold text-gray-500">What they learned: </span>{learned}</p>
    {willApply && <p><span className="font-semibold text-gray-500">What they'll apply: </span>{willApply}</p>}
  </div>
);

export default LearnedAnswers;
