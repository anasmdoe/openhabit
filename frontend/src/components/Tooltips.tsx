import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Tip { text: string; rect: DOMRect; below: boolean }

const GAP = 8;     // between the element and its tooltip
const MARGIN = 6;  // minimum distance from the screen edge

// One tooltip for every [data-tip] element. It is drawn above everything (so panels that clip their
// content can't cut it off), kept inside the screen, and flipped under the element when there is
// no room above. Shown on mouse hover and keyboard focus; touch screens don't get hover tooltips.
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    const find = (t: EventTarget | null) => (t instanceof Element ? (t.closest('[data-tip]') as HTMLElement | null) : null);
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      current = el;
      setTip({ text, rect: el.getBoundingClientRect(), below: el.hasAttribute('data-tip-below') });
    };
    const hide = () => { current = null; setTip(null); };

    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = find(e.target);
      if (el && el !== current) show(el);
    };
    const out = (e: PointerEvent) => {
      if (!current || find(e.target) !== current) return;
      const to = e.relatedTarget as Node | null;
      if (!to || !current.contains(to)) hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = find(e.target);
      if (el && (e.target as HTMLElement).matches(':focus-visible')) show(el);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };

    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  // position once the text has been laid out, so its real size is known
  useLayoutEffect(() => {
    const el = box.current;
    if (!tip || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const r = tip.rect;
    const roomAbove = r.top - GAP - height >= MARGIN;
    const above = tip.below ? false : roomAbove;
    const top = above ? r.top - GAP - height : r.bottom + GAP;
    const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, MARGIN), window.innerWidth - width - MARGIN);
    el.style.top = `${Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN))}px`;
    el.style.left = `${left}px`;
    el.style.visibility = 'visible';
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={box} role="tooltip" className="tooltip" style={{ top: 0, left: 0, visibility: 'hidden' }}>
      {tip.text}
    </div>
  );
}
