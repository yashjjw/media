import { describe, expect, it } from 'vitest';
import { acceptanceChecks } from './checks';
import { ENTITY_ID, SEED, detect, makeCtx, runAuction } from './engine';

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
