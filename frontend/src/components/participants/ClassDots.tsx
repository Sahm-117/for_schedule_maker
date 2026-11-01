import React from 'react';
import Glyph from '../Glyph';
import type { ClassRecord } from '../../utils/participantClassDots';

const DOT: Record<string, string> = {
  attended: 'bg-emerald-500',
  absent: 'bg-red-500',
  excused: 'bg-neutral-300',
  none: 'bg-neutral-200',
};

interface ClassDotsProps {
  record: ClassRecord | undefined;
  /** Leave out the "N of M" text and warning (the side panel writes them out). */
  dotsOnly?: boolean;
}

/** One dot per finished class: green = attended, red = absent, grey = excused, pale grey = no mark. Then "N of M" and an amber warning after two misses in a row. */
const ClassDots: React.FC<ClassDotsProps> = ({ record, dotsOnly }) => {
  if (!record) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1" role="img" aria-label={`${record.attended} of ${record.counted} classes attended`}>
        {record.dots.map((d) => (
          <span key={d.weekNumber} title={`Week ${d.weekNumber}: ${d.label}`} className={`inline-block h-2.5 w-2.5 flex-none rounded-full ${DOT[d.state]}`} />
        ))}
      </span>
      {!dotsOnly && (
        <>
          <span className="whitespace-nowrap text-xs font-medium text-gray-600">{record.counted > 0 ? `${record.attended} of ${record.counted}` : 'No marks yet'}</span>
          {record.missedTwo && (
            <span title="Missed the last two classes in a row" className="inline-flex text-amber-600">
              <Glyph name="warning" className="h-3.5 w-3.5" />
              <span className="sr-only">Missed 2 in a row</span>
            </span>
          )}
        </>
      )}
    </span>
  );
};

export default ClassDots;

/** Key for the class dots, shown beside the participant count. */
export const ClassDotsLegend: React.FC = () => (
  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500" aria-label="Class dots key">
    {([['attended', 'Attended (incl. late, left early)'], ['absent', 'Absent'], ['excused', 'Excused'], ['none', 'No mark']] as const).map(([k, label]) => (
      <span key={k} className="inline-flex items-center gap-1.5"><span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[k]}`} />{label}</span>
    ))}
    <span className="inline-flex items-center gap-1 text-amber-700"><Glyph name="warning" className="h-3.5 w-3.5" />Missed 2 in a row</span>
  </p>
);
