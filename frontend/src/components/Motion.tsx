import React, { useLayoutEffect, useRef } from 'react';
import { EASE, reducedMotion, useTween } from '../lib/motion';

/**
 * A block whose height eases when its content grows or shrinks (a row leaves a list, a section opens),
 * so everything below it glides instead of jumping. The content keeps its natural height; only the
 * wrapper animates, and it clips just while it does. `className` goes on the inner element, so it
 * can be the grid or flex container itself.
 */
export function AutoHeight({
  children, className, ms = 260, as: Tag = 'div', innerRef, ...rest
}: {
  children: React.ReactNode;
  className?: string;
  ms?: number;
  as?: 'div' | 'section' | 'ul';
  innerRef?: React.RefObject<HTMLDivElement | null>;
} & React.HTMLAttributes<HTMLElement>) {
  const outer = useRef<HTMLDivElement>(null);
  const ownInner = useRef<HTMLDivElement>(null);
  const inner = innerRef ?? ownInner;
  const last = useRef<number | null>(null);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === 'undefined') return;
    last.current = i.offsetHeight;
    const ro = new ResizeObserver(() => {
      const next = i.offsetHeight;
      const prev = last.current;
      last.current = next;
      if (prev == null || prev === next || reducedMotion() || typeof o.animate !== 'function') return;
      // start from what is on screen: the previous natural height, or wherever a running animation is
      const running = o.getAnimations().filter((a) => a.id === 'oh-height');
      const from = running.length ? o.getBoundingClientRect().height : prev;
      running.forEach((a) => a.cancel());
      if (Math.abs(from - next) < 1) return;
      o.style.overflow = 'hidden';
      const a = o.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: ms, easing: EASE, id: 'oh-height' });
      const done = () => { if (!o.getAnimations().some((x) => x.id === 'oh-height')) o.style.overflow = ''; };
      a.onfinish = done;
      a.oncancel = done;
    });
    ro.observe(i);
    return () => ro.disconnect();
  }, [ms]);

  const Outer = Tag as 'div';
  return (
    <Outer ref={outer} {...rest}>
      <div ref={inner} className={className}>{children}</div>
    </Outer>
  );
}

/** A number that eases to its new value: `<Num value={72} suffix="%" />`. */
export function Num({ value, suffix = '', decimals = 0, className, style }: {
  value: number; suffix?: string; decimals?: number; className?: string; style?: React.CSSProperties;
}) {
  const v = useTween(value);
  const text = decimals ? v.toFixed(decimals) : String(Math.round(v));
  return <span className={className} style={style}>{text}{suffix}</span>;
}

/** Fades and eases a conditionally shown field in when it mounts. */
export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`field-in ${className}`}>{children}</div>;
}
