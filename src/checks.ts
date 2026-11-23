// Acceptance tests from the PRD, written once and used twice:
// by Vitest (src/engine.test.ts) and by the "Checks" panel in the app.

import { SEED, ENTITY_ID, buildReport, detect, explainNoFire, isActive, makeCtx, propagate, runAuction, weight } from './engine';
import type { PageId } from './types';

export interface Check { id: string; name: string; pass: boolean }

export function acceptanceChecks(): Check[] {
  const crash = detect(SEED.spikeSeries, SEED.mentionsBaselinePer10Min, SEED.polarityPresets.crash, SEED.eventTemplate, ENTITY_ID);
  const pos = detect(SEED.spikeSeries, SEED.mentionsBaselinePer10Min, SEED.polarityPresets.positiveStory, SEED.eventTemplate, ENTITY_ID);
  const ctx = makeCtx(crash.events);
  const page = (id: PageId) => SEED.pages.find(p => p.id === id)!;
  const winner = (id: PageId, h: number, m: 'keyword' | 'lel') => runAuction(page(id), h, m, ctx).winner?.id ?? null;
  const eligible = (id: PageId, h: number) => runAuction(page(id), h, 'lel', ctx).rows.filter(r => r.eligible).map(r => r.advertiserId);
  const r = buildReport(ctx, 48);
  const flyaway = SEED.advertisers.find(a => a.id === 'flyaway')!;
  const many = propagate(page('B'), flyaway, 1, [...crash.events, ...crash.events, ...crash.events]);

  return [
    { id: 'T1', name: 'Crash preset fires at +20 min with confidence 0.91, and not at +10 min',
      pass: crash.bucket?.minute === 20 && crash.bucket.confidence.toFixed(2) === '0.91' && !crash.evals.some(e => e.minute < 20 && e.pass) },
    { id: 'T2', name: 'Positive preset fires no event and says polarity is not negative',
      pass: !pos.fired && /polarity not negative/.test(explainNoFire(pos.evals, SEED.polarityPresets.positiveStory)) },
    { id: 'T3', name: 'FlyAway, BlueSky and SafeTrip are ineligible on A and B at +1h',
      pass: (['A', 'B'] as PageId[]).every(p => ['flyaway', 'bluesky', 'safetrip'].every(a => !eligible(p, 1).includes(a))) },
    { id: 'T4', name: 'Glow and QuickBite are eligible on A at +1h, and Glow wins',
      pass: eligible('A', 1).includes('glow') && eligible('A', 1).includes('quickbite') && winner('A', 1, 'lel') === 'glow' },
    { id: 'T5', name: 'C and D winners are identical in both modes at +1h',
      pass: (['C', 'D'] as PageId[]).every(p => winner(p, 1, 'lel') === winner(p, 1, 'keyword')) },
    { id: 'T6', name: 'Event is still active at +48h (weight 0.25)',
      pass: weight(48) === 0.25 && isActive(crash.events[0], 48) },
    { id: 'T7', name: 'Event is inactive from +49h, and Page B goes back to FlyAway',
      pass: !isActive(crash.events[0], 49) && winner('B', 49, 'lel') === 'flyaway' && winner('B', 60, 'lel') === 'flyaway' },
    { id: 'T8', name: 'Several matching records step down one tier, never two',
      pass: many.stepDown === 1 && many.effectiveTier === 2 },
    { id: 'T9', name: 'Report: $4,104 vs $6,216, RPM $2.38 vs $3.60, 384,000 protected, 960,000 recovered',
      pass: Math.round(r.keyword.revenue) === 4104 && Math.round(r.lel.revenue) === 6216 && r.keyword.rpm.toFixed(2) === '2.38'
        && r.lel.rpm.toFixed(2) === '3.60' && r.protectedImpressions === 384000 && r.recoveredImpressions === 960000 },
    { id: 'T11', name: 'Every decision row names its rule and shows tiers, eligibility and score',
      pass: SEED.pages.every(p => (['keyword', 'lel'] as const).every(m => runAuction(p, 1, m, ctx).rows.every(x =>
        x.rule.length > 3 && typeof x.effectiveTier === 'number' && typeof x.eligible === 'boolean' && typeof x.score === 'number'))) },
  ];
}
