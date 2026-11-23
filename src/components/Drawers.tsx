import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { acceptanceChecks } from '../checks';
import {
  ENTITY_ID, SALIENCE_MIN, SEED, VERTICAL_LABEL, failReasons, holdReason, isActive, pageBreakdown, runAuction, salienceOf, weight,
} from '../engine';
import { money, money2, num, signed } from '../format';
import type { AuctionResult, Ctx, Detection, Mode, Page, PageId, Report } from '../types';
import { Chip, Segmented, TierBadge } from './ui';

export type DrawerState =
  | { kind: 'page'; pageId: PageId; tab: 'log' | 'bid' }
  | { kind: 'event' } | { kind: 'revenue' } | { kind: 'deal' } | { kind: 'checks' } | { kind: 'about' }
  | null;

export function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, [title]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-head">
          <div>
            <h2 id="drawer-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

const advById = (id: string) => SEED.advertisers.find(a => a.id === id)!;

/* Decision log and bid request for one page ------------------------------- */

function DecisionLog({ result, page, mode }: { result: AuctionResult; page: Page; mode: Mode }) {
  return (
    <>
      <p className="drawer-note">
        {mode === 'keyword'
          ? 'Keyword blocking: if any blocklisted word is on the page, no ad runs; otherwise every advertiser can bid.'
          : 'Live Event Layer: an advertiser is eligible when the page’s effective tier is at or above its minimum.'}
        {' '}Score is bid CPM × relevance. The highest eligible score wins and pays its bid.
      </p>
      <table className="table log-table">
        <thead>
          <tr><th>Advertiser</th><th>Tier</th><th>Eligible</th><th className="num">Score</th></tr>
        </thead>
        {result.rows.map(r => {
          const a = advById(r.advertiserId);
          const reason = mode === 'lel' ? holdReason(r, a) : null;
          return (
            <tbody key={r.advertiserId} className={r.winner ? 'is-winner' : ''}>
              <tr>
                <td><strong>{a.name}</strong>{r.winner && <Chip tone="brand">Winner</Chip>}<span className="cell-sub">{VERTICAL_LABEL[a.vertical]}, needs tier {a.minTier}</span></td>
                <td className="nowrap">
                  {mode === 'lel'
                    ? <><TierBadge tier={r.baseTier} />{r.stepDown ? <> <span aria-hidden="true">→</span> <TierBadge tier={r.effectiveTier} /></> : null}</>
                    : <span className="muted">not used</span>}
                </td>
                <td>{r.eligible ? <Chip tone="ok">Yes</Chip> : <Chip tone={reason === 'event' ? 'event' : 'no'}>{reason === 'event' ? 'No, event' : 'No'}</Chip>}</td>
                <td className="num">{r.score.toFixed(2)}<span className="cell-sub">{a.bidCpm.toFixed(2)} × {a.relevance[page.id]}</span></td>
              </tr>
              <tr className="rule-row">
                <td colSpan={4}>
                  <span className="rule-label">{mode === 'lel' ? (r.stepDown ? 'Step-down applied:' : 'No step-down:') : 'Rule:'}</span> {r.rule}. {r.why}.
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>
    </>
  );
}

const SLUGS: Record<PageId, string> = { A: 'skyjet-crash-denpasar', B: 'skyjet-new-bali-route', C: 'best-bali-beaches-2027', D: 'coconut-curry-15-minutes' };

function BidRequest({ result, page, mode, clock, ctx }: { result: AuctionResult; page: Page; mode: Mode; clock: number; ctx: Ctx }) {
  if (result.blockedKeyword) {
    return <p className="drawer-note">No bid request goes out for this page in keyword mode: “{result.blockedKeyword}” blocks it for every advertiser.</p>;
  }
  const content: Record<string, unknown> = { title: page.title, keywords: page.keywords };
  if (mode === 'lel') {
    const effectiveTierByVertical: Record<string, number> = {};
    result.rows.forEach(r => { effectiveTierByVertical[advById(r.advertiserId).vertical] = r.effectiveTier; });
    content.ext = {
      lel: {
        baseTier: page.baseTier,
        entities: page.entities,
        events: ctx.events.filter(e => page.entities.some(x => x.entityId === e.entityId))
          .map(e => ({ eventId: e.eventId, vertical: e.vertical, weight: +weight(clock, e.halfLifeHours).toFixed(3), active: isActive(e, clock) })),
        effectiveTierByVertical,
      },
    };
  }
  const req = {
    id: `req-${page.id}-h${clock}`,
    imp: [{ id: '1', banner: { w: 300, h: 250 }, bidfloor: 0 }],
    site: { page: `https://news.example/${SLUGS[page.id]}`, content },
    ext: { mode: mode === 'lel' ? 'live_event_layer' : 'keyword_blocking' },
  };
  return (
    <>
      <p className="drawer-note">Read-only and illustrative: the signals this page would carry to buyers. Not validated OpenRTB output.</p>
      <pre className="code">{JSON.stringify(req, null, 2)}</pre>
    </>
  );
}

export function PageDrawer({ pageId, tab, onTab, mode, clock, ctx, onClose }: {
  pageId: PageId; tab: 'log' | 'bid'; onTab: (t: 'log' | 'bid') => void; mode: Mode; clock: number; ctx: Ctx; onClose: () => void;
}) {
  const page = SEED.pages.find(p => p.id === pageId)!;
  const result = runAuction(page, clock, mode, ctx);
  const sal = salienceOf(page, ENTITY_ID);
  return (
    <Drawer title={`Page ${page.id}: ${page.title}`} onClose={onClose}
      subtitle={`${mode === 'lel' ? 'Live Event Layer' : 'Keyword blocking'} at +${clock}h. Base tier ${page.baseTier}, SkyJet salience ${sal ? sal.toFixed(2) : 'none'}.`}>
      <Segmented size="sm" label="Detail" value={tab} onChange={onTab}
        options={[{ value: 'log', label: 'Decision log' }, { value: 'bid', label: 'Bid request' }]} />
      <div className="drawer-section">
        {tab === 'log' ? <DecisionLog result={result} page={page} mode={mode} /> : <BidRequest result={result} page={page} mode={mode} clock={clock} ctx={ctx} />}
      </div>
    </Drawer>
  );
}

/* Detector details ---------------------------------------------------------- */

export function EventDrawer({ detection, neg, clock, onClose }: { detection: Detection; neg: number; clock: number; onClose: () => void }) {
  const after = detection.evals.filter(e => e.minute >= 0);
  const end = detection.bucket ? detection.bucket.minute : Math.max(after.reduce((a, b) => (b.mentions > a.mentions ? b : a)).minute, 10);
  const rows = after.filter(e => e.minute <= end);
  const ev = detection.events[0];
  return (
    <Drawer title="How the detector decided" onClose={onClose}
      subtitle="An event fires on the first 10-minute bucket where mentions are at least 5× baseline and at least 20, at least 60% of new content is negative, and confidence is at least 0.70.">
      <h3 className="drawer-h">Bucket by bucket</h3>
      <table className="table">
        <thead><tr><th>Bucket</th><th className="num">Mentions</th><th className="num">Ratio</th><th className="num">Confidence</th><th>Result</th></tr></thead>
        <tbody>
          {rows.map(e => (
            <tr key={e.minute} className={e.pass ? 'is-fire' : ''}>
              <td className="nowrap">+{e.minute} min</td>
              <td className="num">{e.mentions}</td>
              <td className="num">{e.ratio.toFixed(1)}×</td>
              <td className="num">{e.confidence.toFixed(2)}</td>
              <td>{e.pass ? <strong className="event-text">Fires the event</strong> : failReasons(e, neg).join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="drawer-note">Confidence = 0.5 × min(1, ratio ÷ 20) + 0.5 × negative share. {detection.fired ? 'Evaluation stops at the first bucket that passes.' : 'Shown up to the peak bucket.'}</p>
      {ev && (
        <>
          <h3 className="drawer-h">Event records</h3>
          <p className="drawer-note">One record per affected vertical. Weight = 0.5^(hours ÷ {ev.halfLifeHours}); the step-down ends below {ev.minWeight}.</p>
          <table className="table">
            <thead><tr><th>Record</th><th>Vertical</th><th className="num">Confidence</th><th className="num">Weight at +{clock}h</th><th>Status</th></tr></thead>
            <tbody>
              {detection.events.map(e => (
                <tr key={e.eventId}>
                  <td className="mono">{e.eventId}</td>
                  <td>{VERTICAL_LABEL[e.vertical]}</td>
                  <td className="num">{e.confidence.toFixed(2)}</td>
                  <td className="num">{weight(clock, e.halfLifeHours).toFixed(3)}</td>
                  <td>{isActive(e, clock) ? <Chip tone="event">Active</Chip> : <Chip>Ended</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Drawer>
  );
}

/* Revenue breakdown --------------------------------------------------------- */

export function RevenueDrawer({ report, ctx, onClose }: { report: Report; ctx: Ctx; onClose: () => void }) {
  const pages = useMemo(() => pageBreakdown(ctx), [ctx]);
  const row = (label: string, k: string, l: string, d: string) => (
    <tr><td>{label}</td><td className="num">{k}</td><td className="num">{l}</td><td className="num"><strong>{d}</strong></td></tr>
  );
  return (
    <Drawer title="Publisher report" subtitle={`Hours 0–47 of the event, ${num(report.keyword.impressions)} impressions across four pages. Simulated.`} onClose={onClose}>
      <table className="table">
        <thead><tr><th>Metric</th><th className="num">Keyword</th><th className="num">Layer</th><th className="num">Difference</th></tr></thead>
        <tbody>
          {row('Revenue', money(report.keyword.revenue), money(report.lel.revenue), signed(report.lel.revenue - report.keyword.revenue, money))}
          {row('RPM', money2(report.keyword.rpm), money2(report.lel.rpm), signed(report.lel.rpm - report.keyword.rpm, money2))}
          {row('Fill rate', `${(report.keyword.fillRate * 100).toFixed(1)}%`, `${(report.lel.fillRate * 100).toFixed(1)}%`, `${signed((report.lel.fillRate - report.keyword.fillRate) * 100, v => v.toFixed(1))} pts`)}
          {row('Impressions protected', '–', num(report.protectedImpressions), signed(report.protectedImpressions, num))}
          {row('Impressions recovered', '–', num(report.recoveredImpressions), signed(report.recoveredImpressions, num))}
        </tbody>
      </table>
      <h3 className="drawer-h">Revenue by page</h3>
      <table className="table">
        <thead><tr><th>Page</th><th className="num">Keyword</th><th className="num">Layer</th><th className="num">Difference</th></tr></thead>
        <tbody>
          {pages.map(p => (
            <tr key={p.page.id}>
              <td><strong>{p.page.id}</strong> <span className="muted">{p.page.title}</span></td>
              <td className="num">{money(p.keywordRevenue)}</td><td className="num">{money(p.lelRevenue)}</td>
              <td className="num"><span className={p.lelRevenue > p.keywordRevenue ? 'up' : p.lelRevenue < p.keywordRevenue ? 'down' : ''}>{signed(p.lelRevenue - p.keywordRevenue, money)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="drawer-note">Page A earns again because the layer judges the story, not the word “crash”. Page B earns less during the event because travel ads are held back beside the SkyJet story. That is the cost of protection, and Page A more than covers it.</p>
      <h3 className="drawer-h">Definitions</h3>
      <dl className="defs">
        <dt>Impressions protected</dt><dd>Impressions where keyword blocking would run a travel, airline or insurance ad beside a story where SkyJet is central, and the layer picks a different ad.</dd>
        <dt>Impressions recovered</dt><dd>Impressions keyword blocking leaves empty that the layer fills.</dd>
        <dt>RPM</dt><dd>Revenue ÷ impressions × 1,000. Every figure is the sum of 48 hourly auctions per page.</dd>
      </dl>
    </Drawer>
  );
}

/* Deal ---------------------------------------------------------------------- */

export function DealDrawer({ ctx, clock, onClose }: { ctx: Ctx; clock: number; onClose: () => void }) {
  const active = ctx.events.some(e => isActive(e, clock));
  const pages = SEED.pages.filter(p => salienceOf(p, ENTITY_ID) >= SALIENCE_MIN);
  const affected = ctx.events.map(e => e.vertical);
  return (
    <Drawer title="Breaking-safe News deal" onClose={onClose}
      subtitle={active ? `Live at +${clock}h. It uses the same rule as the auction: pages where SkyJet is central, affected verticals only.` : `Ended. At +${clock}h the event weight is below ${SEED.eventTemplate.minWeight}.`}>
      {active ? (
        <>
          <h3 className="drawer-h">Pages in the deal</h3>
          {pages.map(p => {
            const res = runAuction(p, clock, 'lel', ctx);
            return (
              <div key={p.id} className="deal-page">
                <strong>Page {p.id}</strong> <span className="muted">{p.title}</span>
                <div className="deal-line"><Chip tone="ok">Can bid</Chip> {res.rows.filter(r => r.eligible).map(r => advById(r.advertiserId).name).join(', ')}</div>
                <div className="deal-line"><Chip tone="no">Held back</Chip> {res.rows.filter(r => !r.eligible).map(r => {
                  const a = advById(r.advertiserId); return `${a.name} (${holdReason(r, a) === 'event' ? 'event' : 'base tier'})`;
                }).join(', ')}</div>
              </div>
            );
          })}
          <h3 className="drawer-h">What buyers see</h3>
          <table className="table">
            <thead><tr><th>Advertiser</th><th>Kept off</th><th>Still runs on</th></tr></thead>
            <tbody>
              {SEED.advertisers.filter(a => affected.includes(a.vertical)).map(a => {
                const off: string[] = [], on: string[] = [];
                SEED.pages.forEach(p => {
                  const r = runAuction(p, clock, 'lel', ctx).rows.find(x => x.advertiserId === a.id)!;
                  if (r.eligible) on.push(p.id); else off.push(`${p.id} (${holdReason(r, a) === 'event' ? 'event' : 'base tier'})`);
                });
                return <tr key={a.id}><td><strong>{a.name}</strong></td><td>{off.join(', ') || 'none'}</td><td>{on.join(', ') || 'none'}</td></tr>;
              })}
            </tbody>
          </table>
          <p className="drawer-note">{SEED.advertisers.filter(a => !affected.includes(a.vertical)).map(a => a.name).join(', ')} are outside the affected verticals and bid as usual.</p>
        </>
      ) : <p className="drawer-note">Every page is back on its base tier. Drag the clock below 48 hours to see the deal live.</p>}
    </Drawer>
  );
}

/* Checks and about ---------------------------------------------------------- */

/** T1–T9 and T11 from the engine, plus T10 checked against the rendered page after mount. */
export function useChecks() {
  const [bannerOk, setBannerOk] = useState(false);
  useEffect(() => {
    const banner = document.getElementById('sim-banner');
    setBannerOk(!!banner && (banner.textContent ?? '').includes('Simulated data') && getComputedStyle(banner).position === 'sticky');
  }, []);
  return useMemo(() => {
    const list = acceptanceChecks();
    list.splice(9, 0, { id: 'T10', name: '“Simulated data” banner is pinned and visible on every screen', pass: bannerOk });
    return list;
  }, [bannerOk]);
}

export function ChecksDrawer({ onClose }: { onClose: () => void }) {
  const checks = useChecks();
  const pass = checks.filter(c => c.pass).length;
  return (
    <Drawer title="Acceptance tests" subtitle={`${pass} of ${checks.length} pass. They run in your browser against the same engine the screen uses, and in Vitest on every build.`} onClose={onClose}>
      <table className="table">
        <thead><tr><th>Test</th><th>Check</th><th>Result</th></tr></thead>
        <tbody>
          {checks.map(c => (
            <tr key={c.id}><td><strong>{c.id}</strong></td><td>{c.name}</td><td>{c.pass ? <Chip tone="ok">Pass</Chip> : <Chip tone="no">Fail</Chip>}</td></tr>
          ))}
        </tbody>
      </table>
    </Drawer>
  );
}

export function AboutDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title="About this prototype" subtitle="One story, two minutes: when news about an entity turns, adjust only the right pages, for the right advertisers, for as long as it matters." onClose={onClose}>
      <h3 className="drawer-h">Real, in code</h3>
      <p className="drawer-note">Event firing rule, entity matching by ID, salience gate, vertical sensitivity, one-tier step-down, decay, auction eligibility, decision log and report arithmetic.</p>
      <h3 className="drawer-h">Simulated</h3>
      <p className="drawer-note">Entity extraction, mention velocity, polarity, traffic, bids and revenue. SkyJet, the advertisers and the pages are fictional. Nothing connects to Media.net, Yahoo/Bing or publisher inventory.</p>
      <h3 className="drawer-h">How to read the screen</h3>
      <dl className="defs">
        <dt>Mode</dt><dd>Compare today’s keyword blocking with the Live Event Layer on the same pages and the same bids.</dd>
        <dt>Clock</dt><dd>Hours since the event started. The step-down weakens with a 24-hour half-life and ends after 48 hours.</dd>
        <dt>Tiers</dt><dd>1 is high risk and 4 is fully safe. An ad is eligible when the page’s tier is at or above the advertiser’s minimum.</dd>
        <dt>Red flag</dt><dd>In keyword mode, a travel, airline or insurance ad beside a story where SkyJet is central, during the first 48 hours.</dd>
      </dl>
    </Drawer>
  );
}
