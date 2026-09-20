import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './FaithProjectGuide.css';

const chapters = ['Begin', 'Make it SMART', 'In practice', 'Stand on the Word', 'Your confession', 'Keep walking'];
const smart = [
  ['S', 'Specific', 'Name what you are trusting God for.', 'Instead of “God, help me in my studies,” try “Lord, I trust You to provide wisdom and financial resources to complete my university degree.”'],
  ['M', 'Measurable', 'Know how you will recognise the answer.', '“I will know God has answered when I receive a scholarship or the funds to pay my tuition fees.”'],
  ['A', 'Achievable', 'Let your actions agree with your faith.', '“I am studying diligently, applying for scholarships, and trusting God to provide.” Faith works with action — James 2:26.'],
  ['R', 'Relevant', 'Connect your request to your purpose.', '“Completing my degree is important because I believe God has called me to serve as a teacher.”'],
  ['T', 'Time-bound', 'Set a reasonable timeframe; trust God’s timing.', '“I am trusting God to provide the necessary funds by the start of the next academic year.”'],
];

export default function FaithProjectGuide() {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    const opener = trigger.current;
    const previousOverflow = document.body.style.overflow;
    modal?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      modal?.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  const go = (index: number) => {
    setChapter(index);
    scroll.current?.scrollTo({ top: 0 });
    heading.current?.focus();
  };

  return <>
    <button ref={trigger} type="button" className="faith-guide-entry" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span className="faith-guide-entry-mark" aria-hidden="true">✦</span>
      <span className="flex-1"><strong className="block text-sm">Explore the Faith Project guide</strong></span>
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>
    </button>
    {createPortal(<dialog ref={dialog} className="faith-reader" aria-labelledby="faith-guide-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      {open && <div className="faith-reader-layout">
        <header className="faith-reader-header"><span>FOF <span aria-hidden="true">/</span> THE FAITH PROJECT GUIDE</span><button type="button" onClick={() => setOpen(false)} aria-label="Close guide">✕</button></header>
        <nav className="faith-reader-nav" aria-label="Guide chapters">{chapters.map((label, i) => <button key={label} type="button" aria-current={chapter === i ? 'step' : undefined} onClick={() => go(i)}><span>{String(i + 1).padStart(2, '0')}</span>{label}</button>)}</nav>
        <div ref={scroll} className="faith-reader-scroll">
          <article className="faith-reader-article">
            <p className="faith-reader-eyebrow">CHAPTER {String(chapter + 1).padStart(2, '0')} / 06</p>
            <h2 id="faith-guide-title" ref={heading} tabIndex={-1}>{[
              <>Faith, with<br /><em>intention.</em></>,
              <>Give your faith<br /><em>a clear focus.</em></>,
              <>From a wish<br /><em>to a plan.</em></>,
              <>Rooted in<br /><em>His promises.</em></>,
              <>Speak what<br /><em>you believe.</em></>,
              <>Keep taking<br /><em>steps of faith.</em></>,
            ][chapter]}</h2>
            {chapter === 0 && <>
              <p className="faith-reader-lead">A specific request. Active trust. A step forward.</p>
              <p>A Faith Project is a specific request we present to God in faith, trusting Him to bring it to pass within a set time.</p>
              <p>It is a focused way to pray: aligning your desires with God’s will while taking practical steps towards your request. It strengthens faith and builds discipline in your spiritual journey.</p>
              <div className="faith-reader-callout"><span>PAUSE & REFLECT</span><p>What are you trusting God for in this season?</p></div>
              <p className="faith-reader-note">Start with that question. This guide will help you shape your request, find Scripture to stand on, and put your faith into action.</p>
            </>}
            {chapter === 1 && <>
              <p className="faith-reader-lead">Make your Faith Project SMART.</p>
              <div className="faith-smart-list">{smart.map(([letter, title, description, example]) => <section key={letter}><span className="faith-smart-letter" aria-hidden="true">{letter}</span><div><h3>{title}</h3><p>{description}</p><p className="faith-smart-example">{example}</p></div></section>)}</div>
            </>}
            {chapter === 2 && <>
              <p className="faith-reader-lead">The difference is clarity — and action.</p>
              <div className="faith-reader-example"><span>A VAGUE REQUEST</span><p>“Lord, bless me financially.”</p></div>
              <div className="faith-reader-callout"><span>A SMART FAITH PROJECT</span><p>“Lord, I trust You to help me increase my income by securing a better-paying job as a Finance Consultant within the next three months.”</p></div>
              <h3>Put faith into practice</h3><ul><li>Apply for at least five positions every week.</li><li>Improve the skills needed for the role.</li><li>Believe God for an offer within the next three months.</li></ul>
              <p className="faith-reader-note">The role is specific, applications are measurable, and applying and learning make it actionable. It connects to a career goal and includes a timeframe — while trusting God’s timing.</p>
            </>}
            {chapter === 3 && <>
              <p className="faith-reader-lead">Let God’s Word shape your prayers.</p>
              {[
                ['Mark 11:24', 'Whatever you ask for in prayer, believe that you have received it, and it will be yours.'],
                ['Proverbs 16:3', 'Commit to the Lord whatever you do, and He will establish your plans.'],
                ['Philippians 4:6', 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.'],
              ].map(([verse, words]) => <blockquote key={verse}><p>“{words}”</p><cite>{verse}</cite></blockquote>)}
            </>}
            {chapter === 4 && <>
              <p className="faith-reader-lead">A confession aligns your heart, words and actions with God’s promises.</p>
              <p>Declare what you believe God will do, with conviction and grounded in His Word.</p>
              <ol><li><strong>Begin with gratitude.</strong> Thank God in advance.</li><li><strong>Be specific.</strong> Clearly declare your request.</li><li><strong>Stand on Scripture.</strong> Include verses that support your faith.</li><li><strong>Speak in the present tense.</strong> Declare it as though it is happening.</li><li><strong>Trust His timing.</strong> Rest in God’s perfect plan.</li></ol>
              <div className="faith-reader-confession"><span>AN EXAMPLE TO HELP YOU BEGIN</span>
                <p>Father, I thank You because You are my provider, and You supply all my needs according to Your riches in glory (Philippians 4:19).</p>
                <p>I declare that I am receiving divine favor and wisdom to secure a better-paying job as a financial consultant. Doors of opportunity are opening for me, and I walk in confidence, knowing that You are directing my steps (Proverbs 3:5–6).</p>
                <p>I refuse to fear or doubt because I know that what I have asked for in prayer, I have received (Mark 11:24).</p>
                <p>In Jesus’ Name, I declare that this testimony is mine. Amen!</p>
              </div><p className="faith-reader-note">Speak it daily, believe it in your heart, and act in faith. God’s Word never returns void — Isaiah 55:11.</p>
            </>}
            {chapter === 5 && <>
              <p className="faith-reader-lead">Faith is not passive. It is active trust that moves you to action.</p>
              <p>Keep praying, keep trusting, and keep taking intentional steps. Stay rooted in God’s Word, make prayer part of your daily life, and join church departments that support your faith walk.</p>
              <blockquote><p>“Let us hold unswervingly to the hope we profess, for He who promised is faithful.”</p><cite>Hebrews 10:23</cite></blockquote>
              <p>Let each Faith Project become a testimony that glorifies God and encourages others. This is part of a lifelong walk.</p>
              <div className="faith-reader-callout"><span>YOUR NEXT STEP IN THE APP</span><h3>Write. Save. Share with your support.</h3><p>Return to your project and write your request. Save a draft as you go, then submit when ready, by your cohort’s deadline if one is shown.</p><p>Your support reviews it first. They may return feedback for you to revise, or send it to the programme team. The team’s feedback or approval goes to your support, who keeps you informed.</p><p>Questions? Contact your support through My Group. Read their feedback on your Faith Project page.</p></div>
            </>}
            <p className="faith-reader-source">Adapted from the FOF Faith Project Guide{chapter === 5 ? ' · App instructions added for this programme.' : '.'}</p>
          </article>
        </div>
        <footer className="faith-reader-footer"><button type="button" disabled={chapter === 0} onClick={() => go(chapter - 1)}>← Back</button><span aria-live="polite">{chapter + 1} / 6</span><button type="button" className="faith-reader-next" onClick={() => chapter === 5 ? setOpen(false) : go(chapter + 1)}>{chapter === 5 ? 'Back to my project' : 'Continue →'}</button></footer>
      </div>}
    </dialog>, document.body)}
  </>;
}
