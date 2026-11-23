import type { ReactNode } from 'react';
import { SEED, compareOutcome, weight } from '../engine';
import { VERTICAL_SHORT, joinList, money, money2, num, signed } from '../format';
import type { Detection, Report } from '../types';
import type { PageAuction } from './PropagatePanel';
import { Chip, OutcomeChip } from './ui';

export interface Chapter { id: number; label: string }

interface StoryData {
  detection: Detection; auctions: PageAuction[]; report: Report | null; clock: number; playing: boolean;
}

const short = (t: string) => (t.length > 34 ? `${t.slice(0, 32)}…` : t);

function Problem({ auctions }: StoryData) {
  const a = auctions.find(x => x.page.id === 'A')!, b = auctions.find(x => x.page.id === 'B')!;
  return (
    <div className="story-grid">
      <div className="story-col">
        <p className="story-body">
          SkyJet, a fictional airline, has a crash. Publishers protect brands today with <strong>keyword blocking</strong>:
          any page containing a word like “crash” or “dead” gets no ads.
        </p>
        <div className="problem">
          <Chip tone="warn">Over-blocks</Chip>
          <p><strong>Page A, the crash report, earns nothing.</strong> Every advertiser is turned away, even a shampoo brand the
            crash doesn’t affect. {num(a.page.impressionsPerHour)} impressions an hour go unsold.</p>
        </div>
        <div className="problem">
          <Chip tone="no">Under-blocks</Chip>
          <p><strong>Page B still runs a travel ad beside SkyJet.</strong> “{b.page.title}” is a month old and has no blocked
            words, so {b.keyword.winner?.name} appears next to the airline while it’s in the news.</p>
        </div>
      </div>
      <div className="story-col">
        <p className="story-kicker">The Live Event Layer reacts to the event, not the words</p>
        <table className="table compare-table">
          <thead><tr><th /><th>Keyword blocking today</th><th>Live Event Layer</th></tr></thead>
          <tbody>
            <tr><th scope="row">Trigger</th><td>A blocked word is on the page</td><td>A news event about SkyJet is detected</td></tr>
            <tr><th scope="row">Pages</th><td>Every page with the word</td><td>Only pages where SkyJet is central</td></tr>
            <tr><th scope="row">Advertisers</th><td>All of them</td><td>Only travel, airline and insurance</td></tr>
            <tr><th scope="row">Duration</th><td>As long as the word is there</td><td>Fades out over 48 hours</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detect({ detection, playing }: StoryData) {
  const ev = detection.events[0];
  return (
    <div className="story-grid">
      <div className="story-col">
        <p className="story-body">
          The detector counts SkyJet mentions every 10 minutes. Watch the spike play: mentions jump from about 2 to 64 within
          20 minutes, and 82% of new coverage is negative.
        </p>
        <div className={`story-result${ev ? ' is-event' : ''}`}>
          {ev ? (
            <><strong>Event fired at +{ev.startMinute} min, confidence {ev.confidence.toFixed(2)}.</strong> It applies to{' '}
              {joinList(detection.events.map(e => VERTICAL_SHORT[e.vertical]))} advertisers and fades over 48 hours.</>
          ) : playing ? <strong>Checking each bucket as it arrives…</strong> : <strong>No event fired.</strong>}
        </div>
      </div>
      <div className="story-col">
        <p className="story-kicker">What’s new</p>
        <p className="story-body">A new signal for ad decisions: <strong>an event about an entity</strong>, with a confidence score,
          the advertiser verticals it affects and a lifespan. Keyword blocking has no idea a story is breaking.</p>
        <p className="story-try"><strong>Try it:</strong> switch the Detect panel to <em>Positive story</em>. The same spike fires no event.</p>
      </div>
    </div>
  );
}

function Propagate({ auctions, detection }: StoryData) {
  return (
    <div className="story-grid">
      <div className="story-col">
        <p className="story-body">
          With the Live Event Layer on, pages where SkyJet is central drop one suitability tier, but only for{' '}
          {joinList(detection.events.map(e => VERTICAL_SHORT[e.vertical]))} ads. Everyone else bids as normal.
        </p>
        <p className="story-try"><strong>Try it:</strong> select Page C to see why it didn’t change: SkyJet is only mentioned in passing (salience 0.12).</p>
      </div>
      <div className="story-col">
        <p className="story-kicker">What changed, page by page</p>
        <ul className="change-list">
          {auctions.map(pa => {
            const o = compareOutcome(pa.page, pa.keyword, pa.lel, detection.events);
            return (
              <li key={pa.page.id}>
                <span className="page-id sm">{pa.page.id}</span>
                <span className="change-text">
                  <span className="muted">{short(pa.page.title)}</span>
                  <span>{pa.keyword.winner?.name ?? 'No ad'} <span aria-hidden="true">→</span> <strong>{pa.lel.winner?.name ?? 'No ad'}</strong></span>
                </span>
                <OutcomeChip outcome={o} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Decay({ auctions, clock }: StoryData) {
  const w = weight(clock);
  const active = w >= SEED.eventTemplate.minWeight;
  const b = auctions.find(x => x.page.id === 'B')!;
  return (
    <div className="story-grid">
      <div className="story-col">
        <p className="story-body">
          News fades, so the adjustment does too. The event’s weight halves every 24 hours. When it drops below 0.25, after
          48 hours, the step-down ends and every page goes back to normal.
        </p>
        <p className="story-try"><strong>Try it:</strong> drag the clock at the top of the page anywhere between 0 and 96 hours.</p>
      </div>
      <div className="story-col">
        <div className={`story-result${active ? ' is-event' : ''}`}>
          <strong>At +{clock}h the weight is {w.toFixed(2)}: step-down {active ? 'still on' : 'ended'}.</strong>{' '}
          Page B shows {b.lel.winner?.name}{active ? ', keeping travel ads away from SkyJet.' : ' again, so travel demand is back.'}
        </div>
      </div>
    </div>
  );
}

function Results({ report, auctions }: StoryData) {
  if (!report) return <p className="story-body">Play the Detect chapter first so there is an event to report on.</p>;
  const diff = report.lel.revenue - report.keyword.revenue;
  const a = auctions.find(x => x.page.id === 'A')!;
  return (
    <div className="story-grid">
      <div className="story-col">
        <p className="story-body">Same four pages, same bids, first 48 hours of the event. Simulated numbers.</p>
        <div className="result-figures">
          <div><span className="fig">{money(report.keyword.revenue)} <span aria-hidden="true">→</span> {money(report.lel.revenue)}</span><span className="fig-label">revenue, {signed(diff / report.keyword.revenue * 100, v => v.toFixed(0))}%</span></div>
          <div><span className="fig">{money2(report.keyword.rpm)} <span aria-hidden="true">→</span> {money2(report.lel.rpm)}</span><span className="fig-label">RPM</span></div>
        </div>
      </div>
      <div className="story-col">
        <div className="result-figures">
          <div><span className="fig">{num(report.recoveredImpressions)}</span><span className="fig-label">impressions recovered: the crash report now runs {a.lel.winner?.name}</span></div>
          <div><span className="fig">{num(report.protectedImpressions)}</span><span className="fig-label">impressions protected: no travel ads beside SkyJet on Page B</span></div>
        </div>
        <p className="story-try">The trade-off: Page B earns less while the event is on. The Breaking-safe News deal lets buyers pay for that guarantee.</p>
      </div>
    </div>
  );
}

const BODIES: Record<number, { title: string; render: (d: StoryData) => ReactNode }> = {
  1: { title: 'When news breaks, keyword blocking gets it wrong twice', render: d => <Problem {...d} /> },
  2: { title: 'Detect: spot the event as it happens', render: d => <Detect {...d} /> },
  3: { title: 'Propagate: change only the pages and advertisers that matter', render: d => <Propagate {...d} /> },
  4: { title: 'Decay: step back when the story fades', render: d => <Decay {...d} /> },
  5: { title: 'Results: more revenue and safer placements', render: d => <Results {...d} /> },
};

export function Story({ chapters, current, onGo, onClose, data }: {
  chapters: Chapter[]; current: number; onGo: (i: number) => void; onClose: () => void; data: StoryData;
}) {
  const body = BODIES[current];
  const next = chapters[current]; // chapters are 1-indexed
  return (
    <section className="story-card" aria-labelledby="story-title">
      <div className="story-top">
        <ol className="chapters">
          {chapters.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => onGo(c.id)} aria-current={c.id === current ? 'step' : undefined}
                className={c.id === current ? 'is-current' : c.id < current ? 'is-done' : ''}>
                <span className="chapter-num">{c.id}</span>{c.label}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="link-button subtle" onClick={onClose}>Hide story and explore</button>
      </div>
      <h2 id="story-title" className="story-title">{body.title}</h2>
      {body.render(data)}
      <div className="story-nav">
        <button type="button" className="btn" onClick={() => onGo(current - 1)} disabled={current === 1}>Back</button>
        {next
          ? <button type="button" className="btn btn-primary" onClick={() => onGo(current + 1)}>Next: {next.label}</button>
          : <button type="button" className="btn btn-primary" onClick={onClose}>Explore on your own</button>}
      </div>
    </section>
  );
}
