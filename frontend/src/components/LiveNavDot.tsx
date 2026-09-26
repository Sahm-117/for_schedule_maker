import React from 'react';

/**
 * "Your meeting is on now" dot for nav items (participant and support apps).
 * A small green dot with a cut-out ring in the tab's own background colour,
 * plus two slow staggered sonar rings. Pass ringClass to match the surface it
 * sits on (e.g. ring-primary on an active tab).
 */
const LiveNavDot: React.FC<{ className?: string; ringClass?: string }> = ({ className = '', ringClass = 'ring-white' }) => (
  <span className={`pointer-events-none relative flex h-2.5 w-2.5 flex-none ${className}`} aria-label="Meeting is on now">
    <span className="fof-live-sonar absolute inset-0 rounded-full bg-emerald-400" />
    <span className="fof-live-sonar fof-live-sonar-late absolute inset-0 rounded-full bg-emerald-400" />
    <span className={`relative h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] ring-2 ${ringClass}`} />
  </span>
);

export default LiveNavDot;
