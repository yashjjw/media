import { ENTITY_ID, SALIENCE_MIN, SEED, compareOutcome, holdReason, keywordIssue, salienceOf } from '../engine';
import { VERTICAL_SHORT, joinList, money2 } from '../format';
import type { AuctionResult, EventRecord, Mode, Page, PageId } from '../types';
import { Chip, IssueChip, OutcomeChip, Panel, Segmented, TierBadge } from './ui';

export interface PageAuction { page: Page; keyword: AuctionResult; lel: AuctionResult }

function SalienceChip({ page }: { page: Page }) {
  const s = salienceOf(page, ENTITY_ID);
  if (!s) return <Chip>SkyJet not mentioned</Chip>;
  return s >= SALIENCE_MIN
    ? <Chip tone="brand">About SkyJet, salience {s.toFixed(2)}</Chip>
    : <Chip>SkyJet in passing, {s.toFixed(2)}</Chip>;
}

function PageCard({ pa, mode, clock, events, onOpen }: {
  pa: PageAuction; mode: Mode; clock: number; events: EventRecord[]; onOpen: () => void;
}) {
  const { page } = pa;
  const cur = mode === 'lel' ? pa.lel : pa.keyword;
  const stepped = mode === 'lel' ? cur.rows.filter(r => r.stepDown) : [];
  const verticals = [...new Set(stepped.map(r => SEED.advertisers.find(a => a.id === r.advertiserId)!.vertical))];
  const issue = keywordIssue(page, pa.keyword, clock);
  const outcome = compareOutcome(page, pa.keyword, pa.lel, events);
  const blocklisted = page.keywords.filter(k => SEED.keywordBlocklist.includes(k));

  let note: string | null = null;
  if (mode === 'keyword' && issue === 'over-blocked') note = `Blocked for every advertiser because the page contains “${pa.keyword.blockedKeyword}”.`;
  if (mode === 'keyword' && issue === 'risky') note = `⚠ Risky: ${VERTICAL_SHORT[cur.winner!.vertical]} ad beside SkyJet story`;
  if (mode === 'lel' && outcome === 'recovered') note = 'Brand-safe advertisers can run here again.';
  if (mode === 'lel' && outcome === 'protected') note = `${pa.keyword.winner?.name} is held back while SkyJet is in the news.`;

  return (
    <button type="button" className={`page-card${mode === 'keyword' && issue ? ` is-${issue}` : ''}`} onClick={onOpen} data-tour={`page-${page.id}`}
      aria-label={`Page ${page.id}: ${page.title}. Open decision log`}>
      <span className="page-id">{page.id}</span>
      <span className="page-main">
        <span className="page-title">{page.title}</span>
        <span className="page-meta">
          <SalienceChip page={page} />
          {mode === 'lel' ? (
            stepped.length ? (
              <span className="tier-change">Tier <TierBadge tier={page.baseTier} /><span aria-hidden="true">→</span><TierBadge tier={page.baseTier - 1} /> for {joinList(verticals.map(v => VERTICAL_SHORT[v]))} ads</span>
            ) : (
              <span className="tier-change">Tier <TierBadge tier={page.baseTier} /> unchanged</span>
            )
          ) : (
            <span className="kw-note">{blocklisted.length ? `Contains “${blocklisted.join('”, “')}”` : 'No blocked words'}</span>
          )}
        </span>
        {note && <span className={`page-note${mode === 'keyword' && issue === 'risky' ? ' is-risk' : ''}`}>{note}</span>}
      </span>
      <span className="page-ad">
        <span className="ad-label">Ad shown</span>
        {cur.blockedKeyword ? <span className="ad-name is-empty">None (blocked)</span>
          : cur.winner ? <span className="ad-name">{cur.winner.name}</span>
          : <span className="ad-name is-empty">None</span>}
        {cur.winner && <span className="ad-sub">{money2(cur.winner.bidCpm)} CPM</span>}
        <span className="ad-outcome">
          {mode === 'keyword' ? (issue && <IssueChip issue={issue} />) : <OutcomeChip outcome={outcome} />}
        </span>
        {mode === 'lel' && outcome !== 'unchanged' && <span className="ad-sub">Today: {pa.keyword.winner?.name ?? 'no ad'}</span>}
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
                    let cls = 'cell-ok', label = '✓';
                    if (r.winner) { cls = 'cell-win'; label = 'Wins'; }
                    else if (!r.eligible) {
                      if (mode === 'keyword') { cls = 'cell-kw'; label = 'Blocked'; }
                      else if (holdReason(r, adv) === 'event') { cls = 'cell-event'; label = 'Event'; }
                      else { cls = 'cell-tier'; label = 'Tier'; }
                    }
                    const tip = `${adv.name} on Page ${pa.page.id}: ${r.rule}. ${r.why}.`;
                    return (
                      <td key={r.advertiserId}>
                        <button type="button" className={cls} title={tip} aria-label={tip} onClick={() => onOpen(pa.page.id)}>{label}</button>
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

function Summary({ auctions, mode, clock, events }: { auctions: PageAuction[]; mode: Mode; clock: number; events: EventRecord[] }) {
  if (mode === 'keyword') {
    const issues = auctions.map(pa => keywordIssue(pa.page, pa.keyword, clock));
    const over = issues.filter(i => i === 'over-blocked').length, risky = issues.filter(i => i === 'risky').length;
    return (
      <div className="summary is-keyword">
        <strong>Keyword blocking today</strong> looks only for blocked words on the page.
        {(over || risky) ? <> Right now: {over ? `${over} page over-blocked` : ''}{over && risky ? ', ' : ''}{risky ? `${risky} risky placement` : ''}.</> : ' No problems at this hour.'}
      </div>
    );
  }
  if (!events.length) {
    return <div className="summary"><strong>Live Event Layer</strong> with no event yet: every page uses its normal suitability tier. Trigger the news spike to fire an event.</div>;
  }
  const outs = auctions.map(pa => compareOutcome(pa.page, pa.keyword, pa.lel, events));
  const count = (o: string) => outs.filter(x => x === o).length;
  const parts = [
    count('recovered') && `${count('recovered')} recovered`,
    count('protected') && `${count('protected')} protected`,
    count('changed') && `${count('changed')} changed`,
    count('unchanged') && `${count('unchanged')} unchanged`,
  ].filter(Boolean);
  return (
    <div className="summary is-lel">
      <strong>Live Event Layer</strong> steps a page down one tier only where SkyJet is central, and only for affected advertisers.
      {' '}Compared with keyword blocking: {parts.join(', ')}.
    </div>
  );
}

export function PropagatePanel({ auctions, mode, clock, events, view, onView, onOpen, highlighted }: {
  auctions: PageAuction[]; mode: Mode; clock: number; events: EventRecord[];
  view: 'pages' | 'grid'; onView: (v: 'pages' | 'grid') => void; onOpen: (id: PageId) => void; highlighted: boolean;
}) {
  return (
    <Panel id="propagate" title="Propagate: decide where ads run"
      lede="The ad each page shows right now, using the approach selected at the top." highlighted={highlighted}>
      <Summary auctions={auctions} mode={mode} clock={clock} events={events} />
      <div className="panel-toolbar">
        <Segmented size="sm" label="View" value={view} onChange={onView}
          options={[{ value: 'pages', label: 'Pages' }, { value: 'grid', label: 'All advertisers' }]} />
        <span className="hint">Select a page to see each advertiser’s decision.</span>
      </div>
      {view === 'pages' ? (
        <div className="page-list">
          {auctions.map(pa => <PageCard key={pa.page.id} pa={pa} mode={mode} clock={clock} events={events} onOpen={() => onOpen(pa.page.id)} />)}
        </div>
      ) : (
        <AdvertiserGrid auctions={auctions} mode={mode} onOpen={onOpen} />
      )}
    </Panel>
  );
}
