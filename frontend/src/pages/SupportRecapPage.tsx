import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import { useAppData } from '../context/AppDataContext';
import { supportRecapsApi } from '../services/api';
import type { SupportRecap } from '../types';
import { formatRecapReleaseAt } from '../utils/recapReleaseTimes';

// This week's recap first, then past weeks. Before a week's support release
// time, its content is withheld and the card just says when it arrives.

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const SupportRecapPage: React.FC = () => {
  const { activeCohort } = useAppData();
  const [recaps, setRecaps] = useState<SupportRecap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<{ url: string; title: string; fileName?: string | null } | null>(null);

  useEffect(() => {
    if (!activeCohort?.id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    supportRecapsApi.getForCohort(activeCohort.id)
      .then((res) => { if (!cancelled) setRecaps(res.recaps); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load recaps.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeCohort?.id]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="This week's recap" subtitle="What each class covered, for you to bring to your group." />

      {loading ? (
        <p className="py-16 text-center text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="py-16 text-center text-sm text-red-600">{error}</p>
      ) : recaps.length === 0 ? (
        <section className={`${CARD} px-[22px] py-[34px] text-center`}>
          <p className="text-[15px] font-bold text-gray-900">No recaps yet</p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[13.5px] leading-[1.55] text-gray-500">Once a class recap is added, it will show up here.</p>
        </section>
      ) : (
        <div className="flex flex-col gap-3.5">
          {recaps.map((week) => (
            <section key={week.weekId} data-wt="support-recap-week" className={`${CARD} overflow-hidden`}>
              <div className="px-5 pt-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Week {week.weekNumber}</span>
                  <span className={`ml-auto rounded-full px-[9px] py-[3px] text-[11px] font-bold ${week.released ? 'bg-[#f2fbf5] text-[#15803d]' : 'bg-amber-100/80 text-amber-700'}`}>
                    {week.released ? 'Released' : 'Not out yet'}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-bold tracking-[-0.01em] text-gray-900">{week.title || `Week ${week.weekNumber}`}</h2>

                {week.released ? (
                  <>
                    {week.recapSummary?.trim() && (
                      <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.65] text-gray-700">{week.recapSummary.trim()}</p>
                    )}
                    {week.discussionPrompt?.trim() && (
                      <div className="mt-3 rounded-[14px] border border-[#f1f2f5] p-3.5">
                        <p className="text-[13px] font-bold text-gray-900">Something to think about</p>
                        <p className="mt-1 text-sm leading-normal text-gray-700">{week.discussionPrompt.trim()}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-500">Arrives {formatRecapReleaseAt(week.releasedAt ? new Date(week.releasedAt) : null)}</p>
                )}
              </div>
              {week.released && week.recapDocumentUrl && (
                <div className="px-5 pb-5 pt-4">
                  <button
                    type="button"
                    onClick={() => setDoc({ url: week.recapDocumentUrl as string, title: `Week ${week.weekNumber} recap`, fileName: week.recapDocumentName })}
                    className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-white"
                  >
                    <svg className="h-[18px] w-[18px] flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.5A3.5 3.5 0 0 0 8.5 3H4v14h5a3 3 0 0 1 3 3m0-13.5A3.5 3.5 0 0 1 15.5 3H20v14h-5a3 3 0 0 0-3 3m0-13.5V20" />
                    </svg>
                    Read the full recap
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <DocumentViewerSheet
        open={!!doc}
        url={doc?.url ?? null}
        title={doc?.title ?? ''}
        fileName={doc?.fileName}
        onClose={() => setDoc(null)}
      />
    </div>
  );
};

export default SupportRecapPage;
