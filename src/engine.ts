// Live Event Layer decision engine.
// Pure, deterministic functions with no UI dependencies (PRD "Decision logic").

import seedJson from './seed.json';
import type {
  Advertiser, AuctionResult, Bucket, BucketEval, Ctx, DecisionRow, Detection, EventRecord,
  EventTemplate, Mode, Page, PageBreakdown, Report, Seed, Vertical,
} from './types';

export const SEED = seedJson as Seed;
export const ENTITY_ID = SEED.entity.id;
export const SALIENCE_MIN = 0.5;

export const VERTICAL_LABEL: Record<Vertical, string> = {
  travel: 'Travel', airlines: 'Airlines', travel_insurance: 'Travel insurance',
  beauty: 'Beauty', food_delivery: 'Food delivery', finance: 'Finance',
};

/* 1. Detection ------------------------------------------------------------ */

export function evaluateBucket(b: Bucket, baseline: number, neg: number): BucketEval {
  const ratio = b.mentions / baseline;
  const confidence = 0.5 * Math.min(1, ratio / 20) + 0.5 * neg;
  const checks = {
    ratio: ratio >= 5,
    volume: b.mentions >= 20,
    polarity: neg >= 0.6,
    confidence: confidence >= 0.7,
  };
  return { ...b, ratio, confidence, checks, pass: Object.values(checks).every(Boolean) };
}

/** Fires on the first bucket where all four conditions hold; one EventRecord per template vertical. */
export function detect(series: Bucket[], baseline: number, neg: number, template: EventTemplate, entityId: string): Detection {
  const evals = series.map(b => evaluateBucket(b, baseline, neg));
  const hit = evals.find(e => e.pass) ?? null;
  const events: EventRecord[] = hit
    ? template.verticals.map(v => ({
        eventId: `evt-${entityId}-${v}`, entityId, vertical: v, riskClass: template.riskClass,
        confidence: hit.confidence, startMinute: hit.minute,
        halfLifeHours: template.halfLifeHours, minWeight: template.minWeight,
      }))
    : [];
  return { fired: !!hit, bucket: hit, evals, events };
}

/** Plain-language reasons a bucket did not pass. */
export function failReasons(e: BucketEval, neg: number): string[] {
  const r: string[] = [];
  if (!e.checks.ratio) r.push(`ratio ${e.ratio.toFixed(1)}× < 5×`);
  if (!e.checks.volume) r.push(`${e.mentions} mentions < 20`);
  if (!e.checks.polarity) r.push(`negative ${Math.round(neg * 100)}% < 60%`);
  if (!e.checks.confidence) r.push(`confidence ${e.confidence.toFixed(2)} < 0.70`);
  return r;
}

export function explainNoFire(evals: BucketEval[], neg: number): string {
  if (!evals.length) return 'No buckets evaluated yet.';
  const peak = evals.reduce((a, b) => (b.mentions > a.mentions ? b : a));
  if (peak.checks.ratio && peak.checks.volume && !peak.checks.polarity) return 'Velocity high, polarity not negative.';
  const r = failReasons(peak, neg);
  return r.length ? `Did not fire: ${r.join('; ')}.` : 'Did not fire.';
}

/* 2. Decay ---------------------------------------------------------------- */

export function weight(hours: number, halfLifeHours = 24): number {
  if (hours < 0) return 0;
  return Math.pow(0.5, hours / halfLifeHours);
}

export function isActive(ev: EventRecord, hours: number): boolean {
  return weight(hours, ev.halfLifeHours) >= ev.minWeight;
}

/* 3. Propagation ---------------------------------------------------------- */

export function salienceOf(page: Page, entityId: string): number {
  return page.entities.find(e => e.entityId === entityId)?.salience ?? 0;
}

export function propagate(page: Page, adv: Advertiser, hours: number, events: EventRecord[]): { stepDown: 0 | 1; rule: string; effectiveTier: number } {
  const base = page.baseTier;
  if (!events.length) return { stepDown: 0, rule: 'No event has fired', effectiveTier: base };
  const forVertical = events.filter(e => e.vertical === adv.vertical);
  if (!forVertical.length) return { stepDown: 0, rule: `${VERTICAL_LABEL[adv.vertical]} is not an affected vertical`, effectiveTier: base };
  const onPage = forVertical.filter(e => page.entities.some(x => x.entityId === e.entityId));
  if (!onPage.length) return { stepDown: 0, rule: 'Entity not on this page', effectiveTier: base };
  const sal = Math.max(...onPage.map(e => salienceOf(page, e.entityId)));
  if (sal < SALIENCE_MIN) return { stepDown: 0, rule: `Salience ${sal.toFixed(2)} < ${SALIENCE_MIN}, no step-down`, effectiveTier: base };
  const live = onPage.filter(e => isActive(e, hours));
  if (!live.length) {
    const w = weight(hours, onPage[0].halfLifeHours);
    return { stepDown: 0, rule: `Event expired: weight ${w.toFixed(2)} < ${onPage[0].minWeight}`, effectiveTier: base };
  }
  const w = weight(hours, live[0].halfLifeHours);
  // One tier, never more, even when several records match.
  return {
    stepDown: 1,
    rule: `Salience ${sal.toFixed(2)} ≥ ${SALIENCE_MIN}, ${VERTICAL_LABEL[adv.vertical].toLowerCase()} affected, weight ${w.toFixed(2)} ≥ ${live[0].minWeight}`,
    effectiveTier: base - 1,
  };
}

/* 4. Auction and eligibility ---------------------------------------------- */

export function keywordHit(page: Page, blocklist: string[]): string | null {
  return page.keywords.find(k => blocklist.includes(k)) ?? null;
}

export function runAuction(page: Page, hours: number, mode: Mode, ctx: Ctx): AuctionResult {
  const hit = mode === 'keyword' ? keywordHit(page, ctx.keywordBlocklist) : null;
  const rows: DecisionRow[] = ctx.advertisers.map(a => {
    const score = a.bidCpm * a.relevance[page.id];
    if (mode === 'keyword') {
      return {
        pageId: page.id, advertiserId: a.id, baseTier: page.baseTier, stepDown: 0,
        rule: hit ? `Page blocked for everyone: keyword “${hit}”` : 'No blocklisted keyword, so every advertiser is eligible',
        effectiveTier: page.baseTier, eligible: !hit, why: hit ? 'Blocked by keyword' : 'Keyword mode has no tier check',
        score, winner: false,
      };
    }
    const p = propagate(page, a, hours, ctx.events);
    const eligible = p.effectiveTier >= a.minTier;
    return {
      pageId: page.id, advertiserId: a.id, baseTier: page.baseTier, stepDown: p.stepDown, rule: p.rule,
      effectiveTier: p.effectiveTier, eligible, why: `Tier ${p.effectiveTier} ${eligible ? '≥' : '<'} minimum ${a.minTier}`,
      score, winner: false,
    };
  });
  let best: DecisionRow | null = null;
  for (const r of rows) if (r.eligible && (!best || r.score > best.score)) best = r;
  if (best) best.winner = true;
  const winner = best ? ctx.advertisers.find(a => a.id === best!.advertiserId) ?? null : null;
  const revenue = winner ? (page.impressionsPerHour * winner.bidCpm) / 1000 : 0;
  return { rows, winner, revenue, blockedKeyword: hit };
}

/* Report over hours 0..windowHours-1 -------------------------------------- */

export function buildReport(ctx: Ctx, windowHours = SEED.reportWindowHours): Report {
  const blank = () => ({ revenue: 0, impressions: 0, filled: 0, rpm: 0, fillRate: 0 });
  const out: Report = { keyword: blank(), lel: blank(), protectedImpressions: 0, recoveredImpressions: 0 };
  const eventVerticals = new Set(ctx.events.map(e => e.vertical));
  for (let h = 0; h < windowHours; h++) {
    for (const p of ctx.pages) {
      const k = runAuction(p, h, 'keyword', ctx);
      const l = runAuction(p, h, 'lel', ctx);
      out.keyword.revenue += k.revenue; out.lel.revenue += l.revenue;
      out.keyword.impressions += p.impressionsPerHour; out.lel.impressions += p.impressionsPerHour;
      if (k.winner) out.keyword.filled += p.impressionsPerHour;
      if (l.winner) out.lel.filled += p.impressionsPerHour;
      const salient = salienceOf(p, ctx.entityId) >= SALIENCE_MIN;
      if (k.winner && eventVerticals.has(k.winner.vertical) && salient && l.winner?.id !== k.winner.id) out.protectedImpressions += p.impressionsPerHour;
      if (!k.winner && l.winner) out.recoveredImpressions += p.impressionsPerHour;
    }
  }
  for (const m of [out.keyword, out.lel]) {
    m.rpm = (m.revenue / m.impressions) * 1000;
    m.fillRate = m.filled / m.impressions;
  }
  return out;
}

export function pageBreakdown(ctx: Ctx, windowHours = SEED.reportWindowHours): PageBreakdown[] {
  return ctx.pages.map(page => {
    let keywordRevenue = 0, lelRevenue = 0;
    for (let h = 0; h < windowHours; h++) {
      keywordRevenue += runAuction(page, h, 'keyword', ctx).revenue;
      lelRevenue += runAuction(page, h, 'lel', ctx).revenue;
    }
    return { page, keywordRevenue, lelRevenue };
  });
}

export function hourlyRevenue(ctx: Ctx, hours: number, mode: Mode): number {
  return ctx.pages.reduce((s, p) => s + runAuction(p, hours, mode, ctx).revenue, 0);
}

/* Helpers used by the UI --------------------------------------------------- */

export function makeCtx(events: EventRecord[]): Ctx {
  return { pages: SEED.pages, advertisers: SEED.advertisers, keywordBlocklist: SEED.keywordBlocklist, events, entityId: ENTITY_ID };
}

/** Keyword mode only: an affected-vertical ad beside a story where the entity is central, inside the event window. */
export function isRiskyPlacement(page: Page, winner: Advertiser | null, hours: number, mode: Mode): boolean {
  return mode === 'keyword' && !!winner && SEED.eventTemplate.verticals.includes(winner.vertical)
    && salienceOf(page, ENTITY_ID) >= SALIENCE_MIN && hours < SEED.reportWindowHours + 1;
}

/** Why an advertiser is not eligible in Live Event Layer mode. */
export function holdReason(row: DecisionRow, adv: Advertiser): 'event' | 'tier' | null {
  if (row.eligible) return null;
  return row.stepDown && row.baseTier >= adv.minTier ? 'event' : 'tier';
}

/* Story helpers: how a page's outcome differs between the two modes -------- */

export type Outcome = 'recovered' | 'protected' | 'unchanged' | 'changed';
export type KeywordIssue = 'over-blocked' | 'risky' | null;

/** Live Event Layer result compared with keyword blocking on the same page and hour. */
export function compareOutcome(page: Page, keyword: AuctionResult, lel: AuctionResult, events: EventRecord[]): Outcome {
  const k = keyword.winner?.id ?? null, l = lel.winner?.id ?? null;
  if (k === l) return 'unchanged';
  if (!keyword.winner && lel.winner) return 'recovered';
  const affected = new Set(events.map(e => e.vertical));
  if (keyword.winner && affected.has(keyword.winner.vertical) && salienceOf(page, ENTITY_ID) >= SALIENCE_MIN) return 'protected';
  return 'changed';
}

/** What keyword blocking gets wrong on this page right now. */
export function keywordIssue(page: Page, keyword: AuctionResult, hours: number): KeywordIssue {
  if (keyword.blockedKeyword) return 'over-blocked';
  if (isRiskyPlacement(page, keyword.winner, hours, 'keyword')) return 'risky';
  return null;
}
