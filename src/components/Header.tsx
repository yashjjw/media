import { SEED, weight } from '../engine';
import type { Mode } from '../types';
import { Segmented } from './ui';

const MAX_H = 96;
const curveY = (w: number) => 30 - w * 26;
const points = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).map(t => `${t},${curveY(weight(t))}`).join(' ');

function Timeline({ clock, onChange, fired }: { clock: number; onChange: (h: number) => void; fired: boolean }) {
  const min = SEED.eventTemplate.minWeight;
  const w = weight(clock);
  const status = !fired ? 'no event yet' : w >= min ? `weight ${w.toFixed(2)}, active` : `weight ${w.toFixed(2)}, ended`;
  return (
    <div className="timeline">
      <div className="timeline-head">
        <label htmlFor="clock" className="control-label">Clock: hours since the event started</label>
        <span><strong>+{clock}h</strong>, {status}</span>
      </div>
      <div className="timeline-track">
        <svg viewBox={`0 0 ${MAX_H} 32`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={MAX_H} y1={curveY(min)} y2={curveY(min)} className="tl-threshold" />
          {fired ? (
            <>
              <polygon points={`0,32 ${points(0, 48)} 48,32`} className="tl-area" />
              <polyline points={points(0, 48)} className="tl-active" />
              <polyline points={points(48, MAX_H)} className="tl-ended" />
            </>
          ) : (
            <polyline points={points(0, MAX_H)} className="tl-idle" />
          )}
          <line x1={clock} x2={clock} y1="0" y2="32" className="tl-marker" />
        </svg>
        <input id="clock" type="range" min={0} max={MAX_H} step={1} value={clock}
          onChange={e => onChange(Number(e.target.value))} aria-valuetext={`${clock} hours, ${status}`} />
      </div>
      <div className="timeline-ticks" aria-hidden="true">
        <span style={{ left: '0%' }}>0h</span>
        <span style={{ left: '25%' }}>24h</span>
        <span style={{ left: '50%' }}>48h ends</span>
        <span style={{ left: '75%' }}>72h</span>
        <span style={{ left: '100%' }}>96h</span>
      </div>
    </div>
  );
}

export function Header({ mode, onMode, clock, onClock, fired, onTour }: {
  mode: Mode; onMode: (m: Mode) => void; clock: number; onClock: (h: number) => void; fired: boolean; onTour: () => void;
}) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">LE</span>
          <div>
            <h1>Live Event Layer</h1>
            <p>Concept prototype for Media.net</p>
          </div>
        </div>
        <div className="mode-wrap" data-tour="mode">
          <span className="control-label">Decide ads using</span>
          <Segmented label="Decide ads using" value={mode} onChange={onMode}
            options={[{ value: 'keyword', label: 'Keyword blocking today' }, { value: 'lel', label: 'Live Event Layer' }]} />
        </div>
        <div className="timeline-wrap" data-tour="clock">
          <Timeline clock={clock} onChange={onClock} fired={fired} />
        </div>
        <button type="button" className="btn" onClick={onTour}>Take the tour</button>
      </div>
    </header>
  );
}
