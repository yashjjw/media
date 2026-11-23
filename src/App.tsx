import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENTITY_ID, SEED, buildReport, detect, hourlyRevenue, makeCtx, runAuction } from './engine';
import type { Mode, PageId } from './types';
import { Header, type View } from './components/Header';
import { DetectPanel } from './components/DetectPanel';
import { PropagatePanel, type PageAuction } from './components/PropagatePanel';
import { MonetisePanel, type HourPoint } from './components/MonetisePanel';
import { AboutDrawer, ChecksDrawer, DealDrawer, EventDrawer, PageDrawer, RevenueDrawer, useChecks, type DrawerState } from './components/Drawers';
import { SCENES, StoryView, type StoryActions } from './components/StoryView';

const HISTORY_END = SEED.spikeSeries.findIndex(b => b.minute === 0); // buckets up to the incident are already observed
const LAST = SEED.spikeSeries.length - 1;
const STEP_MS = 250;

export default function App() {
  const [mode, setMode] = useState<Mode>('keyword');
  const [clock, setClock] = useState(1);
  const [neg, setNeg] = useState(SEED.polarityPresets.crash);
  const [progress, setProgress] = useState(HISTORY_END);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [view, setView] = useState<View>('story');
  const [scene, setScene] = useState(1);
  const [propView, setPropView] = useState<'pages' | 'grid'>('pages');

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

  /* Story view: the PRD demo script as five scenes. Each scene sets the engine state it needs. */
  const enterScene = useMemo(() => [
    () => { resetSpike(); setNeg(SEED.polarityPresets.crash); setMode('keyword'); setClock(1); },
    () => { setNeg(SEED.polarityPresets.crash); setClock(1); playSpike(); },
    () => { finishSpike(); setNeg(SEED.polarityPresets.crash); setMode('lel'); setClock(1); },
    () => { finishSpike(); setNeg(SEED.polarityPresets.crash); setMode('lel'); setClock(1); },
    () => { finishSpike(); setNeg(SEED.polarityPresets.crash); setMode('lel'); setClock(1); },
  ], [finishSpike, playSpike, resetSpike]);

  const goScene = useCallback((i: number) => {
    if (i < 1 || i > SCENES.length) return;
    setScene(i);
    setDrawer(null);
    enterScene[i - 1]();
    window.scrollTo({ top: 0 });
  }, [enterScene]);

  const changeView = useCallback((v: View) => {
    setView(v);
    setDrawer(null);
    if (v === 'story') goScene(scene);
    window.scrollTo({ top: 0 });
  }, [goScene, scene]);

  const storyActions: StoryActions = useMemo(() => ({ setClock, setNeg, playSpike }), [playSpike]);

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

      <Header view={view} onView={changeView} mode={mode} onMode={setMode} clock={clock} onClock={setClock} fired={detection.fired} />

      {view === 'story' ? (
        <StoryView scene={scene} onGo={goScene} onOpenPrototype={() => changeView('prototype')} actions={storyActions}
          data={{ detection, auctions, report, hourly, clock, playing, neg }} />
      ) : (
        <main className="board">
          <DetectPanel detection={detection} neg={neg} onNeg={setNeg} playing={playing} played={played}
            onSpike={playSpike} clock={clock} highlighted={false} onDetails={() => setDrawer({ kind: 'event' })} />
          <PropagatePanel auctions={auctions} mode={mode} clock={clock} events={detection.events}
            view={propView} onView={setPropView} onOpen={openPage} highlighted={false} />
          <MonetisePanel report={report} mode={mode} clock={clock} events={detection.events} hourly={hourly}
            highlighted={false} onRevenue={() => setDrawer({ kind: 'revenue' })} onDeal={() => setDrawer({ kind: 'deal' })} />
        </main>
      )}

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
