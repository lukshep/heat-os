# HEAT — development plan

The order is engine first, numbers second, product UI third. Nothing in the product UI is built until the HEAT model has been tuned in the simulator.

## Milestones

| | Milestone | Status |
|---|---|---|
| M0 | Scaffold | Done 2026-11-12 |
| M1 | Engine | Done 2026-11-12 |
| M2 | Dev simulator | Done 2026-11-12 |
| | **Checkpoint 1: tune the numbers** | In progress: first retune applied |
| M3 | Phone prototype | Deployed 2026-11-12; not yet tried on an iPhone |
| | **Checkpoint 2: use it for a week** | |
| M4 | Routines | Deployed 2026-11-12; not yet tried on an iPhone |
| M5 | Nested projects | Deployed 2026-11-12; not yet tried on an iPhone |
| M6 | Polish | Deployed 2026-11-12; not yet tried on an iPhone |
| M7 | Edge meter | Deployed 2026-11-12; tried on an iPhone, corners judged good |
| M8 | Neutral look and icon tab bar | Deployed 2026-11-12 |
| M9 | Surge: no line, a gauge to 120 | Deployed 2026-11-12 |
| M10 | Effort, Cooling and a reset | Deployed 2026-11-12; not yet tried on an iPhone |

The first prototype is M1–M3.

M9 changed the product: there is no longer a line to reach. Sections M1 to M8 below describe what was built at the time, so they still mention the line, the threshold and its mark. M9 says what replaced them, and `docs/SPEC.md` describes the app as it is now.

### M0 — Scaffold

Vite, React, strict TypeScript, Vitest, folder skeleton, `CLAUDE.md`, `docs/SPEC.md`, this file.

Done when `npm test`, `npm run typecheck` and `npm run build` all pass on the empty skeleton.

### M1 — Engine

Everything in `src/heat/`: config, cooling, points, gain, the fold over the completion log, routine warmth, day and schedule helpers, Today suggestions, and scenario simulation.

Done when unit tests cover each function and the scenario invariants pass. The invariants live in `src/heat/scenarios.test.ts`; after the first retune they are:

- a maintenance day (two tasks in each of four areas) reaches the line every day, and so do nine tasks across three areas
- one task in each of five areas never reaches the line, and neither does one area with any number of tasks
- splitting one task into twenty yields less than four times the points
- breadth pays more than depth, a first task in a new area always beats a repeat, and the fourth task in an area is still worth doing
- HEAT stays within 0–100, and gain falls strictly as HEAT rises
- 75 is still at the line a day later, and 86 the morning after a skipped day
- from cold, maintenance days reach the line within a week and big days within four; after a week away, big days are back within four
- weekend bursts reach the line on fewer than half the days
- a kept routine is worth nearly twice a new one, a patchy one stays cooler, and warm routines carry a day over the line that the same effort as plain tasks leaves short
- the fold is independent of input order and ignores duplicate completions

Unit tests use the round numbers in `src/heat/testConfig.ts`, so only the scenario tests move when the defaults are retuned.

### M2 — Dev simulator

A DEV-only screen at `/#/dev`: a slider for every `HeatConfig` value, scenario presets with editable parameters, a chart of HEAT over simulated days with the threshold marked, summary figures led by the settled peak and the share of days that reach the line, and a copyable config.

Done when each preset reproduces the table in `docs/SPEC.md`, and the production bundle contains no simulator code.

### Checkpoint 1

Tune `DEFAULT_CONFIG` together in the simulator. Record what changed and why in the tuning log.

#### First retune, 2026-11-12

The initial values raised four problems in the simulator: six trivial tasks in six areas matched a big day (86), flagging everything was worth ten points, a routine skipped every third day kept 0.93 warmth, and the two-task day sat under the line 97% of the time.

Review of those changed the brief as well as the numbers:

- The aim is to touch the line once a day, not to stay above it.
- One task in each area must not be enough to reach it.
- The area bonus should be smaller and shrink with each further area, not be capped.
- Returns within an area should diminish over several tasks, not collapse after the first.
- A routine missed two or three times in a row should be cold.

What the presets show after the retune:

| Preset | Settled peak | Days reaching the line |
|---|---|---|
| Maintenance day (two tasks in each of four areas) | 62.0 | 100% |
| Three areas, three tasks each | 61.8 | 100% |
| Big day (three tasks in each of four areas, one Important) | 70.6 | 100% |
| Light day (two tasks in each of three areas) | 54.7 | 0% |
| One task per area (five areas) | 54.3 | 0% |
| Breadth farmer (six areas) | 58.6 | 0% |
| One-area grind | 40.7 | 0% |
| Task splitter | 49.9 | 0% |
| Flag everything | 69.3 | 100% |
| Weekend warrior | 55.3 | 0% |
| Week off | 70.6 | 62% |
| Routines, kept | 64.5 | 100% |
| Routines, patchy | 55.4 | 0% |

Still open after this pass:

1. **Is eight plain tasks the right bar?** The gain scale is the single dial. At 250, one task in each of five areas almost reaches the line; at 350 it takes about twelve tasks.
2. **Small steps and slow recovery.** A first task from cold adds about 5, and maintenance days take a week to reach the line from zero. If this feels sluggish, steepen the gain curve rather than lower the bar.
3. **Warm routines carry a lot.** Three fully warm routines alone reach 58. The full-warmth bonus is the lever.
4. **Flagging everything is still worth 7 points** on a maintenance day.

### M3 — Phone prototype

State store and reducer, IndexedDB persistence, JSON export and import. HEAT bar. Today with suggestions and swap. Inbox capture. Areas with flat task lists. Important and Avoided flags. Complete and undo. Temperature colours. PWA manifest and service worker. Deployed to an HTTPS host.

Left out on purpose: routines UI, nested-project UI, settings, notifications, sync.

Done when the app installs on iPhone from the HTTPS URL, launches offline, keeps its data across a relaunch, and a task can be completed from each of the three tabs.

Where that stands:

| Check | Status |
|---|---|
| A task can be completed from each of the three tabs | Verified in a desktop browser at phone size |
| Data survives a reload | Verified in a desktop browser |
| The production build launches with the server stopped | Verified in a desktop browser |
| Deployed to an HTTPS host | GitHub Pages, on every push to `master`: https://lukshep.github.io/heat-os/ |
| Installs and behaves on an iPhone | Not verified |

How it was built:

- **Capture** is the plus button on the tab bar. It opens the Inbox with the cursor in the capture field, from any screen. Each area on Projects also has its own field for adding straight into it.
- **A task row** is a ring to tap and a title. The ring's colour and glow are the task's temperature. Tapping the title opens an editor for the title, the two flags, the area and deletion.
- **Completing** fills the ring, folds the row away and shows an Undo toast for six seconds.
- **Today** offers five tasks at a time. The swap button sets one aside for the rest of the day and brings in the next.
- **Backup** is at the foot of Projects: export hands over a JSON file, import replaces what is on the device after a confirmation.
- **The app is dark only.** Temperature colours are designed to glow against a dark surface.
- **Icons** are generated by `scripts/make-icons.mjs`.

Things to check on the phone, since none of them can be judged in a desktop browser: the keyboard rising over the capture field, the safe-area padding around the notch and home indicator, the share sheet for export, and whether the temperature colours are distinct enough at a glance.

### Checkpoint 2

Use it for a week. Watch for the risks listed in `docs/SPEC.md`, especially trivial-task breadth farming and the morning dip.

### M4 — Routines

Weekday schedules, warmth, routines on Today.

How it was built:

- **A routine is a task that repeats.** The editor has a "Repeat on" row of weekday chips. Pressing any day turns a filed task into a routine; clearing them all turns it back into a one-off task. It keeps its id throughout, so the open editor does not jump.
- **A routine needs an area.** An Inbox task has to be filed before it can repeat, and a routine cannot be moved to the Inbox.
- **Today** lists every routine due today first, in the same order each day, then five tasks. Routines cannot be swapped away.
- **On Projects** a routine stays in its area. Once done it shows a quiet check until tomorrow, and tapping the check takes the completion back.
- **Off-schedule days** can still be completed from Projects. They earn HEAT and leave warmth alone.
- **Changing the schedule** keeps the warmth earned so far and applies the new days from today.
- **Deleting an area** turns its routines into one-off tasks in the Inbox.
- **Weekday chips** follow the device's language and first day of the week.

Verified in a desktop browser at phone size: making and unmaking a routine, completing from Today and from Projects, undo both ways, and warmth carrying into the next day (checked by moving a completion to yesterday in the saved data). Not verified on an iPhone.

### M5 — Nested projects

Project tree UI, organising and moving items out of the Inbox.

How it was built:

- **The Projects screen is one tree.** Every area is a section, and projects nest inside it to any depth, each indented one step further. A section's header has a chevron to fold it, its name, and a plus button.
- **Folding** hides a section's items and everything nested in it. What is folded is remembered on the device, outside the saved data and its backups.
- **The plus button** opens a field for adding a task straight into that area or project. It replaces the always-visible field each area had, which would not scale to a tree. The field closes when left empty.
- **Tapping a name** opens rename, delete, and a field for starting a project inside it.
- **Deleting a project** moves its tasks, routines and projects up one level. Deleting an area still sends everything to the Inbox, and now removes its projects.
- **"Keep it in"** in an item's editor is now a picker listing the Inbox and every area and project by its full path. It replaces the row of area chips and is how an Inbox item is filed anywhere in the tree.
- **Rows shown away from their place** (on Today) name the full path, such as "Work › Website › Launch".
- **An item's area always follows its project.** The reducer enforces it, so scoring by area needs no change.

Not included: moving a project to a different parent or area, and reordering. For now that means deleting and recreating it.

Verified in a desktop browser at phone size: building a three-level tree, adding into each level, filing an Inbox item into a nested project, folding surviving a reload, completing a nested task, and deleting a project with its contents moving up. Not verified on an iPhone, where the native picker is the part most worth checking.

### M6 — Polish

Animation pass, settings for threshold and day start, reduced-motion support.

How it was built:

- **Settings** sit at the foot of Projects, above the backup. "The line" is a slider with no number: the mark on the bar at the top of the screen moves as it is dragged. "A new day starts at" is a picker from midnight to 8 am.
- **Settings are saved data**, so they travel in a backup. Adding them changed the saved format, which is now version 2. Data saved by earlier builds is upgraded on load and keeps everything else as it was; this is the first real migration.
- **Changing the line** only moves the mark. It does not rescore anything. **Changing the day start** applies from now on; completions keep the day they were logged under.
- **Animation pass:**
  - the header eases between its two sizes, so the big bar on Today shrinks into the strip on the other screens
  - each screen settles in when its tab is chosen
  - a row that joins a list already on screen (the next suggestion, or one brought back by undo) eases in
  - the ring gives under a press and swells as it fills on completion
  - the editor, a section's rename panel and its add field drop in
  - the mark on the bar glows once when HEAT climbs to it. Nothing is recorded, and moving the mark with the slider does not trigger it
  - the mark has a dark edge so it stays readable over the bright end of the bar
- **Reduced motion** is one global rule: every transition and animation lands on its end state at once, so a new animation cannot be forgotten. Rows also skip their fold-away delay.

Verified on a production build in a desktop browser at phone size: old version-1 data loading and being saved as version 2, both settings, and each animation firing when it should. Reduced motion was checked only by confirming the rule is in the built stylesheet; it has not been tried with the system setting switched on. Not verified on an iPhone.

### M7 — Edge meter

Added after the original plan. HEAT is now a line of light round the edge of the screen, replacing the big bar on Today and the strip on the other screens. The notes under M6 that mention the bar describe what was built then.

How it was built:

- **The line** starts at the top centre and grows clockwise. Halfway is the bottom centre and a full loop is 100. Its colour is its temperature, and a bright tip marks the leading end.
- **The mark** for the line to reach is a dot on the edge. At the usual 60 it sits just past the bottom-left corner. It moves when the setting is changed, and still glows once when HEAT climbs to it.
- **A faint track** shows the whole loop, so the distance still to go can be seen.
- **It is on every screen** and takes no touches, so nothing underneath it is harder to tap.
- **The header** is now only the screen's name. Today lost its large bar, which leaves more room for the list.
- **In a browser window** the app is a column, and the line runs round that column with gentler corners.
- **The geometry** is a pure function with tests (`src/ui/edgePath.ts`), so where the mark sits for any setting is not left to the browser.

Known weaknesses, to judge on the phone:

- One task moves the tip only a few points of screen, which is a weaker reward than the old bar gave. If that disappoints, the fallback is a thermometer down one side.
- A web app cannot ask a phone how round its screen is. The corner radius is one middle value for recent iPhones and needs tuning by eye; it will sit slightly off on some models.
- The line starts behind the camera cut-out and passes above the clock and battery.
- Thumbs and cases cover the right and bottom edges.

Verified on a production build in a desktop browser at phone size: the line growing with each completion, the flare on a gain, the mark moving with the setting and answering when reached. Not verified on an iPhone, which is where every weakness above shows.

Later fix: on the iPhone the line had no glow. Safari ignores CSS filters on shapes inside an SVG, so the glow, the tip's halo, the flare and the Surge band are now SVG filters.

### M8 — Neutral look and icon tab bar

Asked for after seeing the edge meter on the phone.

- **Neutral colour.** Backgrounds, text, lines and the plus button are all neutral grey. The only colour on a screen is temperature: the edge meter and the ring on each row. Delete keeps a muted red. This reverses the warm tint and orange accent from M3.
- **Icon tab bar.** Five equal slots: Today and Projects, the plus button in the centre, then Inbox and Settings. Each tab is an icon with its name as the accessible label; the name still heads its screen.
- **Settings is its own screen**, moved out of the foot of Projects. It holds the line, the day start and the backup.
- **Today is headed "Today"**, in the same style as the other screens. The "HEAT" wordmark is gone from inside the app.
- **The edge line sits hard against the glass.** On the phone it was a few points inside the left and right edges, so its inset went from 4 to 2 and its corner radius from 50 to 52 to keep the curve concentric.

Verified on a production build in a desktop browser at phone size. Not yet seen on an iPhone; the inset change in particular is a guess from a description.

### M9 — Surge

Asked for after M8. The line to reach each day is gone, and with it any daily success or failure. HEAT is a gauge of recent activity and consistency, and it can now pass 100.

What changed in the rules:

- **No threshold.** The setting, the mark on the edge, its glow when reached, and every "reaches the line" figure in the simulator and the tests are removed.
- **Surge.** HEAT runs to 120. Gains aim at 120 instead of 100, which is what lets a big enough day pass 100. Above 100 HEAT cools at 15% a day instead of 20%, so the overflow lasts: a buffer of momentum that fades in about a day.
- **Flags are flat and undiminished.** Important and Avoided each add 7.5 points, on top of whatever the task is otherwise worth. The rule that halved the bonus with each flagged completion is gone, and the area's diminishing returns no longer touch it.
- **Retuned so balanced activity sits at about 70 to 85.** Two tasks in each of four areas, every day, moves between 68 and 85. Filling the gauge from there takes about 206 points in a day.

What changed on screen:

- **The edge line** has no mark. Above 100 it thickens, pales towards a bright pale yellow, glows wider, and a band of light travels round it. The tip is hidden in Surge.
- **Settings** lost "The line". The day start and the backup remain.
- **Row colours** needed no new code: they already map what each item would add right now, so they follow the new rules. Flagged items now stay warmer than plain ones all day, because their bonus no longer shrinks.
- **The simulator** shows time in Surge in place of days reaching the line, has a slider for cooling in Surge, and draws the chart to 120.

Saved data: the format is now version 3, which drops the threshold from settings. Version 1 and 2 documents are upgraded on load.

What the presets show:

| Preset | Settled peak | Settled low | Time in Surge |
|---|---|---|---|
| Balanced day (two tasks in each of four areas) | 84.8 | 67.9 | 0% |
| Balanced day, two flagged | 89.6 | 71.7 | 0% |
| Light day (two tasks in each of three areas) | 76.6 | 61.3 | 0% |
| Big day (three tasks in each of four areas, two flagged) | 95.8 | 76.6 | 0% |
| Huge day (big day, four flags, three warm routines) | 107.2 | 88.0 | 43% |
| One task per area (five areas) | 76.0 | 60.8 | 0% |
| One-area grind | 59.5 | 47.6 | 0% |
| Task splitter | 70.8 | 56.7 | 0% |
| Flag everything | 108.0 | 88.9 | 47% |
| Weekend warrior | 82.0 | 21.5 | 0% |
| Week off | 84.8 | 14.2 | 0% |
| Routines, kept | 87.0 | 76.2 | 0% |
| Routines, patchy | 80.0 | 68.4 | 0% |

The scenario invariants in `src/heat/scenarios.test.ts` were rewritten for this and replace the list under M1:

- consistent, balanced activity peaks between 80 and 90 and never fills the gauge
- two balanced days of work in one day is still not a full gauge; a huge day, kept up, surges, but not permanently
- HEAT stays within 0–120 under any amount of farming
- Surge holds its heat longer than ordinary cooling would
- a day of rest leaves HEAT above 65, two leave it above 50, and a week away is made up within three balanced days
- a flag is paid in full wherever the task falls in its area, and a twice-flagged task deep in an area beats a fresh start elsewhere
- breadth still beats depth, splitting still pays less than four times, one area alone stays well below a balanced day, and weekend bursts do not stand in for consistency
- kept routines are worth nearly twice new ones, and warm routines lift the same effort

Verified on a production build in a desktop browser at phone size, with made-up data: version 2 data loading and being saved as version 3, the line with no mark, the Surge look above 100 and the ordinary look below it, flagged rows warmer than plain ones, and Settings without the line. The travelling band was checked only by its presence, not watched moving. Not verified on an iPhone.

The one real history available, the day of testing saved in the dev app (69 completions across six areas in one sitting, 386 points), reaches 99.9 under these rules. That is one extreme day, so it says nothing about where an ordinary day lands. The gain scale stays at the modelled 215 until there is a week of real use.

Open after this pass:

1. **Flagging everything reaches Surge.** Undiminished flags were asked for, and this is their cost. If flags get overused, the fallback is a smaller flat bonus.
2. **This undoes most of the first retune's difficulty.** One task in each of five areas now sits at 76. With no line to pass that may not matter; watch it.
3. **Is two tasks in each of four areas the right "balanced day"?** The gain scale is the dial.
4. **Does the edge still read without a mark?** Colour now carries the level alone.

### M10 — Effort, Cooling and a reset

Asked for after M9: settings a person can tune, each behind a confirmation, and a way to reset HEAT.

- **Effort** (Easier, Standard, Harder) sets how much a day's work warms HEAT. It scales the gain scale by 0.75, 1 or 1.3. On Easier a light day sits where a balanced day does on Standard; on Harder it takes three tasks in each of four areas.
- **Cooling** (Slower, Standard, Faster) sets how fast HEAT fades: 15%, 20% or 25% a day. Points are untouched, so Slower also lets the same days sit higher. The first plan paired each Cooling step with a gain-scale change that held a balanced day at 85, but that made slower cooling feel like harder work, so Cooling now does only what its name says.
- **Surge keeps its own rate** but never cools faster than the rest of the gauge. Moving it with the daily rate made Surge last all day on Slower, which breaks the rule that Surge is a buffer and not a state to hold.
- **Changes apply from the moment they are made.** Each is saved with its time, and the fold replays the log against a timeline of configs (`heatTimeline`), cooling each stretch and scoring each completion with the config in force then. HEAT already earned never moves, and undo still works.
- **Reset HEAT** saves its time (`heatResetAt`), and HEAT counts only completions after it. The log is kept, so what was done stays done.
- **Confirmation** is the system dialog, as for restoring a backup. Cancelling leaves the picker where it was. The steps have names, never numbers.

Saved data: the format is now version 4, which adds the dated Effort and Cooling changes and the reset time. Version 3 documents are upgraded to Standard with no reset.

Verified: unit tests for the timeline, the steps, the reset and the version 3 upgrade, and scenario invariants for all nine combinations of Effort and Cooling. On a production build in a desktop browser at phone size, with made-up data: version 3 data loading and being saved as version 4; each picker cancelled and then accepted; HEAT unchanged by a change; the reset taking HEAT to cold and keeping completed tasks done; everything surviving a reload; and a completion after the reset warming at the Easier rate. The confirmation dialog was stubbed for the browser test, so the real dialog has not been seen. Not verified on an iPhone.

Open after this pass:

1. **Easier and Slower together** put a balanced day at 99, just short of full. Accepted, since both were chosen.
2. **Switching to Easier for a burst** and back keeps what was earned. The confirmation is the only friction.
3. **The reset cannot be undone** except by importing a backup.

### Later, not planned in detail

Cloud sync, routine pause, notifications.

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Routines come after the prototype (M4), not in it | Assumed; revisit at checkpoint 1 |
| 2 | Tasks have no effort or size field | Assumed; revisit at checkpoint 2 |
| 3 | Area bonuses reset at 04:00 local, not on a rolling window | Assumed |
| 4 | The HEAT number is hidden in the product UI | Assumed; revisit at M3 |
| 5 | Hosting: GitHub Pages from the public repository `lukshep/heat-os` | Decided 2026-11-12 |
| 6 | Seed areas are Work, Health, Home, People, Growth, all editable | Assumed |
| 7 | The aim is to touch the line once a day, not to stay above it | Replaced by 19 |
| 8 | One task in each area is not enough to reach the line | Dropped with the line (19) |
| 9 | A routine missed two or three times in a row is cold | Decided 2026-11-12 |
| 10 | The app is dark only | Assumed at M3; revisit at checkpoint 2 |
| 11 | Completed tasks are not listed anywhere; the Undo toast is the only way back | Assumed at M3; revisit at checkpoint 2 |
| 12 | Adding a task to an area or project is behind a plus button, not an always-visible field | Assumed at M5; revisit at checkpoint 2 |
| 13 | Projects cannot be moved or reordered | Assumed at M5; add when it is missed |
| 14 | The day start can be set from midnight to 8 am | Assumed at M6; the line's own setting went with the line (19) |
| 15 | The mark glows once when HEAT reaches it, and nothing is kept of it | Removed with the line (19) |
| 16 | HEAT is shown as a line round the edge of the screen, not a bar | Decided 2026-11-12; a side thermometer is the fallback if it reads poorly |
| 17 | Everything that is not HEAT feedback is neutral grey; the only colour is temperature | Decided 2026-11-12 |
| 18 | The tab bar is icons only, with the plus button in the centre and Settings as its own screen | Decided 2026-11-12 |
| 19 | There is no line to reach and no daily success or failure. HEAT is a gauge of recent activity and consistency | Decided 2026-11-12 |
| 20 | HEAT can pass 100 into Surge, up to 120. A full gauge is difficult and uncommon | Decided 2026-11-12; the cap of 120 is a proposal to revisit |
| 21 | Surge cools more slowly than the rest of the gauge, so the overflow is a buffer | Decided 2026-11-12, chosen from the options in the M9 plan |
| 22 | Important and Avoided add a flat bonus that nothing diminishes | Decided 2026-11-12 |
| 23 | Consistent, balanced activity should sit at about 70 to 85 | Decided 2026-11-12; "balanced" is assumed to be two tasks in each of four areas. Holds at Standard Effort and Cooling (25) |
| 24 | Surge is shown only by the line itself. It is not named in the app and nothing is recorded | Assumed at M9 |
| 25 | A person can set Effort and Cooling, three named steps each, and each change asks for confirmation | Decided 2026-11-12 |
| 26 | Effort and Cooling apply from the moment they change; HEAT already earned is never rescored | Decided 2026-11-12 |
| 27 | Cooling changes only how fast HEAT fades, so it also moves where the same days sit | Decided 2026-11-12, chosen over holding the band fixed |
| 28 | HEAT can be reset by hand from Settings, after a confirmation. The completion log is kept | Decided 2026-11-12 |

## Tuning log

Record every change to `DEFAULT_CONFIG` here: date, what changed, why, and which scenario showed the problem.

| Date | Change | Reason |
|---|---|---|
| 2026-11-12 | Initial values | Hand-calibrated so a solid three-area day settles at about 79 and one-area work hovers at the threshold |
| 2026-11-12 | Gain scale 150 to 300 | The aim became touching the line once a day, and one task per area must not reach it. About 79 points now holds the line |
| 2026-11-12 | First-in-area bonus from +100% to +50%; new: each further area keeps 70% of the previous area's bonus | Breadth farming matched a big day. A shrinking bonus was preferred to a cap |
| 2026-11-12 | Repeat decay 0.7 to 0.8 | Returns within an area should diminish over several tasks |
| 2026-11-12 | New: flag bonus halves with each flagged completion in a day | Flagging everything was worth ten points |
| 2026-11-12 | Warmth: a completion closes 25% of the gap to full; a miss removes 20%, 80%, then all of what is left. Was flat +0.15 and -0.07 | With flat steps any routine kept more often than missed reached full warmth. Two or three misses in a row should leave it cold |
| 2026-11-12 | Removed the miss escalation cap | The new miss rule reaches 100% by the third miss, so the cap had nothing to do |
| 2026-11-12 | Removed the threshold | There is no line to reach any more (M9) |
| 2026-11-12 | Gains aim at 120 instead of 100; the ceiling and the full mark are the constants `MAX_HEAT` and `FULL_HEAT` | Surge: HEAT can pass 100 |
| 2026-11-12 | New: retention in Surge, 0.85 | Overflow should act as a buffer, so it cools at 15% a day instead of 20% |
| 2026-11-12 | Gain scale 300 to 215 | With gains aimed at 120, this puts a balanced day (85 points) at a peak of 85 and a low of 68, and a full gauge about 206 points away |
| 2026-11-12 | Flags: flat 0.75 of the base each (7.5 points), added after the area factor. Was a multiplier of 0.5 each that halved with every flagged completion; the halving rule is removed | Important and Avoided should be worth substantially more wherever they fall, with no diminishing returns. "Flag everything" now reaches Surge, which is accepted for now |
| 2026-11-12 | Warmth now multiplies only the area part of a routine's points, not its flags | Follows from flags being flat |
| 2026-11-12 | New: Effort steps scale the gain scale by 0.75, 1 and 1.3. Cooling steps shift daily retention by +0.05, 0 and -0.05; Surge retention never drops below the daily rate. `DEFAULT_CONFIG` unchanged | Personal settings (M10). The Effort steps put a light day (Easier) and a heavy day (Harder) where a balanced day sits on Standard. Shifting Surge retention too made Surge permanent for a huge day on Slower |
