import { ENTITY_ID, SALIENCE_MIN, SEED, holdReason, isRiskyPlacement, salienceOf } from '../engine';
import { VERTICAL_SHORT, joinList, money2 } from '../format';
import type { AuctionResult, EventRecord, Mode, Page, PageId } from '../types';
import { Chip, Panel, Segmented, TierBadge } from './ui';

export interface PageAuction { page: Page; keyword: AuctionResult; lel: AuctionResult }

function SalienceChip({ page }: { page: Page }) {
  const s = salienceOf(page, ENTITY_ID);
  if (!s) return <Chip>SkyJet not mentioned</Chip>;
  return s >= SALIENCE_MIN
    ? <Chip tone="brand">SkyJet central, {s.toFixed(2)}</Chip>
    : <Chip>SkyJet in passing, {s.toFixed(2)}</Chip>;
}

function PageCard({ pa, mode, clock, onOpen }: { pa: PageAuction; mode: Mode; clock: number; onOpen: () => void }) {
  const { page } = pa;
  const cur = mode === 'lel' ? pa.lel : pa.keyword;
  const stepped = mode === 'lel' ? cur.rows.filter(r => r.stepDown) : [];
  const verticals = [...new Set(stepped.map(r => SEED.advertisers.find(a => a.id === r.advertiserId)!.vertical))];
  const risky = isRiskyPlacement(page, cur.winner, clock, mode);
  const changed = mode === 'lel' && (pa.keyword.winner?.id ?? null) !== (pa.lel.winner?.id ?? null);
  const blocklisted = page.keywords.filter(k => SEED.keywordBlocklist.includes(k));

  return (
    <button type="button" className={`page-card${risky ? ' is-risky' : ''}`} onClick={onOpen} aria-label={`Page ${page.id}: ${page.title}. Open decision log`}>
      <span className="page-id">{page.id}</span>
      <span className="page-main">
        <span className="page-title">{page.title}</span>
        <span className="page-meta">
          <SalienceChip page={page} />
          {mode === 'lel' ? (
            stepped.length ? (
              <span className="tier-change"><TierBadge tier={page.baseTier} /><span aria-hidden="true">→</span><TierBadge tier={page.baseTier - 1} /> for {joinList(verticals.map(v => VERTICAL_SHORT[v]))} ads</span>
            ) : (
              <span className="tier-change"><TierBadge tier={page.baseTier} /> unchanged</span>
            )
          ) : (
            <span className="kw-note">{blocklisted.length ? `Contains “${blocklisted.join('”, “')}”` : 'No blocklisted words'}</span>
          )}
        </span>
        {risky && <span className="risk-flag">⚠ Risky: {VERTICAL_SHORT[cur.winner!.vertical]} ad beside SkyJet story</span>}
      </span>
      <span className="page-ad">
        {cur.blockedKeyword ? (
          <><span className="ad-name is-empty">Blocked, no ad</span><span className="ad-sub">0 revenue</span></>
        ) : cur.winner ? (
          <><span className="ad-name">{cur.winner.name}</span>
            <span className="ad-sub">{changed ? `was ${pa.keyword.winner?.name ?? 'no ad'}` : `${money2(cur.winner.bidCpm)} CPM`}</span></>
        ) : (
          <span className="ad-name is-empty">No eligible ad</span>
        )}
      </span>
      <span className="chevron" aria-hidden="true">›</span>
    </button>
  );
}

function AdvertiserGrid({ auctions, mode, onOpen }: { auctions: PageAuction[]; mode: Mode; onOpen: (id: PageId) => void }) {
  return (
    <>
      <div className="grid-scroll">
        <table className="adv-grid">
          <thead>
            <tr>
              <th scope="col" className="row-head">Page</th>
              {SEED.advertisers.map(a => (
                <th scope="col" key={a.id}>{a.name.split(' ')[0]}<span>{VERTICAL_SHORT[a.vertical]}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {auctions.map(pa => {
              const cur = mode === 'lel' ? pa.lel : pa.keyword;
              return (
                <tr key={pa.page.id}>
                  <th scope="row" className="row-head">{pa.page.id}</th>
                  {cur.rows.map(r => {
                    const adv = SEED.advertisers.find(a => a.id === r.advertiserId)!;
                    let cls = 'cell-ok', label = 'Eligible';
                    if (r.winner) { cls = 'cell-win'; label = 'Wins'; }
                    else if (!r.eligible) {
                      if (mode === 'keyword') { cls = 'cell-kw'; label = 'Blocked'; }
                      else if (holdReason(r, adv) === 'event') { cls = 'cell-event'; label = 'Event'; }
                      else { cls = 'cell-tier'; label = 'Tier'; }
                    }
                    const tip = `${adv.name} on Page ${pa.page.id}: ${r.rule}. ${r.why}.`;
                    return (
                      <td key={r.advertiserId}>
                        <button type="button" className={cls} title={tip} aria-label={tip} onClick={() => onOpen(pa.page.id)}>
                          {label === 'Eligible' ? '✓' : label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid-legend">
        <span><i className="cell-win" />Wins</span>
        <span><i className="cell-ok" />Eligible</span>
        {mode === 'lel' ? <>
          <span><i className="cell-event" />Held back by the event</span>
          <span><i className="cell-tier" />Below its minimum tier</span>
        </> : <span><i className="cell-kw" />Blocked by keyword</span>}
      </div>
    </>
  );
}

export function PropagatePanel({ auctions, mode, clock, events, view, onView, onOpen, highlighted }: {
  auctions: PageAuction[]; mode: Mode; clock: number; events: EventRecord[];
  view: 'pages' | 'grid'; onView: (v: 'pages' | 'grid') => void; onOpen: (id: PageId) => void; highlighted: boolean;
}) {
  const summary = mode === 'keyword'
    ? 'Keyword blocking checks words on the page, not what the story is about.'
    : events.length
      ? 'Only pages where SkyJet is central step down one tier, and only for affected advertisers.'
      : 'Pages use their base suitability tier. No event is active.';
  return (
    <Panel id="propagate" step={2} title="Propagate" question="Which pages change, and for which advertisers?" highlighted={highlighted}>
      <div className="panel-toolbar">
        <p className="lede">{summary}</p>
        <Segmented size="sm" label="View" value={view} onChange={onView}
          options={[{ value: 'pages', label: 'Pages' }, { value: 'grid', label: 'All advertisers' }]} />
      </div>
      {view === 'pages' ? (
        <div className="page-list">
          {auctions.map(pa => <PageCard key={pa.page.id} pa={pa} mode={mode} clock={clock} onOpen={() => onOpen(pa.page.id)} />)}
        </div>
      ) : (
        <AdvertiserGrid auctions={auctions} mode={mode} onOpen={onOpen} />
      )}
      <p className="hint">Select a page to see why each advertiser was or wasn’t eligible.</p>
    </Panel>
  );
}
