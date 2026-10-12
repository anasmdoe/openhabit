// Hand-rolled SVG charts rendered in *pixel space* (measured via
// ResizeObserver) so text and bars never stretch.
import React, { useLayoutEffect, useRef, useState } from 'react';

const MINT = 'rgb(var(--mint))';
const SOFT = 'rgb(var(--ink-soft))';
const LINE = 'rgb(var(--line))';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () =>
      setW(el.clientWidth || el.getBoundingClientRect().width || el.parentElement?.clientWidth || 0);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

// ---------------------------------------------------------------- Bars
export function Bars({
  values, labels, height = 96, highlight = -1, showValues = false, color, yMax,
}: {
  values: (number | null)[];
  labels?: (string | number | null)[];
  height?: number;
  highlight?: number;
  showValues?: boolean;
  color?: string;
  yMax?: number; // e.g. 100 for percentage charts; omit for data-driven scale
  unit?: string;
}) {
  const { ref, w } = useWidth<HTMLDivElement>();
  const n = values.length;
  if (!n) return null;

  const max = Math.max(yMax ?? 1, ...values.map((v) => v ?? 0));
  const labelH = labels ? 14 : 0;
  const valueH = showValues ? 13 : 0;
  const chartH = height - labelH - valueH;
  const slot = n ? w / n : 0;
  const barW = Math.max(2, Math.min(26, slot * 0.62));
  const labelEvery = slot > 0 ? Math.max(1, Math.ceil(18 / slot)) : 1;
  const valueEvery = slot > 0 ? Math.max(1, Math.ceil(22 / slot)) : 1;
  const fill = color ?? MINT;

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="bar chart">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={w} y1={valueH + chartH * f} y2={valueH + chartH * f}
              stroke={LINE} strokeWidth={1} />
          ))}
          {values.map((v, i) => {
            if (v == null) return null;
            const h = Math.max(1.5, (v / max) * chartH);
            const cx = i * slot + slot / 2;
            return (
              <rect key={i} x={cx - barW / 2} y={valueH + chartH - h} width={barW} height={h}
                fill={fill} opacity={highlight === -1 || highlight === i ? 1 : 0.4} rx={2} />
            );
          })}
          {showValues && values.map((v, i) =>
            v == null || i % valueEvery !== 0 ? null : (
              <text key={`v${i}`} x={i * slot + slot / 2} y={valueH - 3} textAnchor="middle"
                fontSize={10} fill={SOFT} className="num">{v}</text>
            )
          )}
          {labels && labels.map((l, i) =>
            l == null || l === '' || i % labelEvery !== 0 ? null : (
              <text key={`l${i}`} x={i * slot + slot / 2} y={height - 3} textAnchor="middle"
                fontSize={10} fill={SOFT}>{l}</text>
            )
          )}
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Donut
export function Donut({ pct, size = 120, label }: { pct: number; size?: number; label?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${pct}% complete`}>
      <circle cx={50} cy={50} r={r} fill="none" stroke={LINE} strokeWidth={12} />
      <circle cx={50} cy={50} r={r} fill="none" stroke={MINT} strokeWidth={12}
        strokeDasharray={`${filled} ${c - filled}`} transform="rotate(-90 50 50)" />
      <text x={50} y={50} textAnchor="middle" dominantBaseline="central"
        fontSize={20} fontWeight={700} fill="rgb(var(--ink))" className="num">{pct}%</text>
      {label && (
        <text x={50} y={66} textAnchor="middle" fontSize={7} fill={SOFT}>{label}</text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- Lines
export function LineChart({
  series, height = 120, yMax, labels,
}: {
  series: { name: string; color: string; points: (number | null)[]; dashed?: boolean }[];
  height?: number;
  yMax?: number;
  labels?: (string | number | null)[];
}) {
  const { ref, w } = useWidth<HTMLDivElement>();
  const n = Math.max(...series.map((s) => s.points.length), 0);
  if (!n) return null;
  const max = yMax ?? Math.max(1, ...series.flatMap((s) => s.points.filter((p): p is number => p != null)));
  const labelH = labels ? 14 : 0;
  const chartH = height - labelH - 6;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 8) + 4);
  const y = (v: number) => 4 + chartH - (v / max) * chartH;
  const slot = n > 1 ? w / (n - 1) : w;
  const labelEvery = slot > 0 ? Math.max(1, Math.ceil(24 / slot)) : 1;

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && (
        <svg width={w} height={height}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={w} y1={4 + chartH * f} y2={4 + chartH * f} stroke={LINE} strokeWidth={1} />
          ))}
          {series.map((s) => {
            const segs: string[] = [];
            let d = '';
            s.points.forEach((p, i) => {
              if (p == null) { if (d) segs.push(d); d = ''; return; }
              d += d ? ` L ${x(i)} ${y(p)}` : `M ${x(i)} ${y(p)}`;
            });
            if (d) segs.push(d);
            return segs.map((seg, i) => (
              <path key={`${s.name}${i}`} d={seg} fill="none" stroke={s.color} strokeWidth={1.6}
                strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            ));
          })}
          {labels && labels.map((l, i) =>
            l == null || i % labelEvery !== 0 ? null : (
              <text key={i} x={x(i)} y={height - 2} textAnchor="middle" fontSize={10} fill={SOFT}>{l}</text>
            )
          )}
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- HBar
export function HBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="h-2.5 w-full bg-forest-800 rounded-sm overflow-hidden">
      <div className="h-full rounded-sm" style={{ width: `${Math.min(100, pct)}%`, background: color ?? MINT }} />
    </div>
  );
}

// ------------------------------------------------------------ MiniRing
export function MiniRing({ pct, color, size = 22 }: { pct: number; color: string; size?: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="shrink-0" role="img" aria-label={`${pct}%`}>
      <circle cx={12} cy={12} r={r} fill="none" stroke={LINE} strokeWidth={3.5} />
      <circle cx={12} cy={12} r={r} fill="none" stroke={color} strokeWidth={3.5}
        strokeDasharray={`${filled} ${c - filled}`} transform="rotate(-90 12 12)" strokeLinecap="round" />
    </svg>
  );
}
