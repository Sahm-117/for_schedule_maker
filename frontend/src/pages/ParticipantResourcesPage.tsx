import React, { useState } from 'react';
import PageHeader from '../components/PageHeader';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import { useParticipantApp } from '../context/ParticipantAppContext';

// Resources for participants: guides the FOF team chose to share, and each week's
// class material once it has been released to them. Matches the V2 design.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const Icon: React.FC<{ d: string }> = ({ d }) => (
  <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#fff1e7] text-[#c2410c]" aria-hidden="true">
    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={d} /></svg>
  </span>
);

const BOOK = 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z';
const FILE = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5';

const TYPE_LABEL: Record<string, string> = { link: 'Link', pdf: 'PDF', doc: 'Document', image: 'Image', file: 'File' };

const ParticipantResourcesPage: React.FC = () => {
  const { home, loading } = useParticipantApp();
  const [viewing, setViewing] = useState<{ url: string; title: string; fileName?: string | null } | null>(null);

  if (loading || !home) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;

  const classMaterials = home.weeks.filter((week) => week.released && week.recapDocumentUrl);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Resources" subtitle="Class materials and guides posted by the FOF team." />
      <div className="flex flex-col gap-4">
        <section className={CARD}>
          <h2 className="text-base font-bold text-gray-900">General guides</h2>
          {home.resources.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-500">Nothing shared yet.</p>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2">
              {home.resources.map((resource) => {
                const isLink = resource.type === 'link';
                const content = (
                  <>
                    <Icon d={BOOK} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-gray-900">{resource.title}</span>
                      <span className="block truncate text-xs text-gray-500">{resource.description || TYPE_LABEL[resource.type] || 'Resource'}</span>
                    </span>
                  </>
                );
                return isLink ? (
                  <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-3 text-left hover:border-[#ffdeca]">{content}</a>
                ) : (
                  <button key={resource.id} type="button" onClick={() => setViewing({ url: resource.url, title: resource.title, fileName: resource.fileName })} className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-3 text-left hover:border-[#ffdeca]">{content}</button>
                );
              })}
            </div>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-base font-bold text-gray-900">Class materials</h2>
          {classMaterials.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-500">Each week&apos;s material appears here once it is released to you.</p>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2">
              {classMaterials.map((week) => (
                <button
                  key={week.id}
                  type="button"
                  onClick={() => setViewing({ url: week.recapDocumentUrl!, title: `Week ${week.weekNumber} recap`, fileName: week.recapDocumentName })}
                  className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-3 text-left hover:border-[#ffdeca]"
                >
                  <Icon d={FILE} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-gray-900">{week.title || `Week ${week.weekNumber}`}</span>
                    <span className="block truncate text-xs text-gray-500">Week {week.weekNumber} recap</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <DocumentViewerSheet open={!!viewing} url={viewing?.url ?? null} title={viewing?.title ?? ''} fileName={viewing?.fileName} onClose={() => setViewing(null)} />
    </div>
  );
};

export default ParticipantResourcesPage;
