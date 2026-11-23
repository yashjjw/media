import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENTITY_ID, SEED, buildReport, detect, hourlyRevenue, makeCtx, runAuction } from './engine';
import type { Mode, PageId } from './types';
import { Header } from './components/Header';
import { DetectPanel } from './components/DetectPanel';
import { PropagatePanel, type PageAuction } from './components/PropagatePanel';
import { MonetisePanel, type HourPoint } from './components/MonetisePanel';
import { AboutDrawer, ChecksDrawer, DealDrawer, EventDrawer, PageDrawer, RevenueDrawer, useChecks, type DrawerState } from './components/Drawers';
import { Story, type Chapter } from './components/Story';

const HISTORY_END = SEED.spikeSeries.findIndex(b => b.minute === 0); // buckets up to the incident are already observed
const LAST = SEED.spikeSeries.length - 1;
const STEP_MS = 250;

type Zone = 'detect' | 'propagate' | 'monetise' | 'clock' | 'mode';

export default function App() {
  const [mode, setMode] = useState<Mode>('keyword');
  const [clock, setClock] = useState(1);
  const [neg, setNeg] = useState(SEED.polarityPresets.crash);
  const [progress, setProgress] = useState(HISTORY_END);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [view, setView] = useState<'pages' | 'grid'>('pages');

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

  /* Story mode: the PRD demo script as five chapters, shown on first load. */
  const chapters: (Chapter & { zones: Zone[]; enter: () => void })[] = useMemo(() => [
    { id: 1, label: 'The problem', zones: ['propagate'],
      enter: () => { resetSpike(); setNeg(SEED.polarityPresets.crash); setMode('keyword'); setClock(1); setView('pages'); setDrawer(null); } },
    { id: 2, label: 'Detect', zones: ['detect'],
      enter: () => { setNeg(SEED.polarityPresets.crash); setMode('keyword'); setClock(1); setDrawer(null); playSpike(); } },
    { id: 3, label: 'Propagate', zones: ['mode', 'propagate'],
      enter: () => { finishSpike(); setNeg(SEED.polarityPresets.crash); setMode('lel'); setClock(1); setView('pages'); setDrawer(null); } },
    { id: 4, label: 'Decay', zones: ['clock', 'propagate'],
      enter: () => { finishSpike(); setNeg(SEED.polarityPresets.crash); setMode('lel'); setClock(60); setView('pages'); setDrawer(null); } },
    { id: 5, label: 'Results', zones: ['monetise'],
      enter: () => { finishSpike(); setNeg(SEED.polarityPresets.crash); setMode('lel'); setClock(1); setDrawer(null); } },
  ], [finishSpike, playSpike, resetSpike]);

  const [chapter, setChapter] = useState(1); // 0 = story hidden, exploring freely
  const goChapter = useCallback((i: number) => {
    if (i < 1 || i > chapters.length) return;
    setChapter(i);
    chapters[i - 1].enter();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [chapters]);
  const hl = (z: Zone) => chapter > 0 && chapters[chapter - 1].zones.includes(z);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drawer) setDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const passed = checks.filter(c => c.pass).length;

  return (
    <div className={`app${drawer ? ' has-drawer' : ''}`}>
      <div className="sim-banner" id="sim-banner" role="note">
        <strong>Simulated data.</strong> Not connected to Media.net, Yahoo/Bing or publisher inventory.
      </div>

      <Header mode={mode} onMode={setMode} clock={clock} onClock={setClock} fired={detection.fired}
        onStory={() => goChapter(1)} storyOpen={chapter > 0} highlightClock={hl('clock')} highlightMode={hl('mode')} />

      <div className="story-wrap">
        {chapter > 0 ? (
          <Story chapters={chapters} current={chapter} onGo={goChapter} onClose={() => setChapter(0)}
            data={{ detection, auctions, report, clock, playing }} />
        ) : (
          <div className="story-collapsed">
            <span>Exploring freely. Change the approach, the clock or the story, and every panel recomputes.</span>
            <button type="button" className="link-button" onClick={() => goChapter(1)}>Replay the story ›</button>
          </div>
        )}
      </div>

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

    </div>
  );
}
