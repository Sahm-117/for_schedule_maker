import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { useSignedFileUrls } from '../hooks/useSignedFileUrls';

// Resources for participants: guides the FOF team chose to share, and each week's
// class material once it has been released to them: the manual (opened on its week page,
// the same way as "Open the manual" on Home) and the recap document. Matches the V2 design.

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
  // Private files get a signed link to open (rule 129); links and public files are unchanged.
  const resources = useSignedFileUrls(home?.resources ?? [], 'resource');

  if (loading || !home) return <PageLoader />;

  const classMaterials = home.weeks.filter((week) => week.manual?.documentUrl || (week.released && week.recapDocumentUrl));
  const ROW = 'flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-3 text-left hover:border-[#ffdeca]';
  const rowText = (title: string, sub: string) => (
    <>
      <Icon d={FILE} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-gray-900">{title}</span>
        <span className="block truncate text-xs text-gray-500">{sub}</span>
      </span>
    </>
  );

  return (
    <div className="max-w-2xl lg:max-w-5xl">
      <PageHeader title="Resources" tourId="participant:resources" />
      <div className="flex flex-col gap-4 desktop-cols">
        <section data-wt="pr-guides" className={CARD}>
          <h2 className="text-base font-bold text-gray-900">General guides</h2>
          {resources.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-500">Nothing shared yet.</p>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2">
              {resources.map((resource) => {
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
                  // A private file opens once its link has arrived (an empty url means not yet).
                  <button key={resource.id} type="button" disabled={!resource.url} aria-busy={!resource.url} onClick={() => setViewing({ url: resource.url, title: resource.title, fileName: resource.fileName })} className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] p-3 text-left hover:border-[#ffdeca] disabled:opacity-60">{content}</button>
                );
              })}
            </div>
          )}
        </section>

        <section data-wt="pr-materials" className={CARD}>
          <h2 className="text-base font-bold text-gray-900">Class materials</h2>
          {classMaterials.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-500">Each class manual appears here when it’s released, usually on the class Sunday.</p>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2">
              {classMaterials.map((week) => {
                const title = week.title || `Week ${week.weekNumber}`;
                return (
                  <React.Fragment key={week.id}>
                    {week.manual?.documentUrl && (
                      <NavLink to={`/me/week/${week.weekNumber}?manual=1`} className={ROW}>{rowText(title, `Week ${week.weekNumber} manual`)}</NavLink>
                    )}
                    {week.released && week.recapDocumentUrl && (
                      <button
                        type="button"
                        onClick={() => setViewing({ url: week.recapDocumentUrl!, title: `Week ${week.weekNumber} recap`, fileName: week.recapDocumentName })}
                        className={ROW}
                      >
                        {rowText(title, `Week ${week.weekNumber} recap`)}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <DocumentViewerSheet open={!!viewing} url={viewing?.url ?? null} title={viewing?.title ?? ''} fileName={viewing?.fileName} onClose={() => setViewing(null)} />
    </div>
  );
};

export default ParticipantResourcesPage;
