import { describe, expect, it } from 'vitest';
import { acceptanceChecks } from './checks';
import { ENTITY_ID, SEED, compareOutcome, detect, keywordIssue, makeCtx, runAuction } from './engine';

describe('PRD acceptance tests', () => {
  for (const c of acceptanceChecks()) {
    it(`${c.id}: ${c.name}`, () => expect(c.pass).toBe(true));
  }
});

describe('expected winners table', () => {
  const crash = detect(SEED.spikeSeries, SEED.mentionsBaselinePer10Min, SEED.polarityPresets.crash, SEED.eventTemplate, ENTITY_ID);
  const ctx = makeCtx(crash.events);
  const winners = (h: number, mode: 'keyword' | 'lel') => SEED.pages.map(p => runAuction(p, h, mode, ctx).winner?.name ?? null);

  it('keyword mode at +1h', () => {
    expect(winners(1, 'keyword')).toEqual([null, 'FlyAway Holidays', 'FlyAway Holidays', 'QuickBite']);
  });
  it('Live Event Layer at +1h', () => {
    expect(winners(1, 'lel')).toEqual(['Glow Shampoo', 'Nimbus Bank', 'FlyAway Holidays', 'QuickBite']);
  });
  it('Live Event Layer at +60h', () => {
    expect(winners(60, 'lel')).toEqual(['Glow Shampoo', 'FlyAway Holidays', 'FlyAway Holidays', 'QuickBite']);
  });
});

describe('story outcomes at +1h', () => {
  const crash = detect(SEED.spikeSeries, SEED.mentionsBaselinePer10Min, SEED.polarityPresets.crash, SEED.eventTemplate, ENTITY_ID);
  const ctx = makeCtx(crash.events);
  it('A recovered, B protected, C and D unchanged; keyword mode over-blocks A and risks B', () => {
    const rows = SEED.pages.map(p => {
      const k = runAuction(p, 1, 'keyword', ctx), l = runAuction(p, 1, 'lel', ctx);
      return [compareOutcome(p, k, l, ctx.events), keywordIssue(p, k, 1)];
    });
    expect(rows).toEqual([['recovered', 'over-blocked'], ['protected', 'risky'], ['unchanged', null], ['unchanged', null]]);
  });
});
