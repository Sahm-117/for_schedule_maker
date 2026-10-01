import React, { useEffect, useRef, useState } from 'react';
import Avatar from '../Avatar';
import Spinner from '../Spinner';

export const INTRO_PROMPTS: Array<{ label: string; starter: string }> = [
  { label: '3 truths and a lie', starter: '3 truths and a lie: ' },
  { label: 'What I do', starter: 'What I do: ' },
  { label: 'What I hope to get from FOF', starter: 'What I hope to get from FOF: ' },
  { label: 'A fun fact about me', starter: 'A fun fact about me: ' },
];

export const SUPPORT_INTRO_PROMPTS: Array<{ label: string; starter: string }> = [
  { label: 'Why I serve in FOF', starter: 'Why I serve in FOF: ' },
  { label: 'What I do', starter: 'What I do: ' },
  { label: 'A fun fact about me', starter: 'A fun fact about me: ' },
  { label: '3 truths and a lie', starter: '3 truths and a lie: ' },
];

interface IntroComposerProps {
  name: string;
  avatarUrl?: string | null;
  /** Small pill under the name: the participant's gender, or "Support". */
  label?: string | null;
  autoFocus: boolean;
  send: (body: string) => Promise<void>;
  onPosted: () => Promise<void> | void;
  prompts?: Array<{ label: string; starter: string }>;
  heading?: string;
  placeholder?: string;
  wt?: string;
}

// Introduction card: photo, name, label, free text and prompt chips. Used by
// participants (their own intro) and by the group's support (who goes first).
const IntroComposer: React.FC<IntroComposerProps> = ({
  name, avatarUrl, label, autoFocus, send, onPosted,
  prompts = INTRO_PROMPTS,
  heading = 'Introduce yourself',
  placeholder = 'Tell your group a bit about yourself…',
  wt = 'pd-intro-composer',
}) => {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef<HTMLElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // The phone keyboard slides up over the lower half of the screen. Keep the whole card (the
  // text box, the prompt chips and Send) above it: scroll just enough once the keyboard is up,
  // and again whenever the visible area changes while the box has focus.
  const keepCardAboveKeyboard = () => {
    const card = cardRef.current;
    if (!card) return;
    const vv = window.visualViewport;
    const visibleTop = vv ? vv.offsetTop : 0;
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const rect = card.getBoundingClientRect();
    const margin = 12;
    if (rect.height + margin * 2 > visibleBottom - visibleTop) {
      // Taller than the free space: show from the top of the card.
      window.scrollBy({ top: rect.top - visibleTop - margin, behavior: 'smooth' });
    } else if (rect.bottom > visibleBottom - margin) {
      window.scrollBy({ top: rect.bottom - visibleBottom + margin, behavior: 'smooth' });
    } else if (rect.top < visibleTop + margin) {
      window.scrollBy({ top: rect.top - visibleTop - margin, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!autoFocus) return undefined;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    areaRef.current?.focus({ preventScroll: true });
    const timers = [350, 800].map((ms) => window.setTimeout(keepCardAboveKeyboard, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [autoFocus]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const onResize = () => { if (document.activeElement === areaRef.current) keepCardAboveKeyboard(); };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  const addPrompt = (starter: string) => {
    setBody((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${starter}` : starter));
    requestAnimationFrame(() => { const el = areaRef.current; el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); });
  };

  const submit = async () => {
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      await send(body.trim());
      setBody('');
      await onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post your introduction. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section ref={cardRef} data-wt={wt} className="rounded-[22px] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.14)]">
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">{heading}</p>
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={name} avatarUrl={avatarUrl} size="lg" enlargeable />
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-gray-900">{name}</p>
          {label && <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${label === 'Support' ? 'bg-violet-100/80 text-violet-700' : 'bg-neutral-100 text-neutral-600'}`}>{label}</span>}
        </div>
      </div>
      <textarea
        ref={areaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => { window.setTimeout(keepCardAboveKeyboard, 350); }}
        rows={5}
        placeholder={placeholder}
        className="mt-3 w-full resize-none rounded-2xl border border-gray-200 px-3.5 py-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button key={p.label} type="button" onClick={() => addPrompt(p.starter)} className="min-h-[36px] rounded-full bg-[#f2f2f4] px-3.5 text-[13px] font-semibold text-gray-700">{p.label}</button>
        ))}
      </div>
      {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => void submit()} disabled={sending || !body.trim()} className="mt-3 min-h-[48px] w-full rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
        {sending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span> : 'Send'}
      </button>
    </section>
  );
};

export default IntroComposer;
