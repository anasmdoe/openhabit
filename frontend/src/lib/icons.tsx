import React from 'react';

// Minimal single-stroke icon set. Each icon is a path set inside a 24x24 box.
export const HABIT_ICONS: Record<string, React.ReactNode> = {
  run: <path d="M13 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8 21l3-5-2.5-2 1-5 3 2h3.5M9.5 9 7 11l-3 .5M13.5 13l1.5 3 3 1.5" />,
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5V5.5M20 18v3H6.5" />,
  water: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11zM9.5 14a2.5 2.5 0 0 0 2.5 2.5" />,
  gym: <path d="M2 12h2m16 0h2M6 8v8M18 8v8M9 6v12M15 6v12M9 12h6" />,
  meditate: <path d="M12 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 8v4m0 0-4 3 1 4m3-7 4 3-1 4M5 21h14" />,
  sleep: <path d="M20 13.5A8 8 0 1 1 10.5 4 6.5 6.5 0 0 0 20 13.5zM14 4h4l-4 4h4" />,
  sunrise: <path d="M12 2v3M5 6l2 2m12-2-2 2M3 13h3m12 0h3M7 17a5 5 0 0 1 10 0M2 21h20" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13 4l-2 16" />,
  music: <path d="M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm0 0V4l11-2v14m0 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />,
  pill: <path d="m10.5 3.5-7 7a5 5 0 0 0 7 7l7-7a5 5 0 0 0-7-7zM7 7l7 7" />,
  food: <path d="M5 3v7a2 2 0 0 0 2 2v9M9 3v7M7 3v7M15 12a3 9 0 0 1 3-9v18" />,
  nophone: <path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 4l16 16M11 18h2" />,
  pray: <path d="M12 3v6m0 0c-2 2-5 3-5 7v5h10v-5c0-4-3-5-5-7z" />,
  sun: <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  pen: <path d="M17 3l4 4L8 20l-5 1 1-5L17 3zM14 6l4 4" />,
  heart: <path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z" />,
  walk: <path d="M13 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 21l2-6-2-3 1-5 4 2 2 3M8 12l2-5M13 13l3 3 1 5" />,
  bike: <path d="M5.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm13 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 14 9 7h6m-4 7 4-7 3.5 7M14 4h2" />,
  nocoffee: <path d="M17 8h2a2 2 0 0 1 0 4h-2M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8zM3 3l18 18" />,
  money: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9a3 2 0 0 0-3-1.5c-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2a3 2 0 0 1-3-1.5M12 5.5v2m0 9v2" />,
  broom: <path d="M19 3l-7 7M5 21c0-4 2-7 5-9l2 2c-2 3-5 5-7 7zm3-11 4 4" />,
  shower: <path d="M5 8a7 7 0 0 1 14 0M12 8V3M6 12v1m4-1v1m4-1v1m4-1v1M5 16v1m4-1v1m4-1v1m4-1v1" />,
  language: <path d="M3 5h10M8 3v2m3 0s-1 6-8 9m2-6s2 4 6 6M13 21l4-9 4 9m-1.5-3.5h-5" />,
  target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />,
  check: <path d="M4 12.5l5 5L20 6" />,
};

export const ICON_NAMES = Object.keys(HABIT_ICONS);

export function HabitIcon({ name, color, size = 16, className }: {
  name?: string; color?: string; size?: number; className?: string;
}) {
  const glyph = name && HABIT_ICONS[name];
  if (!glyph) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {glyph}
    </svg>
  );
}
