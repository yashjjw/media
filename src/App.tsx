import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENTITY_ID, SEED, buildReport, detect, hourlyRevenue, makeCtx, runAuction } from './engine';
import type { Mode, PageId } from './types';
import { Header } from './components/Header';
import { DetectPanel } from './components/DetectPanel';
import { PropagatePanel, type PageAuction } from './components/PropagatePanel';
import { MonetisePanel, type HourPoint } from './components/MonetisePanel';
import { AboutDrawer, ChecksDrawer, DealDrawer, EventDrawer, PageDrawer, RevenueDrawer, useChecks, type DrawerState } from './components/Drawers';
import { Tour, type TourStep } from './components/Tour';

const HISTORY_END = SEED.spikeSeries.findIndex(b => b.minute === 0); // buckets up to the incident are already observed
const LAST = SEED.spikeSeries.length - 1;
const STEP_MS = 250;

type Zone = 'detect' | 'propagate' | 'monetise' | 'clock';

export default function App() {
  const [mode, setMode] = useState<Mode>('keyword');
  const [clock, setClock] = useState(1);
  const [neg, setNeg] = useState(SEED.polarityPresets.crash);
  const [progress, setProgress] = useState(HISTORY_END);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [view, setView] = useState<'pages' | 'grid'>('pages');
  const [tour, setTour] = useState(0);

  // Spike playback: one bucket every STEP_MS.
  useEffect(() => {
    if (!playing) return;
    if (progress >= LAST) { setPlaying(false); return; }
    const t = setTimeout(() => setProgress(p => p + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, progress]);

  const playSpike = useCallback(() => { setProgress(HISTORY_END); setPlaying(true); }, []);
  const finishSpike = useCallback(() => { setPlaying(false); setProgress(LAST); }, []);
  const resetSpike = useCallback(() => { setPlaying(false); setProgress(HISTORY_END); }, []);

  // Everything below is derived from the engine; every control recomputes the whole screen.
  const detection = useMemo(
    () => detect(SEED.spikeSeries.slice(0, progress + 1), SEED.mentionsBaselinePer10Min, neg, SEED.eventTemplate, ENTITY_ID),
    [progress, neg],
  );
  const ctx = useMemo(() => makeCtx(detection.events), [detection]);
  const report = useMemo(() => (detection.events.length ? buildReport(ctx) : null), [ctx, detection]);
  const auctions: PageAuction[] = useMemo(
    () => SEED.pages.map(page => ({ page, keyword: runAuction(page, clock, 'keyword', ctx), lel: runAuction(page, clock, 'lel', ctx) })),
    [ctx, clock],
  );
  const hourly: HourPoint[] = useMemo(
    () => Array.from({ length: 97 }, (_, h) => ({ h, keyword: hourlyRevenue(ctx, h, 'keyword'), lel: hourlyRevenue(ctx, h, 'lel') })),
    [ctx],
  );
  const checks = useChecks();
  const played = progress > HISTORY_END;

  const openPage = useCallback((pageId: PageId) => setDrawer({ kind: 'page', pageId, tab: 'log' }), []);

  /* Guided demo (PRD demo script, five steps) */
  const steps: (TourStep & { zones: Zone[]; enter: () => void })[] = useMemo(() => [
    { title: 'Before', zones: ['propagate'],
      caption: 'Keyword blocking today. The crash report (A) is blocked for every advertiser, yet a FlyAway travel ad still runs beside the month-old SkyJet route story (B).',
      enter: () => { resetSpike(); setNeg(SEED.polarityPresets.crash); setMode('keyword'); setClock(1); setView('pages'); setDrawer(null); } },
    { title: 'Detect', zones: ['detect'],
      caption: 'The spike plays one 10-minute bucket at a time. At +10 min there are 18 mentions, below the volume gate of 20. At +20 min all four conditions pass and the event fires with confidence 0.91.',
      enter: () => { setNeg(SEED.polarityPresets.crash); setMode('keyword'); setClock(1); setDrawer(null); playSpike(); } },
    { title: 'Propagate', zones: ['propagate'],
      caption: 'With the Live Event Layer on, A serves Glow Shampoo and B serves Nimbus Bank. C and D don’t change. Page C’s log shows why: salience 0.12 is below 0.5, so no step-down.',
      enter: () => { finishSpike(); setMode('lel'); setClock(1); setView('pages'); setDrawer({ kind: 'page', pageId: 'C', tab: 'log' }); } },
    { title: 'Decay', zones: ['clock', 'propagate'],
      caption: 'At +60h the event weight is 0.18, below 0.25. The step-down ends and Page B goes back to FlyAway.',
      enter: () => { finishSpike(); setMode('lel'); setClock(60); setView('pages'); setDrawer(null); } },
    { title: 'Monetise', zones: ['monetise'],
      caption: 'Over the first 48 hours the layer earns $6,216 against $4,104, protects 384,000 impressions and recovers 960,000. The clock is back at +1h, so the Breaking-safe News deal is live.',
      enter: () => { finishSpike(); setMode('lel'); setClock(1); setDrawer(null); } },
  ], [finishSpike, playSpike, resetSpike]);

  const goStep = useCallback((i: number) => {
    setTour(i);
    steps[i - 1].enter();
    const zone = steps[i - 1].zones[steps[i - 1].zones.length - 1];
    requestAnimationFrame(() => document.getElementById(zone === 'clock' ? 'root' : zone)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [steps]);
  const exitTour = useCallback(() => setTour(0), []);
  const hl = (z: Zone) => tour > 0 && steps[tour - 1].zones.includes(z);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drawer) setDrawer(null); else if (tour) setTour(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, tour]);

  const passed = checks.filter(c => c.pass).length;

  return (
    <div className={`app${tour ? ' is-touring' : ''}${drawer ? ' has-drawer' : ''}`}>
      <div className="sim-banner" id="sim-banner" role="note">
        <strong>Simulated data.</strong> Not connected to Media.net, Yahoo/Bing or publisher inventory.
      </div>

      <Header mode={mode} onMode={setMode} clock={clock} onClock={setClock} fired={detection.fired}
        onDemo={() => goStep(1)} highlightClock={hl('clock')} />

      <main className="story">
        <DetectPanel detection={detection} neg={neg} onNeg={setNeg} playing={playing} played={played}
          onSpike={playSpike} clock={clock} highlighted={hl('detect')} onDetails={() => setDrawer({ kind: 'event' })} />
        <PropagatePanel auctions={auctions} mode={mode} clock={clock} events={detection.events}
          view={view} onView={setView} onOpen={openPage} highlighted={hl('propagate')} />
        <MonetisePanel report={report} mode={mode} clock={clock} events={detection.events} hourly={hourly}
          highlighted={hl('monetise')} onRevenue={() => setDrawer({ kind: 'revenue' })} onDeal={() => setDrawer({ kind: 'deal' })} />
      </main>

      <footer className="app-footer">
        <button type="button" className="footer-link" onClick={() => setDrawer({ kind: 'checks' })}>
          <span className={`dot ${passed === checks.length ? 'dot-ok' : 'dot-no'}`} aria-hidden="true" />
          {passed} of {checks.length} acceptance tests pass
        </button>
        <button type="button" className="footer-link" onClick={() => setDrawer({ kind: 'about' })}>What’s real and what’s simulated</button>
      </footer>

      {drawer?.kind === 'page' && (
        <PageDrawer pageId={drawer.pageId} tab={drawer.tab} onTab={tab => setDrawer({ ...drawer, tab })}
          mode={mode} clock={clock} ctx={ctx} onClose={() => setDrawer(null)} />
      )}
      {drawer?.kind === 'event' && <EventDrawer detection={detection} neg={neg} clock={clock} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'revenue' && report && <RevenueDrawer report={report} ctx={ctx} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'deal' && <DealDrawer ctx={ctx} clock={clock} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'checks' && <ChecksDrawer onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'about' && <AboutDrawer onClose={() => setDrawer(null)} />}

      {tour > 0 && (
        <Tour steps={steps} index={tour} onBack={() => tour > 1 && goStep(tour - 1)}
          onNext={() => (tour >= steps.length ? exitTour() : goStep(tour + 1))} onExit={exitTour} />
      )}
    </div>
  );
}
