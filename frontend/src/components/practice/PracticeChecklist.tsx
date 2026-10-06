import React from 'react';
import { NavLink } from 'react-router-dom';
import type { PracticeScenario } from '../../constants/practiceScenarios';
import type { PracticeProgressItem } from '../../types';

// One scenario list: tick when done, flag when stuck. Compact, Apple-leaning.
const PracticeChecklist: React.FC<{
  scenarios: PracticeScenario[];
  items: PracticeProgressItem[];
  onChange: (key: string, done: boolean, stuck: boolean) => void;
  onNavigate?: () => void;
}> = ({ scenarios, items, onChange, onNavigate }) => {
  const byKey = new Map(items.map((item) => [item.key, item]));
  return (
    <ul className="divide-y divide-gray-100">
      {scenarios.map((scenario) => {
        const entry = byKey.get(scenario.key);
        const done = !!entry?.doneAt;
        const stuck = !!entry?.stuckAt;
        return (
          <li key={scenario.key} className="flex items-start gap-3 py-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={`${scenario.title}: ${done ? 'done' : 'not done'}`}
              onClick={() => onChange(scenario.key, !done, false)}
              className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border-2 transition ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white text-transparent'}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-semibold leading-snug ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{scenario.title}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-gray-500">{scenario.hint}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                {scenario.to ? (
                  <NavLink to={scenario.to} onClick={onNavigate} className="text-[12.5px] font-semibold text-primary">Go there</NavLink>
                ) : (
                  <span className="text-[12px] leading-snug text-gray-500">No shortcut for this one. Find it yourself in the app.</span>
                )}
                <button
                  type="button"
                  onClick={() => onChange(scenario.key, false, !stuck)}
                  aria-pressed={stuck}
                  className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${stuck ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  {stuck ? 'Stuck. Tap to clear' : 'I am stuck'}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default PracticeChecklist;
