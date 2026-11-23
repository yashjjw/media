import { useLayoutEffect, useState, type ReactNode } from 'react';
import { SEED, compareOutcome, weight } from '../engine';
import { VERTICAL_SHORT, joinList, money, money2, num, signed } from '../format';
import type { Detection, Report } from '../types';
import type { PageAuction } from './PropagatePanel';
import { Chip, OutcomeChip } from './ui';

/**
 * The story is a guide card that sits beside the prototype, not inside it.
 * On wide screens it docks over the neighbouring column (`slot`) and points at
 * the panel the chapter is about. Below 1180px it becomes a bottom sheet.
 */

export interface Chapter { id: number; label: string; slot: string; point: 'left' | 'right'; look: string }

interface StoryData {
  detection: Detection; auctions: PageAuction[]; report: Report | null; clock: number; playing: boolean;
}

const SHEET_BREAKPOINT = 1180;
const short = (t: string) => (t.length > 30 ? `${t.slice(0, 28)}…` : t);

function Problem({ auctions }: StoryData) {
  const a = auctions.find(x => x.page.id === 'A')!, b = auctions.find(x => x.page.id === 'B')!;
  return (
    <>
      <p>SkyJet, a fictional airline, has a crash. Publishers protect brands today with <strong>keyword blocking</strong>: a page
        with a word like “crash” gets no ads.</p>
      <div className="coach-point"><Chip tone="warn">Over-blocks</Chip>
        <p><strong>Page A</strong>, the crash report, is blocked for every advertiser. {num(a.page.impressionsPerHour)} impressions an hour go unsold.</p></div>
      <div className="coach-point"><Chip tone="no">Under-blocks</Chip>
        <p><strong>Page B</strong>, a month-old SkyJet story with no blocked words, still runs {b.keyword.winner?.name}, a travel ad.</p></div>
      <p className="coach-kicker">The Live Event Layer reacts to the event, not the words</p>
      <table className="coach-table">
        <thead><tr><th /><th>Today</th><th>Live Event Layer</th></tr></thead>
        <tbody>
          <tr><th scope="row">Trigger</th><td>Blocked word on page</td><td>News event about SkyJet</td></tr>
          <tr><th scope="row">Pages</th><td>Every page with the word</td><td>Pages where SkyJet is central</td></tr>
          <tr><th scope="row">Advertisers</th><td>All</td><td>Travel, airline, insurance</td></tr>
          <tr><th scope="row">Duration</th><td>While the word is there</td><td>Fades over 48 hours</td></tr>
        </tbody>
      </table>
    </>
  );
}

function Detect({ detection, playing }: StoryData) {
  const ev = detection.events[0];
  return (
    <>
      <p>The detector counts SkyJet mentions every 10 minutes. They jump from about 2 to 64 in twenty minutes, and 82% of new
        coverage is negative.</p>
      <div className={`coach-result${ev ? ' is-event' : ''}`}>
        {ev ? <><strong>Event fired at +{ev.startMinute} min</strong>, confidence {ev.confidence.toFixed(2)}, for{' '}
          {joinList(detection.events.map(e => VERTICAL_SHORT[e.vertical]))} advertisers.</>
          : playing ? <strong>Checking each bucket as it arrives…</strong> : <strong>No event fired.</strong>}
      </div>
      <p><strong>What’s new:</strong> a signal keyword blocking doesn’t have. An event about an entity, with a confidence score,
        the verticals it affects and a lifespan.</p>
      <p className="coach-try">Try it: switch to <em>Positive story</em>. The same spike fires no event.</p>
    </>
  );
}

function Propagate({ auctions, detection }: StoryData) {
  return (
    <>
      <p>The approach is now <strong>Live Event Layer</strong>. Pages where SkyJet is central drop one suitability tier, only
        for {joinList(detection.events.map(e => VERTICAL_SHORT[e.vertical]))} ads.</p>
      <p className="coach-kicker">What changed, page by page</p>
      <ul className="change-list">
        {auctions.map(pa => (
          <li key={pa.page.id}>
            <span className="page-id sm">{pa.page.id}</span>
            <span className="change-text">
              <span className="muted">{short(pa.page.title)}</span>
              <span>{pa.keyword.winner?.name ?? 'No ad'} <span aria-hidden="true">→</span> <strong>{pa.lel.winner?.name ?? 'No ad'}</strong></span>
            </span>
            <OutcomeChip outcome={compareOutcome(pa.page, pa.keyword, pa.lel, detection.events)} />
          </li>
        ))}
      </ul>
      <p className="coach-try">Try it: select Page C to see why it didn’t change. SkyJet is only mentioned in passing (salience 0.12).</p>
    </>
  );
}

function Decay({ auctions, clock }: StoryData) {
  const w = weight(clock);
  const active = w >= SEED.eventTemplate.minWeight;
  const b = auctions.find(x => x.page.id === 'B')!;
  return (
    <>
      <p>News fades, so the adjustment does too. The event’s weight halves every 24 hours and the step-down ends when it drops
        below 0.25, after 48 hours.</p>
      <div className={`coach-result${active ? ' is-event' : ''}`}>
        <strong>At +{clock}h the weight is {w.toFixed(2)}, so the step-down is {active ? 'still on' : 'over'}.</strong>{' '}
        Page B shows {b.lel.winner?.name}{active ? '.' : ' again.'}
      </div>
      <p className="coach-try">Try it: drag the clock at the top between 0 and 96 hours.</p>
    </>
  );
}

function Results({ report, auctions }: StoryData) {
  if (!report) return <p>Play the Detect chapter first so there is an event to report on.</p>;
  const diff = report.lel.revenue - report.keyword.revenue;
  const a = auctions.find(x => x.page.id === 'A')!;
  return (
    <>
      <p>Same four pages and bids, first 48 hours of the event. Simulated numbers.</p>
      <div className="coach-figures">
        <div><span className="fig">{money(report.keyword.revenue)} → {money(report.lel.revenue)}</span><span className="fig-label">revenue, {signed(diff / report.keyword.revenue * 100, v => v.toFixed(0))}%</span></div>
        <div><span className="fig">{money2(report.keyword.rpm)} → {money2(report.lel.rpm)}</span><span className="fig-label">RPM</span></div>
        <div><span className="fig">{num(report.recoveredImpressions)}</span><span className="fig-label">recovered: the crash report runs {a.lel.winner?.name}</span></div>
        <div><span className="fig">{num(report.protectedImpressions)}</span><span className="fig-label">protected: no travel ads beside SkyJet</span></div>
      </div>
      <p className="coach-try">The trade-off: Page B earns less while the event is on. The Breaking-safe News deal lets buyers pay for that guarantee.</p>
    </>
  );
}

const BODIES: Record<number, { title: string; render: (d: StoryData) => ReactNode }> = {
  1: { title: 'Keyword blocking gets breaking news wrong twice', render: d => <Problem {...d} /> },
  2: { title: 'Spot the event as it happens', render: d => <Detect {...d} /> },
  3: { title: 'Change only the pages and advertisers that matter', render: d => <Propagate {...d} /> },
  4: { title: 'Step back when the story fades', render: d => <Decay {...d} /> },
  5: { title: 'More revenue and safer placements', render: d => <Results {...d} /> },
};

interface Position { sheet: boolean; left: number; top: number; width: number; maxHeight: number }

/** Dock the card over the slot column, just below the sticky header. */
function useDock(slotId: string): Position {
  const [pos, setPos] = useState<Position>({ sheet: true, left: 0, top: 0, width: 0, maxHeight: 0 });
  useLayoutEffect(() => {
    const update = () => {
      const slot = document.getElementById(slotId);
      if (window.innerWidth < SHEET_BREAKPOINT || !slot) { setPos(p => (p.sheet ? p : { ...p, sheet: true })); return; }
      const r = slot.getBoundingClientRect();
      const headerBottom = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 120;
      const width = Math.min(r.width, 420);
      const top = Math.max(headerBottom, 0) + 16;
      setPos({ sheet: false, left: r.left + (r.width - width) / 2, top, width, maxHeight: window.innerHeight - top - 16 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update); };
  }, [slotId]);
  return pos;
}

export function Story({ chapters, current, onGo, onClose, data }: {
  chapters: Chapter[]; current: number; onGo: (i: number) => void; onClose: () => void; data: StoryData;
}) {
  const chapter = chapters[current - 1];
  const body = BODIES[current];
  const next = chapters[current]; // ids are 1-based, so this is the following chapter
  const pos = useDock(chapter.slot);
  const style = pos.sheet ? undefined : { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight };

  return (
    <aside className={`coach ${pos.sheet ? 'is-sheet' : `points-${chapter.point}`}`} style={style} aria-labelledby="coach-title">
      <div className="coach-head">
        <span>
          <span className="coach-step">Story, {current} of {chapters.length}</span>
          <span className="coach-look">
            {pos.sheet ? `↑ ${chapter.look}` : chapter.point === 'left' ? `← ${chapter.look}` : `${chapter.look} →`}
          </span>
        </span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close the story">✕</button>
      </div>
      <ol className="coach-progress">
        {chapters.map(c => (
          <li key={c.id}>
            <button type="button" onClick={() => onGo(c.id)} aria-current={c.id === current ? 'step' : undefined}
              className={c.id === current ? 'is-current' : c.id < current ? 'is-done' : ''}>
              <i aria-hidden="true" />{c.label}
            </button>
          </li>
        ))}
      </ol>
      <h2 id="coach-title" className="coach-title">{body.title}</h2>
      <div className="coach-body">{body.render(data)}</div>
      <div className="coach-nav">
        <button type="button" className="btn" onClick={() => onGo(current - 1)} disabled={current === 1}>Back</button>
        {next
          ? <button type="button" className="btn btn-primary" onClick={() => onGo(current + 1)}>Next: {next.label}</button>
          : <button type="button" className="btn btn-primary" onClick={onClose}>Explore on your own</button>}
      </div>
    </aside>
  );
}
