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

type Spike = 'reset' | 'play' | 'done';
interface Setup { mode: Mode; clock: number; spike: Spike }

/* The tour: a context card, then small cards pointing at one element each (PRD demo script). */
const TOUR: (TourStep & { setup: Setup })[] = [
  { setup: { mode: 'keyword', clock: 1, spike: 'reset' },
    title: 'A news story breaks. What happens to the ads?',
    body: <>
      <p>SkyJet, a fictional airline, has just had a crash. News sites are full of it.</p>
      <p>This prototype compares how ads are decided on four news pages: with <strong>keyword blocking</strong>, which
        publishers use today, and with the <strong>Live Event Layer</strong>, a proposed Media.net feature.</p>
      <p className="tour-note">All data is simulated. The decision logic is real.</p>
    </> },
  { target: 'mode', place: 'bottom', setup: { mode: 'keyword', clock: 1, spike: 'reset' },
    title: 'Start with today’s approach',
    body: <p>Keyword blocking is on. Any page containing a word like “crash” or “dead” gets no ads at all.</p> },
  { target: 'page-A', place: 'right', setup: { mode: 'keyword', clock: 1, spike: 'reset' },
    title: 'Problem 1: it blocks too much',
    body: <p>The crash report contains “crash”, so every advertiser is turned away, even a shampoo brand that doesn’t mind.
      20,000 impressions an hour earn nothing.</p> },
  { target: 'page-B', place: 'right', setup: { mode: 'keyword', clock: 1, spike: 'reset' },
    title: 'Problem 2: it misses what matters',
    body: <p>This month-old SkyJet story has no blocked words, so a travel ad runs right beside the airline that just crashed.</p> },
  { target: 'spike', place: 'right', setup: { mode: 'keyword', clock: 1, spike: 'play' },
    title: 'The Live Event Layer watches the news',
    body: <p>It counts SkyJet mentions every 10 minutes. Watch them jump from about 2 to 64 within 20 minutes, mostly negative.</p> },
  { target: 'event', place: 'right', setup: { mode: 'keyword', clock: 1, spike: 'done' },
    title: 'An event fires',
    body: <p>At +20 minutes it is confident (0.91) that this is a real event about SkyJet. It affects travel, airline and
      insurance advertisers, and will fade over 48 hours.</p> },
  { target: 'mode', place: 'bottom', setup: { mode: 'lel', clock: 1, spike: 'done' },
    title: 'Now switch on the Live Event Layer',
    body: <p>Same pages, same advertisers, same bids. Only the decision logic changes.</p> },
  { target: 'page-A', place: 'right', setup: { mode: 'lel', clock: 1, spike: 'done' },
    title: 'Recovered',
    body: <p>The layer judges the story, not the word. Brand-safe advertisers can run on the crash report again, so Glow
      Shampoo wins.</p> },
  { target: 'page-B', place: 'right', setup: { mode: 'lel', clock: 1, spike: 'done' },
    title: 'Protected',
    body: <p>SkyJet is central to this page, so travel, airline and insurance ads step down one tier. A finance ad runs
      instead of FlyAway.</p> },
  { target: 'page-C', place: 'right', setup: { mode: 'lel', clock: 1, spike: 'done' },
    title: 'Left alone',
    body: <p>SkyJet is only mentioned in passing here (salience 0.12), so nothing changes. Select any page to see why each
      advertiser was or wasn’t eligible.</p> },
  { target: 'clock', place: 'bottom', setup: { mode: 'lel', clock: 60, spike: 'done' },
    title: 'The event fades',
    body: <p>Its weight halves every 24 hours and the step-down ends after 48. The clock is now at +60h, so Page B shows
      FlyAway again. Drag it to try.</p> },
  { target: 'results', place: 'left', setup: { mode: 'lel', clock: 1, spike: 'done' },
    title: 'The result',
    body: <p>Over the first 48 hours: $6,216 instead of $4,104 (+51%). 960,000 impressions recovered and 384,000 kept away
      from risky placements.</p> },
  { target: 'deal', place: 'left', setup: { mode: 'lel', clock: 1, spike: 'done' },
    title: 'Something buyers can buy',
    body: <p>Advertisers can buy news inventory with this guarantee as a Breaking-safe News deal. That’s the tour: explore
      any control, or use “Take the tour” to see it again.</p> },
];

export default function App() {
  const [mode, setMode] = useState<Mode>('keyword');
  const [clock, setClock] = useState(1);
  const [neg, setNeg] = useState(SEED.polarityPresets.crash);
  const [progress, setProgress] = useState(HISTORY_END);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [view, setView] = useState<'pages' | 'grid'>('pages');
  const [tour, setTour] = useState<number | null>(0); // the tour opens on its context card

  // Spike playback: one bucket every STEP_MS.
  useEffect(() => {
    if (!playing) return;
    if (progress >= LAST) { setPlaying(false); return; }
    const t = setTimeout(() => setProgress(p => p + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, progress]);

  const playSpike = useCallback(() => { setProgress(HISTORY_END); setPlaying(true); }, []);

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

  /** Each tour step sets up the state it describes, so Back and Next always show the right thing. */
  const goTour = useCallback((i: number) => {
    if (i < 0 || i >= TOUR.length) return;
    const { mode: m, clock: c, spike } = TOUR[i].setup;
    setTour(i);
    setDrawer(null);
    setView('pages');
    setNeg(SEED.polarityPresets.crash);
    setMode(m);
    setClock(c);
    if (spike === 'reset') { setPlaying(false); setProgress(HISTORY_END); }
    if (spike === 'done') { setPlaying(false); setProgress(LAST); }
    if (spike === 'play') playSpike();
  }, [playSpike]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && drawer) setDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const passed = checks.filter(c => c.pass).length;

  return (
    <div className={`app${drawer ? ' has-drawer' : ''}`}>
      <div className="sim-banner" id="sim-banner" role="note">
        <strong>Simulated data.</strong> Not connected to Media.net, Yahoo/Bing or publisher inventory.
      </div>

      <Header mode={mode} onMode={setMode} clock={clock} onClock={setClock} fired={detection.fired} onTour={() => goTour(0)} />

      <main className="board">
        <DetectPanel detection={detection} neg={neg} onNeg={setNeg} playing={playing} played={played}
          onSpike={playSpike} clock={clock} highlighted={false} onDetails={() => setDrawer({ kind: 'event' })} />
        <PropagatePanel auctions={auctions} mode={mode} clock={clock} events={detection.events}
          view={view} onView={setView} onOpen={openPage} highlighted={false} />
        <MonetisePanel report={report} mode={mode} clock={clock} events={detection.events} hourly={hourly}
          highlighted={false} onRevenue={() => setDrawer({ kind: 'revenue' })} onDeal={() => setDrawer({ kind: 'deal' })} />
      </main>

      <footer className="app-footer">
        <button type="button" className="footer-link" onClick={() => setDrawer({ kind: 'checks' })}>
          <span className={`dot ${passed === checks.length ? 'dot-ok' : 'dot-no'}`} aria-hidden="true" />
          {passed} of {checks.length} acceptance tests pass
        </button>
        <button type="button" className="footer-link" onClick={() => setDrawer({ kind: 'about' })}>What’s real and what’s simulated</button>
      </footer>

      {tour !== null && <Tour steps={TOUR} index={tour} onIndex={goTour} onClose={() => setTour(null)} />}

      {drawer?.kind === 'page' && (
        <PageDrawer pageId={drawer.pageId} tab={drawer.tab} onTab={tab => setDrawer({ ...drawer, tab })}
          mode={mode} clock={clock} ctx={ctx} onClose={() => setDrawer(null)} />
      )}
      {drawer?.kind === 'event' && <EventDrawer detection={detection} neg={neg} clock={clock} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'revenue' && report && <RevenueDrawer report={report} ctx={ctx} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'deal' && <DealDrawer ctx={ctx} clock={clock} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'checks' && <ChecksDrawer onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'about' && <AboutDrawer onClose={() => setDrawer(null)} />}
    </div>
  );
}
