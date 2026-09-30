import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// A short confetti burst on a full-screen canvas (no library). Skipped entirely
// when the phone asks for reduced motion. Calls onDone when it has finished.
const COLORS = ['#f97316', '#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444'];
const DURATION_MS = 2600;

const ConfettiBurst: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      doneRef.current();
      return undefined;
    }
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const pieces = Array.from({ length: 120 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.4,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 4,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION_MS + 700) / 700);
      for (const p of pieces) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(tick);
      else doneRef.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return createPortal(<canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[200]" />, document.body);
};

export default ConfettiBurst;
