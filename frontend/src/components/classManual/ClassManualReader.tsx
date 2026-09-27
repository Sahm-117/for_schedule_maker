import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Clarity from '@microsoft/clarity';
import type { ManualContent, ManualItem, ManualPanel, ManualSpeaker } from './types';
import { CLASS_MANUAL_COVER_ART, CLASS_MANUAL_END_CARD_ART, CLASS_MANUAL_SCENE_ART, CLASS_MANUAL_SVG_DEFS } from './ClassManualArt';
import './ClassManualReader.css';

export interface ClassManualReaderProps {
  content: ManualContent;
  onOpenOriginalPdf?: () => void;
  renderEndCard?: () => ReactNode;
  onClose?: () => void;
}

type TextSize = 'Regular' | 'Large' | 'Extra large';

interface ReaderSettings {
  textSize: TextSize;
  showScenes: boolean;
  gentleMotion: boolean;
}

const TEXT_SIZES: TextSize[] = ['Regular', 'Large', 'Extra large'];
const BASE_SIZE_PX: Record<TextSize, string> = { Regular: '17px', Large: '19px', 'Extra large': '21px' };
const DEFAULT_SETTINGS: ReaderSettings = { textSize: 'Regular', showScenes: true, gentleMotion: true };
const SETTINGS_KEY = 'classManual:settings';
const positionKey = (id: string) => `classManual:${id}:chapter`;

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      textSize: TEXT_SIZES.includes(parsed.textSize) ? parsed.textSize : DEFAULT_SETTINGS.textSize,
      showScenes: typeof parsed.showScenes === 'boolean' ? parsed.showScenes : DEFAULT_SETTINGS.showScenes,
      gentleMotion: typeof parsed.gentleMotion === 'boolean' ? parsed.gentleMotion : DEFAULT_SETTINGS.gentleMotion,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore write failures (private mode, storage full, etc.)
  }
}

function loadChapter(id: string, max: number): number {
  try {
    const raw = localStorage.getItem(positionKey(id));
    const v = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isNaN(v) && v >= 0 && v <= max) return v;
  } catch {
    // ignore
  }
  return 0;
}

function saveChapter(id: string, ch: number) {
  try {
    localStorage.setItem(positionKey(id), String(ch));
  } catch {
    // ignore
  }
}

function SpeakerAvatar({ who }: { who?: ManualSpeaker }) {
  const id = `fig${who ?? 'A'}`;
  return (
    <div className="cmr-avatar" aria-hidden="true">
      <svg viewBox="6 8 48 48">
        <use href={`#${id}`} width="60" height="120" />
      </svg>
    </div>
  );
}

function ManualItemView({ item }: { item: ManualItem }) {
  switch (item.type) {
    case 'heading':
      return <h3 className="cmr-item-heading">{item.text}</h3>;
    case 'caption':
      return (
        <div className="cmr-item-caption">
          <p>{item.text}</p>
        </div>
      );
    case 'speech':
      return (
        <div className="cmr-item-speech">
          <SpeakerAvatar who={item.who} />
          <div className="cmr-speech-bubble">
            <p>{item.text}</p>
          </div>
        </div>
      );
    case 'scripture':
      return (
        <figure className="cmr-item-scripture">
          <div className="cmr-scripture-tear" aria-hidden="true" />
          <div className="cmr-scripture-body">
            <blockquote>{item.text}</blockquote>
            <figcaption>{item.ref}</figcaption>
          </div>
          <div className="cmr-scripture-tear" aria-hidden="true" />
        </figure>
      );
    case 'callout':
      return (
        <div className="cmr-item-callout" aria-hidden="true">
          {item.text}
        </div>
      );
    case 'list':
      return (
        <ul className="cmr-item-list">
          {item.entries.map((entry, i) => (
            <li key={i}>
              <span className="cmr-list-bullet" aria-hidden="true" />
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      );
    case 'reflist':
      return (
        <div className="cmr-item-reflist">
          <div className="cmr-reflist-label">{item.label}</div>
          <p>{item.text}</p>
        </div>
      );
    default:
      return null;
  }
}

function PanelView({ panel, showScenes }: { panel: ManualPanel; showScenes: boolean }) {
  const sceneMarkup = panel.scene ? CLASS_MANUAL_SCENE_ART[panel.scene] : null;
  return (
    <div className="cmr-panel" data-panel="1">
      {showScenes && sceneMarkup && (
        <div className="cmr-panel-scene">
          <svg viewBox="0 0 360 180" role="img" aria-label="Illustration" dangerouslySetInnerHTML={{ __html: sceneMarkup }} />
        </div>
      )}
      <div className="cmr-panel-items">
        {panel.items.map((item, i) => (
          <ManualItemView key={i} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function ClassManualReader({ content, onOpenOriginalPdf, renderEndCard, onClose }: ClassManualReaderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  const n = content.chapters.length;
  const [ch, setCh] = useState(() => loadChapter(content.id, n));
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const chapter = ch > 0 ? content.chapters[ch - 1] : null;
  const isCover = ch === 0;
  const isChapter = ch > 0;

  const titleOf = useCallback((i: number) => (i === 0 ? content.cover.title : content.chapters[i - 1].title), [content]);

  const go = useCallback(
    (index: number) => {
      const v = Math.max(0, Math.min(n, index));
      setCh(v);
      saveChapter(content.id, v);
      scrollRef.current?.scrollTo({ top: 0 });
      headingRef.current?.focus();
    },
    [content.id, n],
  );

  // Native dialog: show on mount, notify parent on any close (Escape included).
  useEffect(() => {
    const modal = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (modal && !modal.open) modal.showModal();
    document.body.style.overflow = 'hidden';
    // No modal.close() here: its async "close" event would reach onClose and shut the
    // reader straight after StrictMode's remount. Unmounting removes it from the top layer.
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Fade-in motion for panels currently on screen, mirroring the source design's IntersectionObserver.
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const root = rootRef.current;
    if (!root) return;
    const run = () => {
      ioRef.current?.disconnect();
      const els = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));
      if (reduce || !settings.gentleMotion || !('IntersectionObserver' in window)) {
        els.forEach((el) => {
          el.style.opacity = '';
          el.style.transform = '';
          el.style.transition = '';
        });
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              (entry.target as HTMLElement).style.opacity = '1';
              (entry.target as HTMLElement).style.transform = 'none';
              io.unobserve(entry.target);
            }
          });
        },
        { root: scrollRef.current, rootMargin: '0px 0px -6% 0px' },
      );
      ioRef.current = io;
      els.forEach((el) => {
        const viewportHeight = scrollRef.current?.clientHeight ?? window.innerHeight;
        if (el.getBoundingClientRect().top < viewportHeight) {
          el.style.opacity = '1';
          el.style.transform = 'none';
          return;
        }
        el.style.transition = 'opacity .5s ease, transform .5s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(14px)';
        io.observe(el);
      });
    };
    const raf = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(raf);
      ioRef.current?.disconnect();
    };
  }, [ch, settings.gentleMotion]);

  // Click away closes the settings popover. Escape is handled on the dialog's onCancel below,
  // since a native <dialog>'s Escape-to-close is a UA default action that a document keydown
  // listener cannot reliably intercept — preventDefault() on cancel is the correct hook.
  useEffect(() => {
    if (!settingsOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (settingsButtonRef.current?.contains(e.target)) return;
      const panel = rootRef.current?.querySelector('.cmr-settings-panel');
      if (panel && !panel.contains(e.target)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onClickAway, true);
    return () => document.removeEventListener('mousedown', onClickAway, true);
  }, [settingsOpen]);

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const progressPct = Math.round((ch / n) * 100);
  const barLabel = ch === 0 ? content.classLabel : `Chapter ${ch} of ${n}`;
  const barTitle = titleOf(ch);
  const baseSize = BASE_SIZE_PX[settings.textSize];
  const hasPrev = ch > 0;
  const hasNext = ch < n;

  const tabs = useMemo(
    () => [
      { id: 0, label: 'Cover', aria: content.cover.title },
      ...content.chapters.map((c, i) => ({ id: i + 1, label: c.tab, aria: `Chapter ${i + 1}: ${c.title}` })),
    ],
    [content],
  );

  const handleTab = (id: number) => {
    go(id);
    Clarity.event('manual_chapter_tab');
  };
  const handleOutline = (id: number) => {
    go(id);
    Clarity.event('manual_outline_jump');
  };
  const handlePrev = () => {
    go(ch - 1);
    Clarity.event('manual_chapter_prev');
  };
  const handleNext = () => {
    go(ch + 1);
    Clarity.event(ch === 0 ? 'manual_start_reading' : 'manual_chapter_next');
  };
  const handlePdf = () => {
    onOpenOriginalPdf?.();
    Clarity.event('manual_pdf_opened');
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="cmr-dialog"
      aria-labelledby="class-manual-title"
      onCancel={(e) => {
        if (settingsOpen) {
          e.preventDefault();
          setSettingsOpen(false);
          settingsButtonRef.current?.focus();
          return;
        }
        onClose?.();
      }}
      onClose={() => onClose?.()}
    >
      <div ref={rootRef} className="class-manual-reader">
        <svg width="0" height="0" aria-hidden="true" className="cmr-defs">
          <defs dangerouslySetInnerHTML={{ __html: CLASS_MANUAL_SVG_DEFS }} />
        </svg>

        <div className="cmr-topbar">
          <span className="cmr-topbar-label">
            FOF <span aria-hidden="true">/</span> {content.classLabel.toUpperCase()}
          </span>
          <div className="cmr-topbar-actions">
            <button
              ref={settingsButtonRef}
              type="button"
              className="cmr-icon-button"
              aria-haspopup="true"
              aria-expanded={settingsOpen}
              aria-label="Reading settings"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              ⚙
            </button>
            <button type="button" className="cmr-icon-button" aria-label="Close reader" onClick={() => onClose?.()}>
              ✕
            </button>
          </div>

          {settingsOpen && (
            <div className="cmr-settings-panel" role="group" aria-label="Reading settings">
              <div className="cmr-settings-row">
                <span className="cmr-settings-title">Text size</span>
                <div className="cmr-segmented" role="radiogroup" aria-label="Text size">
                  {TEXT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={settings.textSize === size}
                      className={settings.textSize === size ? 'cmr-segmented-active' : ''}
                      onClick={() => updateSettings({ textSize: size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cmr-settings-row">
                <span className="cmr-settings-title">Show scenes</span>
                <button
                  type="button"
                  className="cmr-toggle"
                  role="switch"
                  aria-checked={settings.showScenes}
                  data-on={settings.showScenes}
                  onClick={() => updateSettings({ showScenes: !settings.showScenes })}
                >
                  <span />
                </button>
              </div>
              <div className="cmr-settings-row">
                <span className="cmr-settings-title">Gentle motion</span>
                <button
                  type="button"
                  className="cmr-toggle"
                  role="switch"
                  aria-checked={settings.gentleMotion}
                  data-on={settings.gentleMotion}
                  onClick={() => updateSettings({ gentleMotion: !settings.gentleMotion })}
                >
                  <span />
                </button>
              </div>
            </div>
          )}
        </div>

        <header className="cmr-header">
          <nav aria-label="Chapters" className="cmr-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === ch ? 'cmr-tab-active' : 'cmr-tab-inactive'}
                aria-current={tab.id === ch ? 'page' : undefined}
                aria-label={tab.aria}
                onClick={() => handleTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="cmr-progress-track">
            <div className="cmr-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="cmr-bar-label-row">
            <span className="cmr-bar-label">{barLabel}</span>
            <span className="cmr-bar-title">{barTitle}</span>
          </div>
        </header>

        <div ref={scrollRef} className="cmr-scroll">
          <main className="cmr-main" style={{ fontSize: baseSize }}>
            <h2 id="class-manual-title" ref={headingRef} tabIndex={-1} className="cmr-sr-heading">
              {barTitle}
            </h2>

            {isCover && (
              <>
                <div className="cmr-card cmr-cover-card" data-panel="1">
                  <div className="cmr-cover-art">
                    <svg viewBox="0 0 360 230" role="img" aria-label="Illustration" dangerouslySetInnerHTML={{ __html: CLASS_MANUAL_COVER_ART }} />
                  </div>
                  <div className="cmr-cover-body">
                    <div className="cmr-cover-org">{content.cover.org}</div>
                    <div className="cmr-cover-series">{content.cover.series}</div>
                    <h1 className="cmr-cover-title">{content.cover.title}</h1>
                  </div>
                </div>

                <div className="cmr-card cmr-block-card" data-panel="1">
                  <div className="cmr-block-pill cmr-block-pill-left">{content.cover.objectiveLabel}</div>
                  <div className="cmr-objective-box">
                    <p>{content.cover.objective}</p>
                  </div>
                </div>

                <div className="cmr-card cmr-block-card" data-panel="1">
                  <div className="cmr-block-pill cmr-block-pill-right">{content.cover.outlineLabel}</div>
                  <div className="cmr-outline-list">
                    {content.cover.outline.map((o, i) => (
                      <button key={i} type="button" className="cmr-outline-item" onClick={() => handleOutline(i + 1)}>
                        <span className="cmr-outline-num">{o.num}</span>
                        <span className="cmr-outline-text">{o.text}</span>
                        <span aria-hidden="true" className="cmr-outline-chevron">
                          ›
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {isChapter && chapter && (
              <>
                <div className="cmr-chapter-banner">
                  <span className="cmr-chapter-pill">{barLabel}</span>
                  <div className="cmr-chapter-title-row">
                    <div className="cmr-chapter-tab-circle" aria-hidden="true">
                      {chapter.tab}
                    </div>
                    <h2 className="cmr-chapter-title">{chapter.title}</h2>
                  </div>
                </div>

                {chapter.panels.map((panel, i) => (
                  <PanelView key={i} panel={panel} showScenes={settings.showScenes} />
                ))}

                {renderEndCard && (
                  <div className="cmr-card cmr-end-card" data-panel="1">
                    <div className="cmr-end-card-art">
                      <svg viewBox="0 0 360 110" role="img" aria-label="Illustration" dangerouslySetInnerHTML={{ __html: CLASS_MANUAL_END_CARD_ART }} />
                    </div>
                    <div className="cmr-end-card-body">{renderEndCard()}</div>
                  </div>
                )}
              </>
            )}

            <nav aria-label="Chapter navigation" className="cmr-chapter-nav">
              {hasPrev && (
                <button type="button" className="cmr-nav-button cmr-nav-prev" onClick={handlePrev}>
                  <span className="cmr-nav-kicker">‹ Previous</span>
                  <span className="cmr-nav-title">{titleOf(ch - 1)}</span>
                </button>
              )}
              {hasNext && (
                <button type="button" className="cmr-nav-button cmr-nav-next" onClick={handleNext}>
                  <span className="cmr-nav-kicker">{ch === 0 ? 'Start reading ›' : 'Next ›'}</span>
                  <span className="cmr-nav-title">{titleOf(ch + 1)}</span>
                </button>
              )}
            </nav>
          </main>

          <footer className="cmr-footer">
            <span className="cmr-footer-org">{content.cover.org}</span>
            <button type="button" className="cmr-footer-pdf" onClick={handlePdf}>
              View original PDF
            </button>
          </footer>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
