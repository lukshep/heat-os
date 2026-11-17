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
| M11 | Priority and Friction | Deployed 2026-11-12; not yet tried on an iPhone |
| M12 | Rings show points, not HEAT | Deployed 2026-11-13; not yet tried on an iPhone |
| M13 | Due dates and saved format version 6 | Deployed 2026-11-15; not yet tried on an iPhone |
| M14 | Monthly routines | Deployed 2026-11-15; not yet tried on an iPhone |
| M15 | Dates and times on tasks | Deployed 2026-11-15; not yet tried on an iPhone |
| M16 | Calendar in Today | Deployed 2026-11-15; not yet tried on an iPhone |
| M17 | Areas | Deployed 2026-11-15; not yet tried on an iPhone |
| M18 | Daily, an anticlockwise line and a project icon | Deployed 2026-11-15; not yet tried on an iPhone |
| M19 | Priority first, Friction in stars, saved format version 7 | Deployed 2026-11-15; not yet tried on an iPhone |
| M20 | Retune: an even area ladder, stronger stars, rings up to the Surge peak | Deployed 2026-11-15; not yet tried on an iPhone |
| M21 | The gradient along the edge line, and a Surge sweep | Deployed 2026-11-15; not yet tried on an iPhone |
| M22 | Task details: a description, subtasks and a panel | Built 2026-11-16; not yet deployed or tried on an iPhone |

The first prototype is M1–M3.

M9 changed the product: there is no longer a line to reach. Sections M1 to M8 below describe what was built at the time, so they still mention the line, the threshold and its mark. M9 says what replaced them, and `docs/SPEC.md` describes the app as it is now.

M11 renamed the tags. Sections M1 to M10 call Priority and Friction by their old names, Important and Avoided, and describe the flat bonus they used to add. M19 changed them again: Priority stopped adding to a reward, and Friction became stars.

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

### M11 — Priority and Friction

Asked for after M10. The two tags are renamed and pay a share of the task's reward instead of a flat bonus.

- **Renamed.** Important is now Priority: what matters most right now. Avoided is now Friction: hard to start, not necessarily hard to do. The names changed everywhere, in the app, the code, the saved data and the simulator.
- **A share of the reward.** Priority adds 20%, Friction 30%, both 50%. The shares add rather than multiply, and they apply to the task's whole reward, after the area factor and warmth. This replaces the flat 7.5 points each (decision 22).
- **What that changes.** Tags are now much smaller, and they shrink with the area's diminishing returns like everything else. A first task in a fresh area always beats a tagged repeat, and a tagged task done first in its area earns more than one done later. Tagging every task of a balanced day peaks at 96 instead of 108, so tags alone no longer reach Surge. A huge day still does, for 27% of the time instead of 43%.
- **Unchanged.** Each tag is still an optional, independent toggle on a task or routine, and the editor's two chips work as before.
- **The bonus is on points,** so the HEAT a tag adds is a shade under its share near the top of the gauge, where gains taper: about 19% for Priority at HEAT 70 rather than 20%.

Saved data: the format is now version 5, which renames `important` and `avoided` to `priority` and `friction` on every task, routine and completion. Version 4 documents are upgraded on load.

Current HEAT moves when this lands. HEAT is replayed from the log, so completions tagged before this change are rescored under the new rule, and anyone who used the tags will see HEAT drop a little. Nothing is lost; the tags themselves are kept.

Verified: unit tests for the tag multiplier and the version 4 upgrade; scenario invariants rewritten on purpose for the new rule (20%, 30% and 50% wherever the task falls; a fresh area beats a tagged repeat; tags alone stay out of Surge) and the calibration snapshot updated. On a production build in a desktop browser at phone size, with made-up data: a task tagged Avoided in the old build arriving as Friction, with Priority off, on Today and in the editor; the document saved as version 5 at the next change, with no old names left; and completing it adding the Friction share. Not verified on an iPhone.

### M12 — Rings show points, not HEAT

Asked for after M11. A ring's colour no longer depends on where HEAT is (decision 31).

- **What a ring shows.** The points the item would earn right now (its tags, its warmth and where it falls in today's order in its area), as a share of the most any item can earn, through the same 0.6 curve as before. The most is a fully warm routine with both tags, done first in the day: 45 points at the defaults. It used to be the HEAT the item would add, against a Priority task done from cold.
- **Why.** HEAT scaled every item's gain by the same factor, so it never changed which ring was hottest, only how bright the whole list looked. In Surge every ring went cold. From cold, a Priority task, a Friction task and a warm routine all saturated to the same yellow, so tags and warmth could not be told apart.
- **How it looks.** The rings now always look as they used to at a steady HEAT of about 75. A plain task in a fresh area is red, a repeat in a worked area violet, the Inbox magenta, a warm routine orange, and a warm routine with a tag close to yellow. On a plain task in a fresh area, Priority moves the ring about 0.06 along the gradient, Friction 0.09 and both 0.14, and a tag moves it by the same proportion wherever the item falls in its area.
- **What was given up.** Cold rings in Surge were the sign that it is fine to stop. The edge line carries that alone now.
- **Unchanged.** Today's suggestions are still chosen by the HEAT each item would add, which ranks items the same way. The saved data and `DEFAULT_CONFIG` are untouched, so there is no new schema version and no tuning-log entry.

Verified: unit tests for `pointsNow` (independent of HEAT) and `temperatureOf` (1 at the most any item can earn and never more; tags and warmth by the same step anywhere in an area; unchanged by Effort). On a production build in a desktop browser at phone size, with made-up data: every ring's colour and glow identical with HEAT at 0 and at about 117, the values matching the model, and completing a Work task cooling the other Work rows while the Inbox row stayed as it was. Not verified on an iPhone, where the thing to judge is whether a tag's step is visible at a glance.

### Scheduling and Areas (M13–M17)

Asked for on 2026-11-15: a calendar, dates and times on tasks, monthly routines, and an Areas tab in place of Projects. Decisions 32 to 42 record the choices. The plan, in short:

- **Calendar inside Today.** A week strip (today and the next six days) under the heading, and a month grid from the month name. Picking a later day lists the tasks planned for it and the routines due on it; routine dates there cannot be completed yet, except a monthly one open early. A "Plan for …" field on a later day adds a dated Inbox task. Past days are dimmed and show nothing. A grey dot, never a count, marks days with a dated task or a monthly routine.
- **Today's order.** Timed items in time order, then due routines, then tasks planned for today or an earlier day, then suggestions from undated tasks until there are five tasks. Planned tasks have no swap.
- **Editor.** A When row (Today, Tomorrow, Pick, None) and a Time field. Repeat starts with Weekly or Monthly; Monthly is a grid of 1 to 30 and Last day.
- **Areas.** The Projects tab becomes Areas: an overview of area names with their projects on a second line, no counts and no colour, opening into one page per area. Pages swipe sideways, with grey dots for position; on desktop, ‹ › buttons and the arrow keys. Each page has an add field and New project, then the area's own routines and tasks, then its projects as foldable sections. A back button returns to the overview; tapping the title opens rename and delete.
- **Migration.** One schema bump (version 6) in M13 carries every new field, so saved data upgrades once. Nothing moves; area order becomes swipe order.

Effects on HEAT: dates and times change nothing in scoring, only which items Today shows. Daily routines are unchanged, so the scenario table holds. Weekly routines keep warmth when done late, take a miss only when the next date comes, and add HEAT at most once per date. Monthly routines warm slowly and barely move HEAT. Past HEAT never moves.

### M13 — Due dates and saved format version 6

The foundation for M14–M17, with no new screens.

- **Each routine date stays open until the next.** `src/heat/schedule.ts` works out a routine's dates, weekly or monthly, and where it stands today: open (due, or early for a monthly one), done, or waiting for its first date. Warmth settles a date when the next one comes, reading the date each completion counted for.
- **What changes on screen.** A weekly routine missed on its day stays on Today until it is done or its next date comes. Once done, it shows a check in its area until its next date, and that check can only take back a completion made today. A routine can no longer be completed again on the days between its dates.
- **Changing the days** keeps the warmth earned. A date still open counts if it was done and is dropped without a miss if not (`warmthCarriedOver`).
- **Model.** Tasks have `date` and `time`, routines have `time`, schedules are `{ every: 'week' | 'month', days }`, and completions record `occurrence` in place of `scheduled`. The reducer takes dates and times on tasks, times on routines, and checks their formats. `MONTHLY_EARLY_DAYS` (7) sits beside the config as a calendar rule; `DEFAULT_CONFIG` is unchanged, so there is no tuning-log entry.

Saved data: the format is now version 6. Version 5 documents are upgraded with no dates or times, weekly schedules, and each completion's date taken from whether its day was scheduled. A routine whose last date was missed but is still open is not counted as missed yet, so its warmth is briefly a little higher than before. An off-day completion from before the upgrade does not count for the date it followed, so that routine can show as due again once.

Verified: unit tests for month lengths, day keys, every schedule rule (short months, leap years, two days on one date, the open window, opening early), the new warmth rule and carry-over, the reducer's dates and times, and the version 5 upgrade, including warmth unchanged. The scenario invariants pass untouched. On a production build in a desktop browser at phone size, with made-up data: a version 5 document loading and being saved as version 6; a Friday routine missed on Friday showing on Sunday's Today, completed there for Friday and taken back from its check; a Saturday routine done the day before showing a check that cannot be pressed; and changing a routine's days keeping its warmth with no miss. Not verified on an iPhone.

### M14 — Monthly routines

The editor can now make a monthly routine. The rules came with M13.

- **Repeat** starts with Weekly and Monthly. They only choose which picker shows, and open on the routine's own kind; switching changes nothing until a day is chosen in the other picker, which then replaces the schedule. The first day chosen makes the task a routine, and clearing the last makes it a one-off task again.
- **The monthly picker** is the 1st to the 30th, six to a row so each stays a 44-point target at phone width, with Last day on a row of its own. The 31st is not offered: it would fall on the last day of every month, so it is the same as Last day. Each number is spoken as its ordinal ("15th").
- **Rows name the pattern**: "Monthly · 1st, 15th", "Monthly · Last day". Ordinals are English, like the rest of the app's words; weekday names still follow the device's language.
- **Opening early** needed nothing new on screen. A monthly routine open early has a live ring in its area and counts for its coming date, and Today lists it only from that date.
- **Left for M15**: preselecting a dated task's day of the month when it is made monthly. No task can have a date until M15 adds the When row. (Dropped in M15.)

Saved data: unchanged, still version 6.

Verified: unit tests for ordinals, "Last day" and the monthly labels. On a production build in a desktop browser at phone size, with made-up data: a task made monthly on Last day, then on the 15th as well, then cleared back to a task, the editor staying open throughout; a routine on the 20th, five days away, completed early from its area, the completion counting for the 20th, and kept off Today; switching a monthly routine's picker to Weekly saving nothing; every day button at least 44 by 44 points at 375 wide. Not verified on an iPhone.

### M15 — Dates and times on tasks

Tasks can be planned for a day, and Today lists them first.

- **The editor** gains a When row for tasks: Today, Tomorrow, Pick and None, which work like a choice of one. Pick holds the device's own date field, invisible and laid over the chip, so a tap opens the phone's picker; on a desktop the click asks the browser for its picker (`showPicker`). Once a day is picked the chip shows it. A Time field follows once the task has a day, with "No time" to clear it. A routine has the Time field and no When row.
- **Rows say when** (`src/ui/dates.ts`): Today, Tomorrow, Yesterday, a weekday up to six days ahead, or else the date, with the year only when it is not this one, then the time in the device's own style. A list made for one day (Today, and the calendar's days in M16) leaves that day out and shows only the time.
- **Today's order** (`planToday`): everything with a time, in time order, then due routines, then tasks planned for today or an earlier day, earliest first, then suggestions until there are five tasks. Times before the day starts sort last, as that night. Only suggestions can be swapped. Tasks planned for a later day are left out until their day, and suggestions come only from tasks with no date.
- **Dropped: preselecting a monthly day from a task's date.** Making a task a routine drops its date, so a preselected day would have turned the task into a routine, and lost its date, the moment Monthly was tapped. Choosing the day is one more tap.

Saved data: unchanged, still version 6.

Verified: unit tests for the day and time labels in two locales and for Today's order (timed first, night times last, earliest planned day first, later days and finished routines left out, the planned count). On a production build in a desktop browser at phone size, with made-up data: Today in the planned order, with two suggestions after three planned tasks and only the suggestions swappable; a suggestion planned for today at 8:15 moving in among the timed items and leaving room for one suggestion, then moved to tomorrow and leaving Today with its time kept; the Pick field setting another day and opening the browser's picker without errors; None clearing the day and the time together; and a routine's time cleared from its editor. The device date and time pickers were not seen, and nothing was tried on an iPhone, where the invisible date field over the Pick chip is the part most worth checking.

Open after this pass:

1. **A weekly routine on one day reads like a planned task.** "Read · Wed" is a routine due every Wednesday; "Dentist · Wed" is a task planned for this Wednesday. If that confuses, weekly labels could say "Every Wed".

### M16 — Calendar in Today

Today gains a calendar, and can show a later day.

- **The strip** (`src/ui/Calendar.tsx`) shows today and the next six days, each with its weekday and date. Picking a day further on moves it forward in whole weeks so it holds that day (`stripDays`). A "Back to today" button shows while a later day is picked.
- **The month grid** opens from the month's name above the strip: rows from the locale's first weekday, ‹ › to step months, never back past this one. Past days are dimmed and disabled. Picking a day closes it.
- **Marks** are a 4-point grey dot under a day with a task planned on it or a monthly routine due (`hasPlans`). Weekly routines leave none. A day's spoken name says "something planned"; there is never a count.
- **A later day** (`dayList`) lists the tasks planned for it and the routines due on it, timed ones first, then routines, then tasks. A routine there speaks for that day's date: a dashed grey ring when it has not opened, which cannot be pressed ("Not open yet"), a live ring for a monthly one open early, and a check for a date done early, which can be taken back only on the day it was done. Tasks can be done early. A "Plan for Fri, Nov 20" field adds a task planned for that day to the Inbox. The heading becomes the day's full date.
- **Where the day lives.** The shell holds the picked day. Leaving Today, or tapping its tab, forgets it, and once the day comes round Today is simply today again.

Saved data: unchanged, still version 6. Dates are added through the existing `task/add`.

Verified: unit tests for the strip's weeks, month stepping across years, month grids in two week starts and a leap February, the longer day and month names, a later day's list (order, what can be done ahead, a date done early and whose completion can be taken back) and the marks. On a production build in a desktop browser at phone size, with made-up data: the strip with dots on the right days and every day at least 46 by 60 points; Monday and Friday picked from the strip, with headings, lists, waiting routines and the "Plan for" field adding a dated Inbox task; the month grid at 46 by 44 points a day, past days disabled, no way back before this month, December reached and a day there picked, moving the strip; and the Today tab returning to today. That check found a bug, now fixed: a later day's field and list shared a key, which left old fields behind on Today. Not verified on an iPhone.

### M17 — Areas

The Projects tab becomes Areas (`src/screens/Areas.tsx`), with a four-tile icon in place of the folder.

- **The overview** lists every area by name, with its top-level projects on a second line, and a New area field at the foot. No counts and no colour.
- **An area's page** has an "Add to Work" field with a New project button beside it, then the area's own routines and tasks, then its projects as folding sections, unchanged from the old tree but one step less indented, since the area is the page. Tapping a project's name still opens rename, delete and "New project in …".
- **The heading** of an open area: a back button ("All areas"), the area's name, which opens rename and delete beneath it, and arrows to the areas either side. The arrows are hidden on a touch screen (`hover: none` or `pointer: coarse`), which swipes instead.
- **Swiping** is the browser's own: the pages sit side by side in a horizontal scroller that snaps a page at a time (`scroll-snap-type: x mandatory`, `scroll-snap-stop: always`), so it has the phone's own momentum and no gesture code. Once the scroller has been still for 120 ms, the page it rests on is the open area; when the area is chosen another way (the overview, the arrows, the keys), the scroller moves to it, smoothly unless reduced motion is asked for. Pages other than the open one are `inert`, so the keyboard stays on the page in view. Each page scrolls on its own.
- **Where the open area lives.** The shell holds it, so Areas reopens on it after another tab. Tapping Areas with an area open goes to the overview, and an area that has been deleted falls back to it.
- **Folding** is lifted to the pager, so one copy of the folded set is shared by every page. Only projects fold now. An area folded in the old tree is ignored, so it cannot hide its own projects with no way to open them.

Saved data: unchanged, still version 6. Nothing moves: areas, projects and items keep their places, and area order is page order.

Verified on a production build in a desktop browser, with made-up data. At phone size: the tab named Areas with its new icon; the overview with each area's top-level projects and no nested ones; Health's page with its items, then Fitness and Races (nested, indented a step), shown although Health had been folded in the old tree; the arrows hidden on a touch screen; moving the scroller a page at a time updating the heading, the dots and which page is live, and stopping at the last. At desktop size: the arrows labelled with their areas, disabled at the end, moving the pages; the left arrow key twice; the arrow keys ignored while a field has the cursor; renaming from the heading; adding a task and starting a project from a page; Areas reopening on the same area after Today, and going to the overview on a second tap; deleting the open area after its confirmation and landing on the overview. The browser pane was hidden, so timers were slowed and the swipe's timing could not be judged, and no real touch swipe was made. Not verified on an iPhone, where the swipe is the thing to try.

Open after this pass:

1. **Areas cannot be reordered**, and their order is now the order of the pages.

### Fix — the installed app stopping short of the bottom

Seen on an iPhone after M17: on a fresh launch, and sometimes after the keyboard was used, the app stopped above the bottom of the screen, with the edge line and tab bar lifted and a gap beneath, until the page was swiped down. These are two known iOS faults in web apps saved to the home screen, not in how the edge line is drawn: the line follows the app's frame, and iOS measured the screen short.

- **On launch**, `100dvh` can come up short by the status bar's height in an installed app with a see-through status bar. Installed (`display-mode: standalone`), the frame is now `100vh`, the whole screen, which other developers report as the true height there. In a browser tab it keeps `100dvh`, which allows for the toolbar.
- **After the keyboard**, iOS can leave the screen measured short until the app is quit. Scrolling the page back is reported not to help. What is reported to work is taking the full-height frame out of the layout and putting it back, which makes iOS measure again. `useFullHeight` (`src/app/fullHeight.ts`) notes the frame's height as a text field takes focus, and once the keyboard has gone, if the frame is shorter by more than a few points, refits it in one go and puts every scrolled list back. Moving between fields is not counted as the keyboard closing. Anywhere the frame keeps its height, it does nothing.

Verified in a desktop browser on a production build: the frame unchanged outside an installed app and the standalone rule present in the built stylesheet; with a field used and the frame kept full height, nothing done; with the frame shortened while a field was in use, one refit, the list's scroll and the open area kept; and focus moving straight to another field left alone. The focus events were sent by hand, because the hidden pane gets none. The real faults happen only on an iPhone, so whether this cures them is not yet known.

### M18 — Daily, an anticlockwise line and a project icon

No change to saved data or scoring.

- **Daily** joins Weekly and Monthly at the head of Repeat. It applies at once, with no days to pick, and is saved as the weekly schedule on all seven days (`DAILY` in `src/heat/schedule.ts`), so routines already set to every day open on Daily. Their rows read "Daily" instead of "Every day". Weekly still shows all seven lit, so one can be dropped.
- **Stop repeating**, a text button under Repeat whenever an item repeats, makes it a one-off task again without unticking each day. A Daily routine has no days to untick, so it needs it.
- **The edge line runs anticlockwise**: from the top centre down the left side, so halfway is still the bottom centre. The flare and the Surge shimmer follow the path, so they turn with it.
- **The tip is the end of the line.** The white dot, wider than the line, is gone. The line's last stretch is lightened in two steps instead, a longer stretch a little and a short one at its very end most, at the line's own width and with the line's own glow. After it was deployed the tip read as too long, so it was cut to about a third, and then the dimmer stretch was dropped: the tip is now only the bright end, about 12 points on an iPhone (`TIP_LENGTH` 0.5, in HEAT units along the line).
- **New project** on an area page is a folder with a plus, named "New project in Work" for a screen reader, so it does not look like the plain plus that adds a task to a project.

Verified on a production build at phone size, with made-up data: the line's path starting leftwards from the top centre; the tip's two stretches drawn at the line's own 4-point width with its glow; a routine on every day opening on Daily, with no day picker; Stop repeating making it a task, Daily making it a routine again, and Weekly then showing all seven days lit; the folder icon at 44 points, opening "New project in Body". Not tried on an iPhone.

### M19 — Priority first, Friction in stars

- **Priority earns nothing.** `priorityFirst` (`src/data/selectors.ts`) moves Priority items to the top of a list and keeps the order on each side. `ItemList` applies it, so it holds on every screen; Today and a later day apply it too, above timed items. A Priority title is bold, and the word leaves the row's details, though a screen reader still hears it. Its ring is that of the same item without it.
- **An undated Priority task is always on Today**, settled like a planned one: it takes one of the five task places first and cannot be swapped away. A Priority task planned for a later day waits for its day.
- **Friction is 0 to 5 stars** (`FRICTION_STARS`), each adding `frictionStep`, 10%, of the item's own reward. Five stars equal the old Priority and Friction together, so the hottest ring, the expected-behaviour table and the scenario invariants are unchanged.
- **In the editor**, a Priority chip and five stars labelled Friction share a line where there is room. Tapping a star sets that many and tapping the last lit one clears them. **On a row**, filled stars follow its other details in grey; none shows nothing.

Saved data: version 7. Tasks and routines with Friction get three stars, which earn what the tag did, and keep Priority. Completions lose Priority and carry stars that earn exactly what their tags earned: three for Friction, two for Priority, five for both. Past HEAT does not move. The step is tested against a version 6 document.

Verified on a production build at phone size, with a made-up version 6 document given both tags here and there: it loaded and was saved as version 7, with completions at two, three and five stars and none carrying Priority, and tasks with Friction at three stars. Today listed the Priority items first and bold (a task planned for an earlier day, then an undated one with no swap button), then the timed task, the routines, the planned task and one suggestion. Clearing, setting and showing stars on a row; marking a routine Priority moving it to the top; Priority first on an area page. No console errors. Not tried on an iPhone.

### M20 — Retune: an even area ladder, stronger stars, rings up to the Surge peak

Chosen from mockups of the rings under each rule. No change to saved data.

- **Every area starts at 15**, and each further task in it is worth 80% of the one before: 15, 12, 9.6, 7.7. There is no longer a cliff after the first task, and no shrinking bonus for each further area opened (`areaBonusDecay` and the engine's count of opened areas are gone). A fresh area still beats a plain repeat, 15 to 12. The Inbox steps down the same way from 10.
- **Friction is 20% a star**, so five stars double a task, and a five-star repeat can outweigh a fresh area.
- **The gain scale is 275**, up from 215, so a balanced day, now 108 points, still settles between 68 and 85.
- **Rings use the whole gradient.** The hottest item, a fully warm routine with five stars first in its area, is the pale yellow of the Surge peak, and the curve is gentler (0.45, was 0.6), so everyday items sit in the warm middle: a plain first task is red (0.64, was 0.52), and a second in its area 0.58 (was 0.35). A ring's glow stops growing at a full gauge's yellow.
- **Invariants changed on purpose:** splitting one task into twenty is bounded at five times one task, not four (it pays 4.9); a five-star repeat outweighs a fresh area; five stars on every task of a balanced day reaches Surge (peak 104, 22% of the time) while three stars on everything stays short of it.

HEAT already earned is rescored under the new rules, as at every retune, so the gauge moves once when the update loads. Items given Friction before version 7 have three stars, now worth 60% rather than 30%.

Verified with the simulator (the figures in `docs/SPEC.md`, and every Effort and Cooling step keeping a balanced day out of Surge and a huge day below 100 by morning), and on a production build at phone size with made-up data: each ring's temperature matched its place in the day, a plain first task at 0.64, a second in its area at 0.58, three stars in the Inbox at 0.66, and a cold daily routine with five stars at 0.88, all in red to amber. No console errors. Not tried on an iPhone.

### M21 — The gradient along the edge line, and a Surge sweep

Chosen from mockups of the line. No change to saved data or scoring.

- **The gradient along the line.** An SVG stroke cannot change colour along a path, so the whole loop is drawn as a hundred pieces (`gradientPieces` in `src/ui/edgePath.ts`), each the colour of the temperature at its middle and running a little under the next so no seam shows. A mask the width of the line and more reveals as far round as HEAT reaches, and moves as the line grows or cools, as the line did before. The leading end is the colour of HEAT now, and keeps its bright tip.
- **The flare on a gain** is a blurred copy of the same gradient, so it lights the line in its own colours. In Surge it is the loop's colour, as before.
- **The sweep.** When HEAT goes over 100 a loop the colour of HEAT runs round from the top centre, as wide as the line, over 1.7 seconds (`--edge-sweep`), easing in and out. Its bright tip fades from about three quarters of the way round, where the eased sweep is slowing, so the loop closes without a jump. There is no flare at the end. The gradient beneath fades once the loop has closed, and the shimmer starts then. Whether HEAT has just gone over 100 is worked out while drawing, so the closed loop never shows for a frame first.
- **When it plays.** Only at the moment HEAT goes over 100. Opening the app in Surge shows the closed loop with no sweep; falling back to 100 or below brings the gradient back.
- **Reduced motion.** The global rule now also zeroes animation and transition delays, so the sweep appears at once and the gradient and shimmer do not wait for it.

Verified on a production build at phone size, with made-up completions that brought HEAT to 98: the gradient along the line, slate at the top centre to yellow near the close; completing a routine took HEAT over 100 and played the sweep, checked frame by frame with the animations held: halfway round at half time, the tip at the loop's leading end, full until about three quarters of the way and gone at the close, the gradient still showing ahead of the loop, then hidden, and the shimmer waiting for the close. Reopening in Surge showed the closed loop with no sweep. No console errors. The browser pane was hidden, so the sweep was never seen running at its own speed, and nothing has been tried on an iPhone, where the cost of a hundred pieces under a glow is the thing to watch.

### M22 — Task details: a description, subtasks and a panel

Asked for on 2026-11-16: tasks with a description and subtasks shown under the row when it is tapped, and the editor moved into a panel. The request was a panel reached by swiping a row left; area pages already swipe sideways between areas, so the panel opens from the row instead (decision 57). No change to scoring.

- **Tapping a row** shows its description and subtasks beneath it, with Edit. A row with neither opens its panel straight away, so editing a plain task is still one tap. A long press (500 ms, cancelled by 10 points of drift or by the list starting to scroll) or a right click always opens it, and the click that ends a long press does nothing more. The title cannot be selected and raises no phone menu. A row with details has a small grey mark (`DetailsIcon`) after its other details.
- **The panel** (`src/ui/ItemSheet.tsx`) rises from the bottom over a dimmed screen, to about 90% of its height so its first fields sit above a phone's keyboard, and scrolls on its own. The edge line stays above it. It holds the title, a description that grows as it is written, the subtasks (tick, rename, remove, and a field that stays ready for the next), then the editor as it was: Priority and Friction, When and Time, Keep it in, Repeat, Delete. It says whether it is a task or a routine, since Repeat can change that while it is open. The shell holds which item it is for and finds the item afresh each time, so it stays open when the item moves or turns into a routine, and closes when the item is deleted.
- **Closing**: Done, Escape, or a tap that starts on the dimmed screen. A long press opens the panel under the finger, which then lifts over the dim; that lift does not close it. A field still being typed in is saved when the panel closes, since a phone can close it without the field ever being left. Everything behind is `inert` while it is open, focus moves into it, and goes back to the row afterwards.
- **Subtasks earn nothing** and never complete their item; the ring is still the only way. Their ticks are grey squares, and nothing ever counts them. A routine's ticks belong to the date it is on (`routineDate`) and clear by themselves when the next opens; on a later day a routine shows only that date's ticks, and one not open yet cannot be ticked.
- **Moving between task and routine** keeps the description and subtasks and clears their ticks, which mean different things on each.

Saved data: version 8. Every task and routine gains `description` ('') and `subtasks` ([]); the `note` field a task could carry, which nothing wrote, becomes its description if present and is gone from the model. Subtasks live inside their item rather than as records with their own `Meta` (decision 60). The step is tested against a version 7 document, and the older version fixtures now start from version 7's shape.

Verified: unit tests for the reducer (description, adding, renaming, ticking, unticking and removing subtasks, refusing a bad day, an unknown or deleted item, no completion logged), routine ticks (kept while the date is open and while done, cleared by the next date, today before the first date, a later day's own ticks, carried across task and routine without ticks) and the version 7 upgrade and shape checks. On a production build at 390 points wide, with a made-up version 7 document: it loaded and was saved as version 8 at the first change, with the note as a description; a bare row opened the panel; a three-line description grew its field; three subtasks added in a row; the row then showed its details, and a tick from the list was saved for today with no completion and the ring unchanged; a drifting press opened nothing, a short tap toggled the details, a held press opened the panel and its ending click changed nothing; the lift over the dim kept the panel open and a tap on it closed it; Escape closed it and focus went back to the row; a subtask renamed and closed with Escape still in the field was saved; a task with a ticked subtask made Daily stayed open as a routine with the tick cleared; a routine tick moved to yesterday showed unticked; a routine completed from its area kept its tick while done; a right click opened the panel and the next click worked. No console errors. Long presses and lifts were sent as pointer events, not touches, and nothing was tried on an iPhone.

Open after this pass:

1. **The keyboard over the panel on an iPhone.** The panel is tall so its fields sit high, and `useFullHeight` refits after the keyboard, but only the phone can say whether iOS moves the page.
2. **The long press on an iPhone**: whether 500 ms feels right, and whether iOS still selects text or shows its menu.
3. **Subtasks cannot be reordered** or turned into tasks.

### Later, not planned in detail

Cloud sync, routine pause, notifications, reordering areas, reordering subtasks.

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
| 22 | Important and Avoided add a flat bonus that nothing diminishes | Replaced by 29 |
| 23 | Consistent, balanced activity should sit at about 70 to 85 | Decided 2026-11-12; "balanced" is assumed to be two tasks in each of four areas. Holds at Standard Effort and Cooling (25) |
| 24 | Surge is shown only by the line itself. It is not named in the app and nothing is recorded | Assumed at M9 |
| 25 | A person can set Effort and Cooling, three named steps each, and each change asks for confirmation | Decided 2026-11-12 |
| 26 | Effort and Cooling apply from the moment they change; HEAT already earned is never rescored | Decided 2026-11-12 |
| 27 | Cooling changes only how fast HEAT fades, so it also moves where the same days sit | Decided 2026-11-12, chosen over holding the band fixed |
| 28 | HEAT can be reset by hand from Settings, after a confirmation. The completion log is kept | Decided 2026-11-12 |
| 29 | Priority adds 20% of a task's reward, Friction 30%, both 50%. The shares add, never multiply | Replaced by 45 and 47 |
| 30 | Important is renamed Priority and Avoided is renamed Friction, in the app, the code and the saved data | Decided 2026-11-12 |
| 31 | A ring's colour shows the points the item would earn now, on a fixed scale topped by the most any item can earn. HEAT plays no part | Decided 2026-11-13 |
| 32 | A task's date is a planned day, not a deadline. Once it has passed, the task waits on Today; nothing is ever overdue | Decided 2026-11-15 |
| 33 | The calendar lives inside Today: a week strip and a month grid. Past days show nothing | Decided 2026-11-15 |
| 34 | Tasks (with a date) and routines can have a time of day. It orders and labels; there are no reminders | Decided 2026-11-15 |
| 35 | Today lists due routines and planned tasks, then suggestions from undated tasks until there are five tasks. Dated tasks are not suggested before their day, and planned tasks have no swap | Decided 2026-11-15 |
| 36 | Routines repeat weekly or monthly by day of the month (1 to 30 and Last day). A day a month lacks falls on its last day | Decided 2026-11-15 |
| 37 | Each routine date stays open until the next one comes. Done late, it counts in full; a routine counts once per date | Decided 2026-11-15 |
| 38 | A monthly date opens up to a week early once the one before is done. A single date cannot be moved | Decided 2026-11-15 |
| 39 | Monthly routines build warmth under the same rules as the rest | Decided 2026-11-15 |
| 40 | The Projects tab becomes Areas: an overview with no counts or colour, opening into one page per area that swipes to the next | Decided 2026-11-15 |
| 41 | Routines stay where they are filed, first in their section | Decided 2026-11-15 |
| 42 | A row's check takes back only a completion made today | Decided 2026-11-15 |
| 43 | Repeat offers Daily, saved as a weekly schedule on all seven days. "Stop repeating" turns any routine back into a task | Decided 2026-11-15 |
| 44 | The edge line grows anticlockwise from the top centre, and its tip is a brighter stretch of the line, no wider than it | Decided 2026-11-15 |
| 45 | Priority earns nothing. It puts an item first in every list, above timed items too, and makes its title bold | Decided 2026-11-15 |
| 46 | An undated Priority task is always on Today, like a planned one, and cannot be swapped away | Decided 2026-11-15 |
| 47 | Friction is 0 to 5 stars, each adding 10% of the item's reward. Friction from before is three stars | Decided 2026-11-15; the step is now 20% (51) |
| 48 | Past HEAT is kept when the tags change: old completions carry stars that earn what their tags earned | Decided 2026-11-15 |
| 49 | New project on an area page is a folder-with-plus icon, not a text button | Decided 2026-11-15 |
| 50 | Every area's first task is worth the same, and each further one 80% of the one before. No shrinking bonus for further areas | Decided 2026-11-15 |
| 51 | Friction is 20% a star, so five stars double a task. Stars alone can reach Surge at their limit | Decided 2026-11-15; replaces the 10% of 47 |
| 52 | Rings use the whole gradient up to the Surge peak, on a gentler curve. The glow stops growing at a full gauge | Decided 2026-11-15; replaces "rows never reach the pale end" |
| 53 | Splitting a task is bounded at five times one task, not four | Decided 2026-11-15 |
| 54 | The edge line carries the whole gradient along its length below 100 | Decided 2026-11-15 |
| 55 | Going over 100 plays a sweep round the edge, once per crossing, never on opening. It is the line itself, so it stays within "Surge is shown only by the edge line" | Decided 2026-11-15 |
| 56 | Tasks and routines have a description and subtasks. Subtasks earn nothing, never complete their item, and are never counted | Decided 2026-11-16 |
| 57 | Tapping a row shows its details with Edit; a row with none opens its panel; a long press always does. Swiping a row was set aside because area pages already swipe sideways | Decided 2026-11-16, chosen over swiping left |
| 58 | An item's settings live in a panel that rises from the bottom, not under its row | Decided 2026-11-16 |
| 59 | A routine's subtask ticks belong to the date it is on and clear by themselves when the next opens | Decided 2026-11-16 |
| 60 | Subtasks live inside their item, like a routine's days, not as records with their own `createdAt`, `updatedAt` and `deletedAt` | Decided 2026-11-16 |

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
| 2026-11-12 | Tags: `importantBonus` and `avoidedBonus` (0.75 each, flat, as a share of a plain task) become `priorityBonus` 0.2 and `frictionBonus` 0.3, as a share of the item's own reward. They add, and multiply the area factor and warmth | Asked for (M11). A balanced day with its first task tagged with both goes from 100 points (peak 90) to 92 (peak 87); a huge day from 194 (peak 107, 43% in Surge) to 175 (peak 104, 27%); tagging everything from 205 (peak 108, 47%) to 127 (peak 96, none) |
| 2026-11-15 | `priorityBonus` 0.2 and `frictionBonus` 0.3 become `frictionStep` 0.1 a star, up to five (`FRICTION_STARS`). Priority adds nothing | Asked for (M19). Five stars equal the old pair, so every scenario and the hottest ring are unchanged. Friction from before is three stars and earns what it did |
| 2026-11-15 | `firstInAreaBonus` now carries through an area's repeats (15, 12, 9.6), and `areaBonusDecay` (0.7) is removed. `frictionStep` 0.1 to 0.2. `gainScale` 215 to 275 | Asked for (M20), from mockups of the rings. The new ladder and stars raise a balanced day from 85 to 108 points, so the gain scale holds it at 68 to 85. A light day on Easier still matches a balanced day; a huge day now spends 36% of its time in Surge (was 27%), and five stars on every task 22% (was none) |
