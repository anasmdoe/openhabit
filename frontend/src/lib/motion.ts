// Motion toolkit: small, dependency-free helpers so lists, numbers, panels and pages move instead of jump.
// Everything here respects "reduce motion" (the OS setting): JS-driven animations are skipped, and the
// stylesheet switches CSS animations and transitions off.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { RefObject } from 'react';

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'; // quick start, soft landing
export const EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Web Animations API available (jsdom and very old browsers lack it). */
const canAnimate = (el: Element) => typeof (el as HTMLElement).animate === 'function';

// ------------------------------------------------------------------ FLIP

type Rect = { x: number; y: number };
const FLIP_ID = 'oh-flip';

/** Translation currently applied to an element by a running animation or transform. */
function currentOffset(el: HTMLElement): Rect {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { x: 0, y: 0 };
  const m = /matrix(?:3d)?\(([^)]+)\)/.exec(t);
  if (!m) return { x: 0, y: 0 };
  const v = m[1].split(',').map(Number);
  return v.length === 6 ? { x: v[4], y: v[5] } : { x: v[12] ?? 0, y: v[13] ?? 0 };
}

/**
 * FLIP: after every render, children of `container` marked `data-flip="<key>"` that ended up somewhere else
 * glide from where they were to where they are, instead of jumping. Reorders, rows closing the gap a removed
 * row leaves, chips re-wrapping: one hook covers them all. Elements that are new, hidden, or moved because
 * the window was resized are left alone.
 */
export function useFlip(container: RefObject<HTMLElement | null>, ms = 280) {
  const prev = useRef(new Map<string, Rect>());
  const width = useRef(0);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'));
    const resized = width.current !== 0 && Math.abs(window.innerWidth - width.current) > 1;
    width.current = window.innerWidth;
    const skip = reducedMotion() || resized;

    // 1. where each element is (visually) right now, including a glide still in flight
    const offsets = els.map((el) => currentOffset(el));
    // 2. cancel in-flight glides so layout positions can be read
    for (const el of els) if (canAnimate(el)) el.getAnimations().forEach((a) => { if (a.id === FLIP_ID) a.cancel(); });

    const next = new Map<string, Rect>();
    const rootBox = root.getBoundingClientRect();
    els.forEach((el, i) => {
      const key = el.dataset.flip!;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return; // hidden
      // relative to the container, so the page or the grid scrolling is not mistaken for a move
      const pos = { x: box.left - rootBox.left + root.scrollLeft, y: box.top - rootBox.top + root.scrollTop };
      next.set(key, pos);
      const before = prev.current.get(key);
      if (skip || !before || !canAnimate(el)) return;
      const dx = before.x + offsets[i].x - pos.x;
      const dy = before.y + offsets[i].y - pos.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: ms, easing: EASE, id: FLIP_ID },
      );
    });
    prev.current = next;
  });
}

// ------------------------------------------------------------- exit list

export interface ExitItem<T> { item: T; key: string; leaving: boolean }

/** The key of the closest earlier item that is still around: the spot a removed item should keep. */
export function anchorBefore(prevKeys: string[], index: number, alive: (key: string) => boolean): string | null {
  for (let j = index - 1; j >= 0; j--) if (alive(prevKeys[j])) return prevKeys[j];
  return null;
}

/** Puts leaving items back into the live list, each right after the item it followed (first if none). */
export function spliceGhosts<T>(live: ExitItem<T>[], ghosts: { entry: ExitItem<T>; after: string | null }[]): ExitItem<T>[] {
  const out = [...live];
  for (const g of ghosts) {
    const at = g.after == null ? 0 : out.findIndex((e) => e.key === g.after) + 1;
    out.splice(Math.max(0, at), 0, g.entry);
  }
  return out;
}

/**
 * A list that lets removed items play an exit animation: an item that disappeared from `items` is kept
 * (flagged `leaving`) at its old position for `ms`, then dropped. With reduced motion it vanishes at once.
 */
export function useExitList<T>(items: T[], keyOf: (item: T) => string, ms = 170): ExitItem<T>[] {
  const keyFn = useRef(keyOf);
  keyFn.current = keyOf;
  const lastItems = useRef<ExitItem<T>[]>([]);
  const ghosts = useRef(new Map<string, { entry: ExitItem<T>; after: string | null; timer: number }>());
  const [, bump] = useState(0);

  const currentKeys = new Set(items.map((i) => keyFn.current(i)));

  // newly removed items become ghosts, remembered together with the key of the item they followed
  if (!reducedMotion()) {
    const prevKeys = lastItems.current.map((e) => e.key);
    lastItems.current.forEach((e, idx) => {
      if (currentKeys.has(e.key) || ghosts.current.has(e.key)) return;
      const after = anchorBefore(prevKeys, idx, (k) => currentKeys.has(k) || ghosts.current.has(k));
      const timer = window.setTimeout(() => { ghosts.current.delete(e.key); bump((n) => n + 1); }, ms);
      ghosts.current.set(e.key, { entry: { ...e, leaving: true }, after, timer });
    });
  }
  // an item that came back cancels its ghost
  for (const [k, g] of ghosts.current) if (currentKeys.has(k)) { clearTimeout(g.timer); ghosts.current.delete(k); }

  const live: ExitItem<T>[] = items.map((item) => ({ item, key: keyFn.current(item), leaving: false }));
  const out = spliceGhosts(live, [...ghosts.current.values()]);
  lastItems.current = live;

  useEffect(() => () => ghosts.current.forEach((g) => clearTimeout(g.timer)), []);
  return out;
}

// ------------------------------------------------------------- numbers

export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A number that eases to its new value (the first value shows at once, so a page load doesn't count up). */
export function useTween(value: number, ms = 450): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    if (reducedMotion() || from.current === value) { from.current = value; setShown(value); return; }
    const start = performance.now();
    const a = from.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (value - a) * easeOut(t);
      from.current = v;
      setShown(v);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  return shown;
}

// -------------------------------------------------------------- presence

/**
 * Keeps something mounted for `ms` after `open` turns false, so it can play its exit animation.
 * `snapshot` is the last non-empty value seen while open, for content read from state that is already cleared.
 */
export function usePresence<T = undefined>(open: boolean, ms = 180, value?: T) {
  const [mounted, setMounted] = useState(open);
  const last = useRef<T | undefined>(value);
  if (open && value !== undefined && value !== null) last.current = value;
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (reducedMotion()) { setMounted(false); return; }
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { show: open || mounted, closing: !open && mounted, snapshot: last.current };
}

// --------------------------------------------------------- mount flag

/** false on the first paint, true right after: lets a CSS transition run from its "before" state on mount. */
export function useMountedFlag(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reducedMotion()) { setOn(true); return; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

// ------------------------------------------------------ view transitions

type VTDoc = Document & { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> } };

export const supportsViewTransitions = () =>
  typeof document !== 'undefined' && typeof (document as VTDoc).startViewTransition === 'function';

/**
 * Runs a state change inside a browser View Transition (a crossfade of the old and new page), when the
 * browser supports it and motion is allowed; otherwise just runs it. `dir` tells the CSS which way to slide.
 */
export function withViewTransition(change: () => void, dir: 1 | -1 | 0 = 0) {
  const doc = document as VTDoc;
  if (!doc.startViewTransition || reducedMotion()) { change(); return; }
  document.documentElement.dataset.vt = dir > 0 ? 'fwd' : dir < 0 ? 'back' : 'fade';
  const t = doc.startViewTransition(() => { flushSync(change); });
  t.finished.finally(() => { delete document.documentElement.dataset.vt; }).catch(() => {});
}
