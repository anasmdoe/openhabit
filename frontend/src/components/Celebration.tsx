import React, { useEffect, useMemo } from 'react';
import { useApp } from '../store';
import { shareCard } from '../lib/share';

const PIECES = 28;

// Milestone celebration (7/30/100/365-day streaks): confetti + share offer.
export function Celebration() {
  const { celebration, dismissCelebration } = useApp();

  useEffect(() => {
    if (!celebration) return;
    navigator.vibrate?.([20, 40, 20]);
    const t = setTimeout(dismissCelebration, 4200);
    return () => clearTimeout(t);
  }, [celebration, dismissCelebration]);

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.4,
        size: 5 + Math.random() * 5,
        rotate: Math.random() * 360,
        hue: i % 3,
      })),
    [celebration?.len] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!celebration) return null;
  const { habitName, color, len } = celebration;
  const colors = [color, 'rgb(var(--mint))', 'rgb(var(--ink-soft))'];

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-live="polite">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: colors[p.hue],
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 top-[16vh] grid place-items-center">
        <div className="panel pointer-events-auto px-5 py-4 shadow-xl flex items-center gap-4 sheet-in">
          <span className="text-2xl" aria-hidden>🔥</span>
          <div>
            <div className="text-[14px] font-bold">
              {len}-day streak — {habitName}
            </div>
            <div className="text-[11px] text-ink-soft">Consistency compounds. Keep going.</div>
          </div>
          <button
            onClick={() => {
              shareCard('Streak milestone', habitName, [
                { label: habitName, pct: 100, value: `${len}d`, color: 'rgb(var(--mint))' },
              ]);
              dismissCelebration();
            }}
            className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-3 py-1.5 shrink-0"
          >
            Share
          </button>
          <button
            onClick={dismissCelebration}
            className="text-ink-soft hover:text-ink text-[13px] shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
