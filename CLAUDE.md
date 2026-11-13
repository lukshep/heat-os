# HEAT

A mobile-first PWA that turns personal productivity into momentum management. One value, HEAT, cools continuously and rises when tasks and routines are completed. It is a temperature gauge of recent activity and consistency, not a target: there is no line to reach and no daily success or failure. Steady, balanced activity keeps it at about 70 to 85; the gauge is full at 100, and an exceptional day can push it into Surge, up to 120.

- `docs/SPEC.md` — product rules, data model, the HEAT model, known balancing risks.
- `docs/PLAN.md` — milestones, their status, open decisions, tuning log.

Update those two files when a decision changes. They are the record; this file is the rulebook.

## Product guardrails

These are requirements. Do not add features that break them, even as small helpers.

- HEAT is the only progress meter. It is the line of light round the edge of the screen (`src/ui/EdgeMeter.tsx`), present on every screen. No percentages, XP, currencies, achievements, badges or dashboards.
- Never display streak counts, routine warmth or routine progress. Warmth is felt only through colour.
- No daily completion state and no daily pass or fail: no "all done", no threshold or goal line, no midnight reset of HEAT. The edge meter is the only signal. HEAT resets only when the person asks, from Settings.
- Settings that change how HEAT behaves (Effort, Cooling, the reset) ask for confirmation before they act, and their steps have names, never numbers.
- Surge (HEAT above 100) is shown only by the edge line itself. Do not name it in the product UI, record it, count it or reward it.
- No "areas touched today" indicator, or anything else that turns the day into a checklist.
- Temperature colour is the main feedback. Numbers stay out of the product UI; the dev screen may show them.
- Capture and completion take as few taps as possible. Tasks can be completed from every screen.
- Keep scope small. No speculative features, settings or abstractions.

## Commands

```bash
npm run dev         # dev server; simulator at /#/dev
npm test            # engine unit tests + scenario invariants (run once)
npm run test:watch  # tests in watch mode
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production build, including the service worker
npm run preview     # serve the production build; the only way to test offline launch
```

## Deploy

Every push to `master` runs `.github/workflows/deploy.yml`: tests, production build, publish to GitHub Pages at https://lukshep.github.io/heat-os/. The installed app updates itself the next time it is opened online.

- The repository is public. Never commit personal data, exported backups or secrets.
- The build reads its base path from `BASE_PATH`; the workflow sets it to the repository name. Locally it is `/`.
- The address is permanent. Saved data is tied to it, so moving hosts means exporting a backup and importing it at the new address.

## Architecture

```
src/
  heat/      pure engine
  data/      model, reducer, selectors, storage
  app/       React glue: shell, store, clock, view, backup
  ui/        presentational components, temperature colour
  screens/   Today, Projects, Inbox, Settings
  dev/       DEV-only simulator and tuning screen
public/      icons and favicon
scripts/     make-icons.mjs, which draws the icon PNGs
```

Import rules:

- `heat/` imports nothing outside `heat/`. No React, DOM, storage, `Date.now()` or argument-less `new Date()`. Time, day and config are always arguments.
- `data/` may import `heat/`. No React. The reducer is pure: actions carry their own ids, times and day keys.
- `ui/` may import `heat/` and `data/` types, but not `app/`. Components take callbacks, they do not dispatch.
- `app/` and `screens/` may import everything except `dev/`.
- `dev/` is reached only through a dynamic import behind `import.meta.env.DEV`, so it never ships.
- The clock is `app/clock.ts`. Screens read time from it and pass it in; nothing else calls `Date.now()`.

## Invariants

- **HEAT is derived, never stored.** The completion log is the single source of truth; `foldHeat` replays it from the last reset (`heatCompletions`). Undo removes a completion; nothing else needs repair. A reset stores only its time, never a HEAT value.
- **Every tunable number lives in `HeatConfig`** (`src/heat/config.ts`). No magic numbers in the engine or UI. Beside it as constants: the gauge's two fixed points, `FULL_HEAT` (100, one full loop of the edge) and `MAX_HEAT` (120, the ceiling of Surge), and the Effort and Cooling steps.
- **Priority and Friction are a share of the task's own reward**: 20%, 30%, and 50% for both. The shares add, never multiply, and apply after the area factor and warmth, so they shrink with the area's diminishing returns. Use these names everywhere; Important and Avoided are the old ones.
- **Completions are immutable facts** (when, which item, area, tags, warmth, day), never scores. Editing or deleting an item later must not rewrite past HEAT.
- **"Done" is derived** from the completion log. Tasks have no `completedAt`; a routine is done today if the log holds a completion for today.
- **Routine warmth is derived**, never stored as a running value. Only `warmthBase` is saved, and it is re-snapshotted when a schedule changes.
- **Screens list `ListItem`s** (`src/data/selectors.ts`), one shape for tasks and routines. A task and the routine made from it share an id.
- **Areas and projects are `Place`s**, flattened in reading order by `places()`. An item's area always matches its project's area; the reducer enforces it, and scoring only looks at the area.
- **View preferences are not data.** Which sections are folded lives in localStorage (`src/app/collapsed.ts`), outside the state document and its backups.
- **All records carry** `id`, `createdAt`, `updatedAt`, `deletedAt`. Delete by setting `deletedAt`.
- **Changing the persisted shape** means bumping `SCHEMA_VERSION`, adding a step to `migrate` in `src/data/storage.ts`, and testing that step against a document of the old shape. People have data saved by earlier builds.
- **The config in force** is `heatConfig(state.settings)`: the tuned defaults with the person's own day start, Effort and Cooling. HEAT itself is folded over `heatTimeline(state.settings)`, so a change of Effort or Cooling applies from the moment it is made and never rescores the past. Never read `DEFAULT_CONFIG` in `app/` or `screens/`.
- **Engine changes need a test.** Unit tests use the round numbers in `src/heat/testConfig.ts`, never `DEFAULT_CONFIG`, so they do not move when the defaults are retuned.
- **Retuning has a paper trail.** A change to `DEFAULT_CONFIG` must keep `scenarios.test.ts` passing, or change an invariant there on purpose. Either way, update the expected-behaviour table in `docs/SPEC.md` and add a line to the tuning log in `docs/PLAN.md`.

## Conventions

- **Dependencies:** ask before adding any. Runtime: `react`, `react-dom`. Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `vite-plugin-pwa`. No router, state library, CSS framework, chart library or animation library.
- **TypeScript:** strict, with `noUncheckedIndexedAccess`.
- **CSS:** plain CSS with custom properties. Colours come from tokens in `src/styles.css`. The app is dark only, and everything that is not HEAT feedback is neutral grey: the only colour on a screen is temperature (the edge meter and the ring on each row), plus a muted red on delete. Do not add accent colours.
- **Temperature colour** comes from `src/ui/temperature.ts` and is applied to marks (a row's ring, the edge meter), never to text.
- **Glow on SVG shapes** uses SVG `<filter>`s, not CSS `filter`. Safari ignores CSS filters on anything inside an `<svg>`, so they show in Chrome and vanish on an iPhone.
- **Saved data:** anything loaded from storage or a backup file goes through `parseState` before the app trusts it. Data the build cannot read is never overwritten.
- **Mobile-first:** design at 390px wide, respect safe-area insets, 44px minimum touch targets.
- **Motion:** short and restrained. `prefers-reduced-motion` is handled by one global rule at the end of `src/styles.css`, so new animations need nothing extra unless they delay an action in JavaScript.
- **Testing in the browser:** the dev address (`localhost:5173`) may hold real data. Check before writing to it, and prefer the preview build on `localhost:4173` for tests that change saved data.
- **Stale dev server:** after several quick edits to one file, the dev server here has served an out-of-date copy on a full reload. If the dev app breaks in a way the tests and typecheck do not explain, re-save the file or restart `npm run dev`.
- **Git:** commit only when asked.
