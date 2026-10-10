import React from 'react';

// A verse prayer as the admin typed it: blank lines keep their spacing, and lines starting with "- ", "• " or "* " become bullets.

const BULLET = /^\s*[-•*]\s+(.*)$/;

const PrayerText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const nodes: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length > 0) nodes.push(<p key={`p${nodes.length}`} className="whitespace-pre-line">{para.join('\n')}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length > 0) nodes.push(<ul key={`l${nodes.length}`} className="list-disc space-y-1 pl-5">{list.map((item, index) => <li key={index}>{item}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const bullet = line.match(BULLET);
    if (bullet) { flushPara(); list.push(bullet[1]); }
    else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara();
  flushList();
  return <div className={`space-y-3 ${className}`}>{nodes}</div>;
};

export default PrayerText;
