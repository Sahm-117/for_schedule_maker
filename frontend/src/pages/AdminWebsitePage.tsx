import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { settingsApi } from '../services/api';
import LandingImagesCard from '../components/landing/LandingImagesCard';
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_ICON_OPTIONS,
  resolveLandingContent,
  type LandingContent,
  type LandingIconKey,
} from '../components/landing/landingContent';

// Settings > Website — every piece of copy on the public fof.tcnikorodu.org
// landing page (frontend/src/pages/LandingPage.tsx), editable in one place.
// Saved as a single JSON blob on the 'landing_content' AppSetting; the
// landing page (and this editor) both fill in anything missing with
// DEFAULT_LANDING_CONTENT via resolveLandingContent/deepMerge, so a partial
// save — or none at all — still renders correctly.

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const TABS: Array<{ key: keyof LandingContent | 'photos'; label: string }> = [
  { key: 'hero', label: 'Hero' },
  { key: 'about', label: 'About' },
  { key: 'curriculum', label: 'Curriculum' },
  { key: 'photos', label: 'Photos' },
  { key: 'howItWorks', label: 'How it works' },
  { key: 'journey', label: 'Journey' },
  { key: 'faq', label: 'FAQ' },
  { key: 'footer', label: 'Closing & footer', shortLabel: 'Footer' },
];

// ---- shared field primitives -----------------------------------------------

const inputCls = 'w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-semibold text-gray-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
  </label>
);

const TextInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
);

const TextArea: React.FC<{ value: string; onChange: (v: string) => void; rows?: number }> = ({ value, onChange, rows = 3 }) => (
  <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className={inputCls} />
);

const SectionCard: React.FC<{ title: string; description?: string; onReset: () => void; children: React.ReactNode }> = ({ title, description, onReset, children }) => (
  <div className="surface-card p-6">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      <button type="button" onClick={onReset} className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-400 underline underline-offset-2 hover:text-gray-600">
        Reset to default
      </button>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

// Generic add/remove/reorder list editor — used for every list-shaped field
// (headline lines, facts, curriculum items, cards, steps, FAQs, social
// links...). `renderItem` gets the whole item and a setter that replaces it.
function ListEditor<T>({
  items, onChange, renderItem, newItem, addLabel, minItems = 0,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, setItem: (next: T) => void) => React.ReactNode;
  newItem: () => T;
  addLabel: string;
  minItems?: number;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => {
    if (items.length <= minItems) return;
    onChange(items.filter((_, idx) => idx !== i));
  };
  const setItem = (i: number, next: T) => onChange(items.map((it, idx) => (idx === i ? next : it)));

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-2xl border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">#{i + 1}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="h-7 w-7 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30" title="Move up">&uarr;</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="h-7 w-7 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30" title="Move down">&darr;</button>
              <button type="button" onClick={() => remove(i)} disabled={items.length <= minItems} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-30">Remove</button>
            </div>
          </div>
          {renderItem(item, (next) => setItem(i, next))}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, newItem()])} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">
        {addLabel}
      </button>
    </div>
  );
}

const IconPicker: React.FC<{ value: LandingIconKey; onChange: (v: LandingIconKey) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {LANDING_ICON_OPTIONS.map((opt) => (
      <button
        key={opt.key}
        type="button"
        onClick={() => onChange(opt.key)}
        aria-pressed={value === opt.key}
        title={opt.label}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
          value === opt.key ? 'border-primary bg-primary-soft text-primary-dark' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
        }`}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={opt.d} />
        </svg>
      </button>
    ))}
  </div>
);

// ---- page -------------------------------------------------------------------

const AdminWebsitePage: React.FC = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<string>('hero');
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [savedContent, setSavedContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsApi.getLandingContent()
      .then((raw) => {
        if (cancelled) return;
        const resolved = resolveLandingContent(raw);
        setContent(resolved);
        setSavedContent(resolved);
      })
      .catch(() => { /* defaults already loaded */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const dirty = JSON.stringify(content) !== JSON.stringify(savedContent);

  const patch = <K extends keyof LandingContent>(key: K, value: LandingContent[K]) => {
    setContent((c) => ({ ...c, [key]: value }));
  };
  const resetSection = (key: keyof LandingContent) => {
    setContent((c) => ({ ...c, [key]: deepClone(DEFAULT_LANDING_CONTENT[key]) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.setLandingContent(content as unknown as Record<string, unknown>);
      setSavedContent(content);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save the website.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const handleCancel = () => setContent(savedContent);

  const handleResetAll = async () => {
    setResettingAll(true);
    try {
      const defaults = deepClone(DEFAULT_LANDING_CONTENT);
      await settingsApi.setLandingContent(defaults as unknown as Record<string, unknown>);
      setContent(defaults);
      setSavedContent(defaults);
      setResetAllOpen(false);
      toast({ message: 'Website reset to default.', tone: 'success' });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not reset the website.', tone: 'error' });
    } finally {
      setResettingAll(false);
    }
  };

  const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const homepageUrl = isLocal ? '/' : 'https://fof.tcnikorodu.org';

  return (
    <div>
      <PageHeader
        title="Website"
        subtitle="Edit the words shown on the public fof.tcnikorodu.org homepage."
        action={(
          <AppOverflowMenu
            items={[
              { label: 'View homepage', onClick: () => window.open(homepageUrl, '_blank', 'noopener') },
              { label: 'Reset all to default', onClick: () => setResetAllOpen(true), tone: 'danger' },
            ]}
          />
        )}
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner className="h-6 w-6 text-gray-400" />
        </div>
      ) : (
        <>
          <SegmentedTabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={setTab} />

          <div className="mt-4 space-y-4 pb-8">
            {tab === 'hero' && (
              <>
                <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  The Register link is set in Follow-ups &rarr; Message bank. The next cohort date updates automatically.
                </div>
                <SectionCard title="Hero" description="The first thing a visitor sees." onReset={() => resetSection('hero')}>
                  <Field label="Headline lines (shown in white, top to bottom)">
                    <ListEditor
                      items={content.hero.lines}
                      onChange={(lines) => patch('hero', { ...content.hero, lines })}
                      renderItem={(item, setItem) => <TextInput value={item} onChange={setItem} />}
                      newItem={() => 'New line'}
                      addLabel="+ Add line"
                      minItems={1}
                    />
                  </Field>
                  <Field label="Last line (shown in orange)">
                    <TextInput value={content.hero.accentLine} onChange={(v) => patch('hero', { ...content.hero, accentLine: v })} />
                  </Field>
                  <Field label="Subtitle">
                    <TextArea value={content.hero.subtitle} onChange={(v) => patch('hero', { ...content.hero, subtitle: v })} />
                  </Field>
                  <Field label="Quick facts (e.g. “10 weeks”)">
                    <ListEditor
                      items={content.hero.facts}
                      onChange={(facts) => patch('hero', { ...content.hero, facts })}
                      renderItem={(item, setItem) => <TextInput value={item} onChange={setItem} />}
                      newItem={() => 'New fact'}
                      addLabel="+ Add fact"
                      minItems={1}
                    />
                  </Field>
                  <Field label="Scroll hint label">
                    <TextInput value={content.hero.scrollLabel} onChange={(v) => patch('hero', { ...content.hero, scrollLabel: v })} />
                  </Field>
                </SectionCard>
              </>
            )}

            {tab === 'about' && (
              <SectionCard title="About" description="The scrolling paragraph and the three stats underneath it." onReset={() => resetSection('about')}>
                <Field label="Paragraph (each piece appears one after another as the visitor scrolls)">
                  <ListEditor
                    items={content.about.segments}
                    onChange={(segments) => patch('about', { ...content.about, segments })}
                    renderItem={(item, setItem) => (
                      <div className="space-y-2">
                        <TextArea value={item.text} rows={2} onChange={(text) => setItem({ ...item, text })} />
                        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                          <input type="checkbox" checked={item.strong} onChange={(e) => setItem({ ...item, strong: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                          Bold
                        </label>
                      </div>
                    )}
                    newItem={() => ({ text: 'New phrase', strong: false })}
                    addLabel="+ Add phrase"
                    minItems={1}
                  />
                </Field>
                <Field label="Stats" hint="Always exactly three, to match the page layout.">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {content.about.stats.map((stat, i) => (
                      <div key={i} className="rounded-2xl border border-gray-200 p-3 space-y-2">
                        <TextInput value={stat.value} onChange={(value) => {
                          const stats = content.about.stats.map((s, idx) => (idx === i ? { ...s, value } : s));
                          patch('about', { ...content.about, stats });
                        }} placeholder="Value, e.g. 10" />
                        <TextInput value={stat.suffix} onChange={(suffix) => {
                          const stats = content.about.stats.map((s, idx) => (idx === i ? { ...s, suffix } : s));
                          patch('about', { ...content.about, stats });
                        }} placeholder="Mark after it, e.g. ." />
                        <TextArea rows={2} value={stat.caption} onChange={(caption) => {
                          const stats = content.about.stats.map((s, idx) => (idx === i ? { ...s, caption } : s));
                          patch('about', { ...content.about, stats });
                        }} />
                      </div>
                    ))}
                  </div>
                </Field>
              </SectionCard>
            )}

            {tab === 'curriculum' && (
              <SectionCard title="Curriculum" description="“What you’ll learn” — the ten-week class list." onReset={() => resetSection('curriculum')}>
                <Field label="Intro line">
                  <TextInput value={content.curriculum.intro} onChange={(v) => patch('curriculum', { ...content.curriculum, intro: v })} />
                </Field>
                <Field label="Classes">
                  <ListEditor
                    items={content.curriculum.items}
                    onChange={(items) => patch('curriculum', { ...content.curriculum, items })}
                    renderItem={(item, setItem) => (
                      <div className="space-y-2">
                        <TextInput value={item.title} onChange={(title) => setItem({ ...item, title })} placeholder="Title" />
                        <TextArea value={item.description} onChange={(description) => setItem({ ...item, description })} placeholder="Description" />
                      </div>
                    )}
                    newItem={() => ({ title: 'New class', description: '' })}
                    addLabel="+ Add class"
                    minItems={1}
                  />
                </Field>
              </SectionCard>
            )}

            {tab === 'photos' && (
              <>
                <LandingImagesCard />
                <SectionCard title="Photo captions" description="The small labels under each photo." onReset={() => patch('photos', deepClone(DEFAULT_LANDING_CONTENT.photos))}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Sunday class photo — label">
                      <TextInput value={content.photos.classLabel} onChange={(v) => patch('photos', { ...content.photos, classLabel: v })} />
                    </Field>
                    <Field label="Sunday class photo — location">
                      <TextInput value={content.photos.classLocation} onChange={(v) => patch('photos', { ...content.photos, classLocation: v })} />
                    </Field>
                    <Field label="Small group photo — label">
                      <TextInput value={content.photos.groupLabel} onChange={(v) => patch('photos', { ...content.photos, groupLabel: v })} />
                    </Field>
                    <Field label="Small group photo — location">
                      <TextInput value={content.photos.groupLocation} onChange={(v) => patch('photos', { ...content.photos, groupLocation: v })} />
                    </Field>
                  </div>
                </SectionCard>
              </>
            )}

            {tab === 'howItWorks' && (
              <SectionCard title="How it works" description="The five cards explaining the weekly rhythm." onReset={() => resetSection('howItWorks')}>
                <Field label="Intro line">
                  <TextArea value={content.howItWorks.intro} onChange={(v) => patch('howItWorks', { ...content.howItWorks, intro: v })} />
                </Field>
                <Field label="Cards">
                  <ListEditor
                    items={content.howItWorks.cards}
                    onChange={(cards) => patch('howItWorks', { ...content.howItWorks, cards })}
                    renderItem={(item, setItem) => (
                      <div className="space-y-2">
                        <TextInput value={item.title} onChange={(title) => setItem({ ...item, title })} placeholder="Title" />
                        <TextArea value={item.body} onChange={(body) => setItem({ ...item, body })} placeholder="Description" />
                        <IconPicker value={item.icon} onChange={(icon) => setItem({ ...item, icon })} />
                      </div>
                    )}
                    newItem={() => ({ title: 'New card', body: '', icon: 'calendar' })}
                    addLabel="+ Add card"
                    minItems={1}
                  />
                </Field>
              </SectionCard>
            )}

            {tab === 'journey' && (
              <SectionCard title="Your journey" description="The step-by-step path shown as a rail." onReset={() => resetSection('journey')}>
                <Field label="Steps, in order">
                  <ListEditor
                    items={content.journey.steps}
                    onChange={(steps) => patch('journey', { steps })}
                    renderItem={(item, setItem) => <TextInput value={item} onChange={setItem} />}
                    newItem={() => 'New step'}
                    addLabel="+ Add step"
                    minItems={1}
                  />
                </Field>
              </SectionCard>
            )}

            {tab === 'faq' && (
              <SectionCard title="FAQ" description="“Good questions” — the accordion." onReset={() => resetSection('faq')}>
                <Field label="Title">
                  <TextInput value={content.faq.title} onChange={(v) => patch('faq', { ...content.faq, title: v })} />
                </Field>
                <Field label="Intro" hint='The words "log in here" are added automatically afterwards as a working link — no need to type them.'>
                  <TextArea value={content.faq.intro} onChange={(v) => patch('faq', { ...content.faq, intro: v })} />
                </Field>
                <Field label="Questions">
                  <ListEditor
                    items={content.faq.items}
                    onChange={(items) => patch('faq', { ...content.faq, items })}
                    renderItem={(item, setItem) => (
                      <div className="space-y-2">
                        <TextInput value={item.question} onChange={(question) => setItem({ ...item, question })} placeholder="Question" />
                        <TextArea value={item.answer} onChange={(answer) => setItem({ ...item, answer })} placeholder="Answer" />
                      </div>
                    )}
                    newItem={() => ({ question: 'New question', answer: '' })}
                    addLabel="+ Add question"
                    minItems={1}
                  />
                </Field>
              </SectionCard>
            )}

            {tab === 'footer' && (
              <SectionCard title="Closing & footer" description="The “Ready to start?” band and the footer underneath it." onReset={() => { resetSection('cta'); resetSection('footer'); }}>
                <Field label="Closing band title">
                  <TextInput value={content.cta.title} onChange={(v) => patch('cta', { ...content.cta, title: v })} />
                </Field>
                <Field label="Closing band text">
                  <TextArea value={content.cta.body} onChange={(v) => patch('cta', { ...content.cta, body: v })} />
                </Field>
                <Field label="Address">
                  <TextInput value={content.footer.address} onChange={(v) => patch('footer', { ...content.footer, address: v })} />
                </Field>
                <Field label="Service times">
                  <TextInput value={content.footer.serviceTimes} onChange={(v) => patch('footer', { ...content.footer, serviceTimes: v })} />
                </Field>
                <Field label="Social &amp; site links">
                  <ListEditor
                    items={content.footer.social}
                    onChange={(social) => patch('footer', { ...content.footer, social })}
                    renderItem={(item, setItem) => (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <TextInput value={item.label} onChange={(label) => setItem({ ...item, label })} placeholder="Label, e.g. Instagram" />
                        <TextInput value={item.url} onChange={(url) => setItem({ ...item, url })} placeholder="https://…" />
                      </div>
                    )}
                    newItem={() => ({ label: 'New link', url: 'https://' })}
                    addLabel="+ Add link"
                  />
                </Field>
                <Field label="Bottom tagline">
                  <TextInput value={content.footer.bottomTagline} onChange={(v) => patch('footer', { ...content.footer, bottomTagline: v })} />
                </Field>
              </SectionCard>
            )}
          </div>

          <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border-t border-gray-100 bg-white/80 px-4 py-3 shadow-lg backdrop-blur-xl">
            <span className="text-[13px] font-medium text-gray-700">
              {dirty ? 'Unsaved changes' : savedFlash ? '✓ Saved' : 'No changes'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={!dirty || saving}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving && <Spinner className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmationModal
        isOpen={resetAllOpen}
        onClose={() => setResetAllOpen(false)}
        onConfirm={() => void handleResetAll()}
        title="Reset the whole website to default?"
        message="This replaces every section's wording with the original text and saves it immediately. This can't be undone."
        confirmText="Reset everything"
        type="danger"
        confirmLoading={resettingAll}
      />
    </div>
  );
};

export default AdminWebsitePage;
