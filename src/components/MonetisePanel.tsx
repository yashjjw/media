import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SALIENCE_MIN, SEED, ENTITY_ID, salienceOf, weight } from '../engine';
import { VERTICAL_SHORT, joinList, money, money2, num, signed } from '../format';
import type { EventRecord, Mode, Report } from '../types';
import { Chip, LinkButton, Panel } from './ui';

export interface HourPoint { h: number; keyword: number; lel: number }

function HourTooltip({ active, payload }: { active?: boolean; payload?: { payload: HourPoint }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="chart-tip">
      <strong>+{d.h}h</strong>
      <div>Live Event Layer {money2(d.lel)}/h</div>
      <div>Keyword blocking {money2(d.keyword)}/h</div>
    </div>
  );
}

function RevenueChart({ data, clock }: { data: HourPoint[]; clock: number }) {
  const tick = { fontSize: 11, fill: '#696670' };
  return (
    <div className="chart" role="img" aria-label="Revenue per hour for both modes over 96 hours">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="#efedf4" vertical={false} />
          <ReferenceArea x1={0} x2={48} fill="#d51254" fillOpacity={0.06} />
          <XAxis dataKey="h" type="number" domain={[0, 96]} ticks={[0, 24, 48, 72, 96]} tick={tick} tickLine={false}
            axisLine={{ stroke: '#e4e2e9' }} tickFormatter={(h: number) => `${h}h`} />
          <YAxis domain={[0, 160]} ticks={[0, 40, 80, 120, 160]} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
          <ReferenceLine x={clock} stroke="#1b1b1b" strokeWidth={1} />
          <Tooltip content={<HourTooltip />} cursor={{ stroke: '#d1cae5' }} />
          <Line type="stepAfter" dataKey="keyword" stroke="#9b97a6" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="lel" stroke="#4225a6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i className="key key-brand" />Live Event Layer</span>
        <span><i className="key key-grey" />Keyword blocking</span>
        <span><i className="key key-window" />Event window</span>
      </div>
    </div>
  );
}

export function MonetisePanel({ report, mode, clock, events, hourly, highlighted, onRevenue, onDeal }: {
  report: Report | null; mode: Mode; clock: number; events: EventRecord[]; hourly: HourPoint[];
  highlighted: boolean; onRevenue: () => void; onDeal: () => void;
}) {
  if (!report) {
    return (
      <Panel id="monetise" title="Monetise: measure the result" lede="What each approach earns on the same pages and bids, over the first 48 hours of the event." highlighted={highlighted}>
        <div className="empty-state">
          <strong>Nothing to compare yet</strong>
          <p>Trigger the news spike with the crash story. The report then compares both modes over the first 48 hours of the event.</p>
        </div>
      </Panel>
    );
  }
  const diff = report.lel.revenue - report.keyword.revenue;
  const active = weight(clock) >= SEED.eventTemplate.minWeight;
  const dealPages = SEED.pages.filter(p => salienceOf(p, ENTITY_ID) >= SALIENCE_MIN).map(p => p.id);
  const verticals = joinList(events.map(e => VERTICAL_SHORT[e.vertical]));

  const block = (m: Mode, label: string) => (
    <div className={`compare-block${mode === m ? ' is-current' : ''}`}>
      <span className="compare-label">{label}</span>
      <span className="compare-value">{money(report[m].revenue)}</span>
      <span className="compare-sub">RPM {money2(report[m].rpm)}, fill {(report[m].fillRate * 100).toFixed(0)}%</span>
    </div>
  );

  return (
    <Panel id="monetise" title="Monetise: measure the result" lede="What each approach earns on the same pages and bids, over the first 48 hours of the event." highlighted={highlighted}>
      <div className="tour-anchor stack" data-tour="results">
        <p className="section-label">First 48 hours of the event, simulated</p>
        <div className="compare">
          {block('keyword', 'Keyword blocking')}
          {block('lel', 'Live Event Layer')}
        </div>
        <p className="compare-delta"><strong>{signed(diff, money)}</strong> revenue ({signed(diff / report.keyword.revenue * 100, v => v.toFixed(0))}%) with the Live Event Layer</p>
  
        <div className="stat-pair">
          <div><span className="stat-value">{num(report.protectedImpressions)}</span><span className="stat-label">impressions protected from risky placements</span></div>
          <div><span className="stat-value">{num(report.recoveredImpressions)}</span><span className="stat-label">impressions recovered that keyword blocking left empty</span></div>
        </div>
      </div>

      <p className="section-label">Revenue per hour</p>
      <RevenueChart data={hourly} clock={clock} />
      <div className="panel-foot"><LinkButton onClick={onRevenue}>Revenue by page and definitions</LinkButton></div>

      <div className="deal" data-tour="deal">
        <div className="deal-head">
          <strong>Breaking-safe News deal</strong>
          <Chip tone={active ? 'event' : 'neutral'}>{active ? 'Live' : 'Ended'}</Chip>
        </div>
        <p>{active
          ? `Guarantees no ${verticals} ads on Pages ${joinList(dealPages)} until the event ends at 48h.`
          : 'The event has ended, so every page is back on its base tier.'}</p>
        <LinkButton onClick={onDeal}>Pages and buyers in this deal</LinkButton>
      </div>
    </Panel>
  );
}
