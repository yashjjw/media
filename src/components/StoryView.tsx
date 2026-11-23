import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ENTITY_ID, SALIENCE_MIN, SEED, VERTICAL_LABEL, compareOutcome, keywordIssue, salienceOf, weight } from '../engine';
import { VERTICAL_SHORT, joinList, money, money2, num, publishedLabel, signed } from '../format';
import type { AuctionResult, Detection, Page, Report } from '../types';
import { VelocityChart } from './DetectPanel';
import { Timeline } from './Header';
import { RevenueChart, type HourPoint } from './MonetisePanel';
import type { PageAuction } from './PropagatePanel';
import { Chip, IssueChip, OutcomeChip } from './ui';

/**
 * Story view: a five-scene walkthrough, kept separate from the prototype.
 * Each scene shows one idea on the left and, on the right, only the live piece
 * of the prototype that proves it. Everything comes from the same engine.
 */

export const SCENES = ['Problem', 'Detect', 'Propagate', 'Decay', 'Results'] as const;

export interface StoryData {
  detection: Detection; auctions: PageAuction[]; report: Report | null; hourly: HourPoint[];
  clock: number; playing: boolean; neg: number;
}
export interface StoryActions {
  setClock: (h: number) => void; setNeg: (n: number) => void; playSpike: () => void;
}

/* A small news page with its ad slot: the most direct way to show what an ad decision does. */
function PageMock({ page, result, caption }: { page: Page; result: AuctionResult; caption?: ReactNode }) {
  return (
    <figure className="mock">
      <div className="mock-chrome" aria-hidden="true"><i /><i /><i /><span>news.example</span></div>
      <div className="mock-body">
        <div className="mock-article">
          <span className="mock-page">Page {page.id}</span>
          <strong className="mock-headline">{page.title}</strong>
          <span className="mock-line" /><span className="mock-line" /><span className="mock-line is-short" />
          <span className="mock-meta">{publishedLabel(page.publishedHoursBeforeEvent)}</span>
        </div>
        <div className={`mock-ad${result.winner ? '' : ' is-empty'}`}>
          <span className="mock-ad-label">Ad slot</span>
          {result.winner ? (
            <><strong>{result.winner.name}</strong><span>{VERTICAL_LABEL[result.winner.vertical]}</span></>
          ) : (
            <span>{result.blockedKeyword ? <>Empty<br />blocked for “{result.blockedKeyword}”</> : 'Empty'}</span>
          )}
        </div>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

const pageOf = (d: StoryData, id: string) => d.auctions.find(x => x.page.id === id)!;

function salienceNote(page: Page): string {
  const s = salienceOf(page, ENTITY_ID);
  if (!s) return 'SkyJet not mentioned';
  return s >= SALIENCE_MIN ? `About SkyJet (salience ${s.toFixed(2)})` : `SkyJet in passing (salience ${s.toFixed(2)})`;
}

interface Scene {
  headline: string;
  copy: (d: StoryData) => ReactNode;
  stat?: (d: StoryData) => { value: string; label: string } | null;
  stage: (d: StoryData, a: StoryActions) => ReactNode;
}

const SCENE_DEFS: Scene[] = [
  {
    headline: 'Keyword blocking gets breaking news wrong twice',
    copy: () => <>SkyJet, a fictional airline, has just crashed. Publishers protect brands today by blocking any page that
      contains words like “crash”. That blocks too much and too little at the same time.</>,
    stage: d => {
      const a = pageOf(d, 'A'), b = pageOf(d, 'B');
      return (
        <div className="mock-pair">
          <PageMock page={a.page} result={a.keyword} caption={<><IssueChip issue={keywordIssue(a.page, a.keyword, d.clock)} />
            <span>Every advertiser is turned away. {num(a.page.impressionsPerHour)} impressions an hour go unsold.</span></>} />
          <PageMock page={b.page} result={b.keyword} caption={<><IssueChip issue={keywordIssue(b.page, b.keyword, d.clock)} />
            <span>No blocked words, so a travel ad runs beside the airline that just crashed.</span></>} />
        </div>
      );
    },
  },
  {
    headline: 'The Live Event Layer spots the event within 20 minutes',
    copy: () => <>It counts SkyJet mentions every 10 minutes. When they jump far above normal and most new coverage is
      negative, it fires an event, something keyword blocking has no idea about.</>,
    stat: d => (d.detection.bucket ? { value: `+${d.detection.bucket.minute} min`, label: `event fires, confidence ${d.detection.bucket.confidence.toFixed(2)}` } : null),
    stage: (d, act) => {
      const ev = d.detection.events;
      const crash = d.neg === SEED.polarityPresets.crash;
      return (
        <div className="stage-stack">
          <VelocityChart detection={d.detection} />
          <div className="stage-row">
            {ev.length ? (
              <div className="event-strip">
                <span className="pulse" aria-hidden="true" />
                <span><strong>Event on SkyJet.</strong> Affects {joinList(ev.map(e => VERTICAL_SHORT[e.vertical]))} advertisers, fades over 48 hours.</span>
              </div>
            ) : (
              <div className="event-strip is-quiet">{d.playing ? 'Checking each 10-minute bucket…' : crash ? 'No event yet.' : 'Same spike, but the coverage is positive: no event.'}</div>
            )}
            <div className="stage-actions">
              <button type="button" className="btn" onClick={act.playSpike} disabled={d.playing}>Replay</button>
              <button type="button" className="btn" onClick={() => act.setNeg(crash ? SEED.polarityPresets.positiveStory : SEED.polarityPresets.crash)}>
                {crash ? 'Try a positive story' : 'Back to the crash'}
              </button>
            </div>
          </div>
        </div>
      );
    },
  },
  {
    headline: 'It changes only the pages and advertisers that matter',
    copy: d => <>Pages where SkyJet is central drop one safety tier, and only for{' '}
      {joinList(d.detection.events.map(e => VERTICAL_SHORT[e.vertical]))} ads. A page that mentions SkyJet in passing, or
      not at all, is left alone.</>,
    stage: d => (
      <div className="before-after">
        <div className="ba-head"><span /><span>Keyword blocking today</span><span aria-hidden="true" /><span>Live Event Layer</span></div>
        {d.auctions.map(pa => {
          const o = compareOutcome(pa.page, pa.keyword, pa.lel, d.detection.events);
          return (
            <div key={pa.page.id} className={`ba-row is-${o}`}>
              <span className="ba-page"><span className="page-id sm">{pa.page.id}</span>
                <span>{pa.page.title}<small>{salienceNote(pa.page)}</small></span></span>
              <span className={`ba-ad${pa.keyword.winner ? '' : ' is-empty'}`}>{pa.keyword.winner?.name ?? 'No ad'}</span>
              <span className="ba-arrow" aria-hidden="true">→</span>
              <span className="ba-after"><span className={`ba-ad${pa.lel.winner ? '' : ' is-empty'}`}>{pa.lel.winner?.name ?? 'No ad'}</span><OutcomeChip outcome={o} />
                <span className="ba-today">Today: {pa.keyword.winner?.name ?? 'no ad'}</span></span>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    headline: 'And it steps back as the story fades',
    copy: () => <>News moves on, so the adjustment does too. The event’s weight halves every 24 hours. Below 0.25, after 48
      hours, it ends and every page goes back to normal.</>,
    stat: d => {
      const w = weight(d.clock);
      return { value: w.toFixed(2), label: `event weight at +${d.clock}h, ${w >= SEED.eventTemplate.minWeight ? 'still active' : 'ended'}` };
    },
    stage: (d, act) => <DecayStage d={d} act={act} />,
  },
  {
    headline: 'The publisher earns more, and brands stay safer',
    copy: () => <>Same four pages, same bids, the first 48 hours of the event. All numbers are simulated, and every one comes
      from the decision engine in the prototype.</>,
    stage: d => {
      if (!d.report) return <p className="muted">Play the Detect scene first.</p>;
      const r = d.report, diff = r.lel.revenue - r.keyword.revenue;
      return (
        <div className="stage-stack">
          <div className="result-hero">
            <div><span className="rh-label">Keyword blocking</span><span className="rh-value is-muted">{money(r.keyword.revenue)}</span><span className="rh-sub">RPM {money2(r.keyword.rpm)}</span></div>
            <span className="rh-arrow" aria-hidden="true">→</span>
            <div><span className="rh-label">Live Event Layer</span><span className="rh-value">{money(r.lel.revenue)}</span><span className="rh-sub">RPM {money2(r.lel.rpm)}</span></div>
            <Chip tone="ok">{signed(diff / r.keyword.revenue * 100, v => v.toFixed(0))}% revenue</Chip>
          </div>
          <div className="result-pair">
            <div><span className="rp-value">{num(r.recoveredImpressions)}</span><span className="rp-label">impressions recovered: the crash report runs a brand-safe ad instead of nothing</span></div>
            <div><span className="rp-value">{num(r.protectedImpressions)}</span><span className="rp-label">impressions protected: no travel ads beside the SkyJet story</span></div>
          </div>
          <RevenueChart data={d.hourly} clock={d.clock} />
        </div>
      );
    },
  },
];

function DecayStage({ d, act }: { d: StoryData; act: StoryActions }) {
  const [running, setRunning] = useState(false);
  const clockRef = useRef(d.clock);
  clockRef.current = d.clock;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      if (clockRef.current >= 96) { setRunning(false); return; }
      act.setClock(Math.min(96, clockRef.current + 2));
    }, 70);
    return () => clearInterval(t);
  }, [running, act]);
  const b = pageOf(d, 'B');
  const active = weight(d.clock) >= SEED.eventTemplate.minWeight;
  return (
    <div className="stage-stack">
      <div className="decay-control">
        <button type="button" className="btn btn-primary" onClick={() => { if (!running && d.clock >= 96) act.setClock(0); setRunning(r => !r); }}>
          {running ? 'Pause' : '▶ Play 0 to 96 hours'}
        </button>
        <div className="decay-timeline"><Timeline clock={d.clock} onChange={h => { setRunning(false); act.setClock(h); }} fired={d.detection.fired} /></div>
      </div>
      <PageMock page={b.page} result={b.lel} caption={active
        ? <><Chip tone="brand">Protected</Chip><span>The step-down is on, so the travel ad is held back and a finance ad runs instead.</span></>
        : <><Chip>Back to normal</Chip><span>The event has ended. Travel demand returns to this page.</span></>} />
    </div>
  );
}

export function StoryView({ scene, onGo, onOpenPrototype, data, actions }: {
  scene: number; onGo: (i: number) => void; onOpenPrototype: () => void; data: StoryData; actions: StoryActions;
}) {
  const s = SCENE_DEFS[scene - 1];
  const stat = s.stat?.(data) ?? null;
  const last = scene === SCENES.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' && scene < SCENES.length) onGo(scene + 1);
      if (e.key === 'ArrowLeft' && scene > 1) onGo(scene - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scene, onGo]);

  return (
    <div className="story-view">
      <ol className="scene-steps" aria-label="Story scenes">
        {SCENES.map((label, i) => (
          <li key={label}>
            <button type="button" onClick={() => onGo(i + 1)} aria-current={i + 1 === scene ? 'step' : undefined}
              className={i + 1 === scene ? 'is-current' : i + 1 < scene ? 'is-done' : ''}>
              <span className="scene-num">{i + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>
      <section className="scene" aria-live="polite" key={scene}>
        <div className="scene-copy">
          <h2>{s.headline}</h2>
          <p>{s.copy(data)}</p>
          {stat && <div className="scene-stat"><span>{stat.value}</span>{stat.label}</div>}
          <div className="scene-nav">
            <button type="button" className="btn" onClick={() => onGo(scene - 1)} disabled={scene === 1}>Back</button>
            {last
              ? <button type="button" className="btn btn-primary" onClick={onOpenPrototype}>Open the prototype</button>
              : <button type="button" className="btn btn-primary" onClick={() => onGo(scene + 1)}>Next: {SCENES[scene]}</button>}
          </div>
          <p className="scene-hint">Use ← and → to move between scenes.</p>
        </div>
        <div className="scene-stage">{s.stage(data, actions)}</div>
      </section>
    </div>
  );
}
