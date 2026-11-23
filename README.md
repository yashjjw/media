# Live Event Layer

A concept prototype for Media.net. When a news story about an entity turns negative, the Live Event Layer adjusts ad eligibility only on pages where that entity is central, only for the advertiser verticals that are sensitive to it, and only for as long as the story matters. The prototype compares this with today's keyword blocking on the same pages and bids.

> **Simulated data.** Nothing connects to Media.net, Yahoo/Bing or publisher inventory. SkyJet, the advertisers and the pages are fictional.

## The story the app tells

The app opens on a five-chapter story card. Each chapter sets up the screen and highlights the panel to look at.

1. **The problem.** Keyword blocking gets breaking news wrong twice. It **over-blocks**: the crash report (Page A) contains "crash", so no advertiser can run there, and 20,000 impressions an hour go unsold. It also **under-blocks**: a month-old "SkyJet launches new Bali route" story (Page B) has no blocked words, so a travel ad runs beside the airline while it's in the news.
2. **Detect.** SkyJet mentions jump from about 2 to 64 per 10 minutes, 82% negative. An event fires at +20 minutes with confidence 0.91 for travel, airline and insurance advertisers.
3. **Propagate.** With the Live Event Layer on, Page A is **recovered** (Glow Shampoo runs), Page B is **protected** (Nimbus Bank replaces FlyAway), and Pages C and D are **unchanged**.
4. **Decay.** The event's weight halves every 24 hours. After 48 hours it drops below 0.25 and Page B shows FlyAway again.
5. **Results.** Over the first 48 hours: $6,216 vs $4,104 revenue (+51%), RPM $3.60 vs $2.38, 960,000 impressions recovered, 384,000 protected.

Select **Hide story and explore** to use every control freely, or **Play the story** in the header to start again.

## What's new compared with keyword blocking

| | Keyword blocking today | Live Event Layer |
| --- | --- | --- |
| Trigger | A blocked word is on the page | A news event about an entity is detected |
| Pages affected | Every page with the word | Only pages where the entity is central (salience ≥ 0.5) |
| Advertisers affected | All of them | Only sensitive verticals (travel, airline, insurance) |
| Duration | As long as the word is there | Fades out over 48 hours (24-hour half-life) |

On screen, every page card shows its outcome. In keyword mode it shows what goes wrong (over-blocked, risky placement). In Live Event Layer mode it shows what changed versus today (recovered, protected, unchanged).

## Run locally

Requires Node 18 or later.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # Vitest: PRD acceptance tests T1–T9, T11 and the winners table
npm run build     # type-check, then build to dist/
npm run preview   # serve the production build
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel detects Vite. Keep the defaults: build command `npm run build`, output directory `dist`.
4. Deploy. No environment variables or backend are needed.

Asset paths are relative (`base: './'` in `vite.config.ts`), so the build also works on Netlify, GitHub Pages or any static host.

## Project structure

```
src/
  seed.json            All simulated data (pages, advertisers, spike series, presets)
  types.ts             Data contract from the PRD
  engine.ts            Decision logic as pure functions: detect, weight, propagate, runAuction, buildReport
  checks.ts            PRD acceptance tests, shared by Vitest and the in-app "acceptance tests" panel
  engine.test.ts       Vitest suite
  App.tsx              State, derived values and story chapters
  components/
    Header.tsx         Approach toggle, clock timeline (drag along the event's decay curve), story button
    DetectPanel.tsx    Mention velocity chart, spike trigger, polarity, event status
    PropagatePanel.tsx Page cards and the page × advertiser grid
    MonetisePanel.tsx  Both-mode comparison, protected/recovered, revenue per hour, deal summary
    Drawers.tsx        Detail panels: decision log, bid request, detector log, revenue by page, deal, tests, about
    Story.tsx          Five-chapter story card shown on first load
    ui.tsx             Small shared components
  styles.css           Design tokens and styles (Media.net purple, pink reserved for the event)
```

The UI never computes a decision itself: every number on screen comes from `engine.ts`, recomputed whenever a control changes.

## What is real and what is simulated

| Real, implemented in code | Simulated |
| --- | --- |
| Event firing rule, entity matching by ID, salience gate (0.5), vertical sensitivity, one-tier step-down, decay (24h half-life, ends below 0.25), auction eligibility, decision log, report arithmetic | Entity extraction, mention velocity, polarity, traffic, bids, revenue |

## Decision logic in brief

- **Detect:** per 10-minute bucket, `ratio = mentions / 2` and `confidence = 0.5 × min(1, ratio / 20) + 0.5 × negativeShare`. Fires on the first bucket where ratio ≥ 5, mentions ≥ 20, negative share ≥ 0.6 and confidence ≥ 0.7. One event record per affected vertical.
- **Decay:** `weight = 0.5^(hours / 24)`; active while weight ≥ 0.25 (the first 48 hours).
- **Propagate:** step down one tier when an active event's entity is on the page with salience ≥ 0.5 and the advertiser's vertical is affected. Never more than one tier.
- **Auction:** eligible when effective tier ≥ advertiser's minimum (keyword mode: page blocked for everyone if it contains a blocklisted word). Score = bid CPM × relevance; the winner pays its bid.

## Notes

- Built with React 18, TypeScript, Vite 5, Recharts 3 and Vitest. Styling is plain CSS with design tokens rather than Tailwind, to keep the visual system in one readable file.
- The bid request panel is read-only and illustrative, not validated OpenRTB output.
