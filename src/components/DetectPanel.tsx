import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEED, VERTICAL_LABEL, explainNoFire, weight } from '../engine';
import type { BucketEval, Detection } from '../types';
import { Chip, LinkButton, Panel, Segmented } from './ui';

interface Point { minute: number; mentions: number | null; ratio?: number; confidence?: number }

function VelocityTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d || d.mentions == null) return null;
  return (
    <div className="chart-tip">
      <strong>{d.minute >= 0 ? '+' : ''}{d.minute} min</strong>
      <div>{d.mentions} mentions, {d.ratio!.toFixed(1)}× baseline</div>
      <div>Confidence {d.confidence!.toFixed(2)}</div>
    </div>
  );
}

function VelocityChart({ detection }: { detection: Detection }) {
  const byMinute = new Map(detection.evals.map(e => [e.minute, e]));
  const data: Point[] = SEED.spikeSeries.map(b => {
    const e = byMinute.get(b.minute);
    return { minute: b.minute, mentions: e ? e.mentions : null, ratio: e?.ratio, confidence: e?.confidence };
  });
  const fire = detection.bucket;
  const tick = { fontSize: 11, fill: '#696670' };
  return (
    <div className="chart" role="img" aria-label="Mentions of SkyJet per 10 minutes, with the 7-day baseline and the volume gate">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="#efedf4" vertical={false} />
          <XAxis dataKey="minute" type="number" domain={[-60, 120]} ticks={[-60, -30, 0, 30, 60, 90, 120]}
            tick={tick} tickLine={false} axisLine={{ stroke: '#e4e2e9' }} tickFormatter={(m: number) => (m > 0 ? `+${m}` : `${m}`)} />
          <YAxis domain={[0, 160]} ticks={[0, 40, 80, 120, 160]} tick={tick} tickLine={false} axisLine={false} />
          <ReferenceLine x={0} stroke="#cfcadb" strokeDasharray="2 3" />
          <ReferenceLine y={20} stroke="#a99fd0" strokeDasharray="2 3" />
          <ReferenceLine y={2} stroke="#4225a6" strokeDasharray="5 3" />
          <Tooltip content={<VelocityTooltip />} cursor={{ stroke: '#d1cae5' }} />
          <Line dataKey="mentions" stroke="#1b1b1b" strokeWidth={2} dot={{ r: 2.5, fill: '#1b1b1b' }} isAnimationActive={false} connectNulls={false} />
          {fire && <ReferenceDot x={fire.minute} y={fire.mentions} r={6} fill="#d51254" stroke="#fff" strokeWidth={2} />}
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i className="key key-line" />Mentions</span>
        <span><i className="key key-dash" />Baseline, 2</span>
        <span><i className="key key-dot-line" />Volume gate, 20</span>
        <span><i className="key key-event" />Event fires</span>
        <span className="chart-axis">Minutes after the incident</span>
      </div>
    </div>
  );
}

function Conditions({ b, neg }: { b: BucketEval; neg: number }) {
  const item = (ok: boolean, text: string) => <Chip tone={ok ? 'ok' : 'no'}>{ok ? '✓' : '✕'} {text}</Chip>;
  return (
    <div className="chip-row">
      {item(b.checks.ratio, `${b.ratio.toFixed(1)}× baseline`)}
      {item(b.checks.volume, `${b.mentions} mentions`)}
      {item(b.checks.polarity, `${Math.round(neg * 100)}% negative`)}
      {item(b.checks.confidence, `confidence ${b.confidence.toFixed(2)}`)}
    </div>
  );
}

export function DetectPanel({ detection, neg, onNeg, playing, played, onSpike, clock, highlighted, onDetails }: {
  detection: Detection; neg: number; onNeg: (n: number) => void; playing: boolean; played: boolean;
  onSpike: () => void; clock: number; highlighted: boolean; onDetails: () => void;
}) {
  const [fineTune, setFineTune] = useState(false);
  const presets = SEED.polarityPresets;
  const presetValue = neg === presets.crash ? 'crash' : neg === presets.positiveStory ? 'positive' : 'custom';
  const ev = detection.events[0];
  const w = weight(clock);

  let status;
  if (detection.fired && ev) {
    const active = w >= ev.minWeight;
    status = (
      <div className="event-card">
        <div className="event-card-head">
          <span className="pulse" aria-hidden="true" />
          <strong>Event fired at +{ev.startMinute} min</strong>
          <Chip tone={active ? 'event' : 'neutral'}>{active ? 'Active' : 'Ended'}</Chip>
        </div>
        <dl className="facts">
          <div><dt>Confidence</dt><dd>{ev.confidence.toFixed(2)}</dd></div>
          <div><dt>Risk</dt><dd>{ev.riskClass === 'high' ? 'High' : 'Medium'}</dd></div>
          <div><dt>Half-life</dt><dd>{ev.halfLifeHours}h</dd></div>
        </dl>
        <p className="event-verticals">Affects {detection.events.map(e => VERTICAL_LABEL[e.vertical]).join(', ')}</p>
        <div className="weight">
          <div className="weight-bar"><i style={{ width: `${w * 100}%` }} /><u style={{ left: `${ev.minWeight * 100}%` }} /></div>
          <span>Weight {w.toFixed(2)} at +{clock}h{active ? `, ends below ${ev.minWeight}` : `, below ${ev.minWeight}`}</span>
        </div>
      </div>
    );
  } else if (playing) {
    status = <div className="status-card"><strong>Checking each 10-minute bucket…</strong></div>;
  } else if (played) {
    const peak = detection.evals.reduce((a, b) => (b.mentions > a.mentions ? b : a));
    status = (
      <div className="status-card">
        <strong>No event. {explainNoFire(detection.evals, neg)}</strong>
        <Conditions b={peak} neg={neg} />
      </div>
    );
  } else {
    status = <div className="status-card"><strong>Watching SkyJet.</strong> Mentions are at the 7-day baseline.</div>;
  }

  return (
    <Panel id="detect" step={1} title="Detect" question="Is a story about SkyJet turning negative?" highlighted={highlighted}>
      <VelocityChart detection={detection} />
      <div className="control-row">
        <button type="button" className="btn btn-primary" onClick={onSpike} disabled={playing}>
          {playing ? 'Playing…' : played ? 'Replay news spike' : 'Trigger news spike'}
        </button>
        <Segmented size="sm" label="Story polarity" value={presetValue}
          onChange={v => { if (v === 'crash') onNeg(presets.crash); if (v === 'positive') onNeg(presets.positiveStory); }}
          options={[{ value: 'crash', label: 'Crash story' }, { value: 'positive', label: 'Positive story' }]} />
      </div>
      <div className="fine-tune">
        <button type="button" className="link-button subtle" aria-expanded={fineTune} onClick={() => setFineTune(f => !f)}>
          Negative share {neg.toFixed(2)} {fineTune ? '▴' : '▾'}
        </button>
        {fineTune && (
          <input type="range" min={0} max={1} step={0.01} value={neg} onChange={e => onNeg(Number(e.target.value))}
            aria-label="Share of negative new content" className="range" />
        )}
      </div>
      {status}
      {played && !playing && (
        <div className="panel-foot">
          <LinkButton onClick={onDetails}>{detection.fired ? 'How the detector decided' : 'See each bucket'}</LinkButton>
        </div>
      )}
    </Panel>
  );
}
