import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * In-prototype tour: small pop-up cards anchored to elements marked with
 * data-tour="…". The anchored element is spotlit and the rest of the page dims.
 * A step without a target shows as a centred context card.
 */

export type Place = 'right' | 'left' | 'bottom' | 'top';

export interface TourStep {
  target?: string; // value of a data-tour attribute
  place?: Place;
  title: string;
  body: ReactNode;
}

interface Box { top: number; left: number; width: number; height: number }

const GAP = 14;      // space between target and card
const MARGIN = 12;   // keep the card this far from the viewport edge
const PAD = 6;       // spotlight padding around the target

const find = (t: string) => document.querySelector<HTMLElement>(`[data-tour="${t}"]`);
const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const OPPOSITE: Record<Place, Place> = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' };

function placeCard(r: Box, w: number, h: number, pref: Place) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const order: Place[] = [pref, OPPOSITE[pref], 'bottom', 'top'];
  for (const side of order) {
    let top = 0, left = 0, fits = false;
    if (side === 'right' || side === 'left') {
      left = side === 'right' ? r.left + r.width + GAP : r.left - GAP - w;
      top = clamp(r.top + r.height / 2 - h / 2, MARGIN, vh - h - MARGIN);
      fits = left >= MARGIN && left + w <= vw - MARGIN;
    } else {
      top = side === 'bottom' ? r.top + r.height + GAP : r.top - GAP - h;
      left = clamp(r.left + r.width / 2 - w / 2, MARGIN, vw - w - MARGIN);
      fits = top >= MARGIN && top + h <= vh - MARGIN;
    }
    if (fits) {
      const arrow = side === 'right' || side === 'left'
        ? clamp(r.top + r.height / 2 - top, 18, h - 18)
        : clamp(r.left + r.width / 2 - left, 18, w - 18);
      return { top, left, side, arrow };
    }
  }
  // Nothing fits (small screen, tall target): pin to the bottom of the viewport.
  return { top: vh - h - MARGIN, left: clamp(r.left + r.width / 2 - w / 2, MARGIN, vw - w - MARGIN), side: 'none' as const, arrow: 0 };
}

export function Tour({ steps, index, onIndex, onClose }: {
  steps: TourStep[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const step = steps[index];
  const last = index === steps.length - 1;
  const cardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: 320, h: 160 });

  // Bring the target into view when the step changes.
  useEffect(() => {
    if (!step.target) return;
    const t = window.setTimeout(() => {
      const el = find(step.target!);
      if (!el) return;
      if (el.closest('.app-header')) window.scrollTo({ top: 0, behavior: 'smooth' });
      else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 30);
    return () => window.clearTimeout(t);
  }, [index, step.target]);

  // Follow the target as it moves (scrolling, layout changes, the spike animation).
  useLayoutEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = step.target ? find(step.target) : null;
      const r = el?.getBoundingClientRect();
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      setBox(prev => (sameBox(prev, next) ? prev : next));
      const c = cardRef.current;
      if (c) setSize(prev => (prev.w === c.offsetWidth && prev.h === c.offsetHeight ? prev : { w: c.offsetWidth, h: c.offsetHeight }));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step.target]);

  // Keyboard: arrows move, Escape closes. Ignore keys while a slider has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') (last ? onClose() : onIndex(index + 1));
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, last, onIndex, onClose]);

  const isContext = !step.target;
  const pos = box ? placeCard(box, size.w, size.h, step.place ?? 'right') : null;
  const cardStyle = isContext || !pos ? undefined : { top: pos.top, left: pos.left };
  const arrowStyle = pos && pos.side !== 'none'
    ? (pos.side === 'right' || pos.side === 'left' ? { top: pos.arrow } : { left: pos.arrow })
    : undefined;

  return (
    <>
      {isContext || !box
        ? <div className="tour-backdrop" onClick={onClose} aria-hidden="true" />
        : <div className="tour-spotlight" aria-hidden="true"
            style={{ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }} />}
      <div ref={cardRef} role="dialog" aria-live="polite" aria-labelledby="tour-title"
        className={`tour-card${isContext ? ' is-context' : ''}${pos && !isContext ? ` from-${pos.side}` : ''}${!isContext && !box ? ' is-floating' : ''}`}
        style={cardStyle}>
        {!isContext && pos && pos.side !== 'none' && <span className="tour-arrow" style={arrowStyle} aria-hidden="true" />}
        <div className="tour-top">
          <span className="tour-count">{isContext ? 'Context' : `${index} of ${steps.length - 1}`}</span>
          <button type="button" className="tour-close" onClick={onClose} aria-label="Close the tour">✕</button>
        </div>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          {isContext ? (
            <>
              <button type="button" className="btn" onClick={onClose}>Skip, I’ll explore</button>
              <button type="button" className="btn btn-primary" onClick={() => onIndex(1)}>Start the tour</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-sm" onClick={() => onIndex(index - 1)}>Back</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => (last ? onClose() : onIndex(index + 1))}>
                {last ? 'Finish' : 'Next'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
