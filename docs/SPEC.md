# HEAT — product specification

## Concept

HEAT is a personal productivity app built around one mechanic: a value that cools continuously and rises when you complete tasks and routines. HEAT is shown as a line of light that runs clockwise round the edge of the screen from the top centre, so halfway is the bottom centre and a full loop is 100. It is a temperature gauge, not a target: it reflects recent activity and sustained consistency, and there is no line to reach, no daily success and no daily failure. Consistent, balanced activity keeps it at about 70 to 85. An exceptional day can push it past 100 into Surge, up to 120. There are no streaks, deadlines, completion states or analytics.

It is a mobile-first Progressive Web App used mainly on iPhone and also in a desktop browser. Data is stored locally; the structure allows cloud sync later.

## Principles

- HEAT is visually dominant and is the only progress meter.
- Temperature and colour are the primary feedback. Users should recognise the most rewarding action without reading numbers.
- HEAT is a living gauge, not a checklist and not a score to maximise. Nothing marks a day as passed or failed.
- Balanced activity across life areas is rewarded more than volume in one area.
- Two optional tags make a task worth more: Priority for what matters most right now, and Friction for what is hard to start, not necessarily hard to do.
- Consistency pays: routines kept reliably are worth more, and lapse quickly when missed.
- Occasional inactivity is not punished, and recovery is immediately rewarding.
- A full gauge is difficult and uncommon. Surge is a temporary buffer of momentum, not a state to hold.
- No streak counts, XP, currencies, achievements or dashboards.
- Capture and completion take as few taps as possible.

## Sections

**Today** shows suggested tasks and routines. Suggestions are every routine scheduled today plus a few tasks chosen by how much HEAT they would add. Each pick assumes the earlier ones are done, which spreads suggestions across areas. A suggestion can be swapped for the next candidate. There is no completed state for the day; when suggestions run out the list is empty.

**Projects** shows areas, each holding tasks, routines and arbitrarily nested projects, as one tree whose sections fold shut. Projects are organisational only and have no progress. Any item can be moved to the Inbox, to the top of an area, or into any project, and an item in a project always belongs to that project's area.

**Inbox** is frictionless capture. An inbox item is a task with no area and no project; organising it means giving it a home.

**Routines** are tasks that repeat. Giving a filed task one or more weekdays makes it a routine; clearing them makes it a one-off task again. A routine must live in an area. On Today it appears on its scheduled days until it is done. In its area it is always listed, shown as done for the rest of the day once completed, and can be completed on an unscheduled day too.

**Settings** holds the hour a new day starts, Effort and Cooling, the backup, and a way to reset HEAT. Effort, Cooling and the reset each ask for confirmation first, and their steps have names, never numbers.

Tasks can be completed from any section. HEAT is shown on every screen, so every completion gives feedback wherever it happens.

The tab bar is icons only: Today, Projects, a plus button in the centre for capture, Inbox and Settings. Everything that is not HEAT feedback is neutral grey, so colour on a screen always means temperature.

## Data model

```ts
type ID = string;       // crypto.randomUUID()
type DayKey = string;   // 'YYYY-MM-DD', local day that starts at config.dayStartHour

interface Meta { id: ID; createdAt: number; updatedAt: number; deletedAt: number | null }

interface Area    extends Meta { name: string; order: number }
interface Project extends Meta { name: string; areaId: ID; parentId: ID | null; order: number }

interface Task extends Meta {
  title: string; note?: string;
  areaId: ID | null; projectId: ID | null;   // both null = Inbox
  priority: boolean; friction: boolean;
}

interface Routine extends Meta {
  title: string; areaId: ID; projectId: ID | null;
  priority: boolean; friction: boolean;
  schedule: { days: number[] };              // weekdays 0-6 (0 = Sunday); all seven = daily
  warmthBase: { warmth: number; missRun: number; asOf: DayKey };
}

interface Completion extends Meta {          // activity history
  at: number; dayKey: DayKey;
  itemId: ID; kind: 'task' | 'routine';
  areaId: ID | null; priority: boolean; friction: boolean;
  warmth: number;                            // routine warmth when completed; 0 for tasks
  scheduled: boolean;                        // routine: was this a scheduled day
}

interface AppState {
  schemaVersion: number;
  areas: Record<ID, Area>; projects: Record<ID, Project>;
  tasks: Record<ID, Task>; routines: Record<ID, Routine>;
  completions: Record<ID, Completion>;
  deferred: { dayKey: DayKey; taskIds: ID[] };   // set aside from Today; local to the device
  settings: {
    dayStartHour: number;
    tuning: { at: number; effort: 'easier' | 'standard' | 'harder'; cooling: 'slower' | 'standard' | 'faster' }[];
  };
  heatResetAt: number | null;                    // when HEAT was last reset to cold
}
```

- Nesting is `Project.parentId`. Tasks and routines can sit directly in an area or in any project.
- A project's `areaId` is the area its outermost ancestor sits in, and an item's `areaId` always matches its project's. Scoring only ever looks at the area.
- Deleting a project moves what it held up one level. Nothing is deleted with it.
- "Done" is derived from the completion log. Tasks have no `completedAt`.
- Completions record facts, not scores, and snapshot everything needed to score them. Editing or deleting an item later never changes past HEAT.
- Routine warmth is derived by walking scheduled days after `warmthBase.asOf` against the days the routine was completed. Editing a schedule re-snapshots the base so history is not reinterpreted.
- A routine keeps the id of the task it was made from, and a task made from a routine keeps the routine's id. The record it left behind is soft-deleted, so an id is live in at most one of the two collections.
- A routine counts once per day. Its completion records the warmth it had at that moment and whether the day was scheduled.
- `settings` holds the parts of the HEAT config a person can change: the hour a new day starts (midnight to 8 am), and Effort and Cooling. Everything else in the config is fixed by the build. A new day start applies from then on.
- `settings.tuning` is every change of Effort and Cooling, oldest first, each with the moment it was made. Before the first both were Standard, and the last is in force now. The log is kept rather than just the current values because HEAT is replayed with whichever settings were in force at each moment.
- `heatResetAt` is when HEAT was last reset. HEAT counts only completions after it. The completion log itself is untouched, so what was done stays done.
- The saved format is at version 5. Version 1, from before settings existed, version 2, which also held the position of the line that used to be reached each day, version 3, from before Effort, Cooling and the reset, and version 4, which saved the tags as `important` and `avoided`, are upgraded on load. The upgraded shape is written at the next change.
- `deferred` holds the tasks swapped out of Today's suggestions. It only counts on the day it was made and is not meant to sync.
- Sync readiness consists of stable IDs, `updatedAt`, soft-delete tombstones, an append-only log, and a fold that ignores duplicates (one completion per task; one per routine per day).

## HEAT model

HEAT is never stored. It is computed by replaying the completion log, from the last reset up to the present. All numbers below are the current values in `HeatConfig`, at Standard Effort and Cooling, and are expected to change through tuning.

The gauge is full at 100 (`FULL_HEAT`) and stops at 120 (`MAX_HEAT`). The stretch between them is Surge.

### Cooling

Continuous and proportional, with no reset at midnight. Surge cools more slowly than the rest of the gauge:

```
below 100:  H(t) = H0 * 0.80^(hours / 24)   20% a day
above 100:  H(t) = H0 * 0.85^(hours / 24)   15% a day, until it reaches 100
```

The two rates meet at 100, so the curve has no jump. From the ceiling of 120, HEAT stays in Surge for about 27 hours.

### Points

What a completion is worth before HEAT resistance:

```
points = base * areaFactor * (1 + warmth) * (1 + tags)        base = 10

areaFactor = 0.8^n                          n = completions already logged in that area today
           + 0.5 * 0.7^k   when n = 0       k = areas already opened today

tags = 0.2 if Priority + 0.3 if Friction    added, never multiplied: both is 0.5
```

- **Within an area** each further task is worth 80% of the one before. Plain tasks in the day's first area score 15, 8, 6.4, 5.1, 4.1, so several tasks in an area stay worthwhile.
- **The first task in an area** earns a bonus of half a plain task. Each further area opened that day earns 70% of the previous area's bonus, so first tasks score 15, 13.5, 12.4, 11.7, 11.2, 10.8. A first task in a new area is always worth more than a repeat.
- **An area's daily ceiling** is 55 points from plain tasks, however many are completed or however finely they are split.
- **Tags** add a share of the task's own reward: 20% for Priority, 30% for Friction, 50% for both. The two shares add; they never multiply each other. Because they scale the reward, they shrink with it: a first task in a fresh area scores 15 plain and 22.5 with both tags, the fifth in an area 4.1 and 6.1. A first task in a fresh area is always worth more than a tagged repeat.
- **Warmth** doubles a fully warm routine's reward, and tags apply on top: a fully warm routine tagged Priority earns 2 × 1.2 times a plain task's.
- **Inbox tasks** with no area earn no bonus and do not count as an opened area.

The area day starts at 04:00 local. Each completion stores its own `dayKey`, so travel never rescores history.

### Gain

Each point closes a fraction of the remaining gap to the ceiling of 120:

```
H <- 120 - (120 - H) * e^(-points / S)      S = 215
```

HEAT cannot exceed 120. Low HEAT rises faster than high HEAT: a 15-point task adds 8.1 at HEAT 0, 4.7 at 50, 3.4 at 70, 2.4 at 85 and 1.3 at 100.

Aiming the curve at 120 is what makes 100 reachable at all, and the gain scale is what makes it hard: from the low point of a balanced routine (68), filling the gauge takes about 206 points in one day, more than two balanced days of work.

### Expected behaviour

The same pattern every day, completed in one sitting. HEAT swings between a daily peak, just after the work, and a daily low, just before the next day's.

| Daily pattern | Points | Daily peak | Daily low | Time in Surge |
|---|---|---|---|---|
| One task in each of 5 areas | 64 | 76 | 61 | None |
| Light day: two tasks in each of 3 areas | 65 | 77 | 61 | None |
| Balanced day: two tasks in each of 4 areas | 85 | 85 | 68 | None |
| Balanced day, its first task tagged Priority and Friction | 92 | 87 | 70 | None |
| Big day: three tasks in each of 4 areas, the first tagged with both | 118 | 94 | 75 | None |
| Huge day: a big day with its first two tasks tagged with both, and three warm routines | 175 | 104 | 85 | 27% |
| Balanced day with every task tagged with both | 127 | 96 | 77 | None |
| One area, unlimited tasks | at most 55 | 71 | 57 | None |
| Three warm routines and three tasks, spread through the day | 103 | 87 | 76 | None |

- **Where consistency sits.** A balanced day, kept up, moves between 68 and 85. It never fills the gauge, however long it is kept up.
- **Surge is uncommon.** A full gauge needs about two and a half balanced days of points in one day. A huge day kept up every day spends about a quarter of its time in Surge and is back below 100 before the next day's work. Tags alone cannot get there: a balanced day with every task tagged with both peaks at 96.
- **Tags lift a little.** Both tags on a balanced day's first task take its peak from 85 to 87.
- **Balance.** Breadth pays more per task than depth, and one area alone tops out at 71.
- **Rest is not punished.** From 85, HEAT is 68 after one day off and 54 after two. After a week away it is back above 70 on the third balanced day.
- **Recovery.** From zero the first task adds about 8. Balanced days peak at 39, 60, 72, 78 and 81.
- **Stored momentum.** From 110, HEAT is still in Surge twelve hours later and at 91 a day later. At the ordinary rate it would be 98 and 88.

### Effort and Cooling

Two settings a person can change, each with three named steps. Standard is the model above.

- **Effort** sets how much a day's work warms HEAT, by scaling the gain scale: 0.75 on Easier, 1 on Standard, 1.3 on Harder. On Easier a light day (two tasks in each of three areas) sits where a balanced day does on Standard. On Harder it takes three tasks in each of four areas.
- **Cooling** sets how fast HEAT fades: 15% a day on Slower, 20% on Standard, 25% on Faster. It does not touch points, so slower cooling also lets the same days sit higher. Surge keeps its own rate of 15% a day, but never cools faster than the rest of the gauge, so on Slower the two rates are the same.
- **A change applies from the moment it is made.** Each completion is scored, and each stretch of time cooled, with the settings in force at the time. HEAT already earned does not move when a setting changes.

A balanced day (two tasks in each of four areas), every day, peaks and lows:

| Effort | Slower | Standard | Faster |
|---|---|---|---|
| Easier | 99 / 84 | 93 / 74 | 88 / 66 |
| Standard | 92 / 78 | 85 / 68 | 79 / 59 |
| Harder | 84 / 72 | 77 / 61 | 70 / 53 |

On every combination a balanced day stays out of Surge, and a huge day kept up every day drops back below 100 before the next day's work.

### Reset

Settings can reset HEAT to cold. The time is saved, and HEAT counts only completions after it. Nothing is deleted: tasks and routines are untouched, and anything completed before the reset stays done. Completions earlier in the same day no longer count toward that day's diminishing returns. There is no undo short of importing a backup.

### Routine warmth

Warmth is a hidden value from 0 to 1 per routine. The area part of a fully warm routine is worth twice a plain task's.

- Each completion on a scheduled day closes 25% of the gap to full warmth. Warmth is 0.76 after five completions and 0.94 after ten.
- A missed scheduled day removes a share of the warmth that is left: 20% for one miss, 80% for the second in a row, all of it for the third. From full warmth that is 0.80, then 0.16, then 0.
- Warmth settles lower the more often a routine is skipped: around 0.64 to 0.80 when skipped every third day, 0.50 to 0.63 when skipped every other day.
- A completion on an unscheduled day earns HEAT but does not change warmth.
- Warmth, miss counts and streaks are never shown.

### Colour

An item's colour maps the points it would earn if completed now onto a continuous temperature gradient. HEAT itself plays no part: a ring shows what the item is worth, and the edge shows how warm the person is. The scale is fixed, with the hottest colour at the most any item can earn, a fully warm routine with both tags done first in the day. Everyday items sit in the middle of the gradient, and the hot end is kept for warm routines and tagged items.

Colour is recomputed whenever the day's completions change, so every open task and routine always shows what it is currently worth:

- completing a task immediately cools the other items in its area, and a new day warms them again
- a tag or a routine's warmth always shows: the item is a step warmer than the plain ones beside it, by the same step wherever it falls in its area
- the hottest ring is still the item that would add the most HEAT, since at any one moment HEAT scales every item's gain by the same factor

The edge line uses the same gradient for HEAT itself and carries on past it in Surge, from yellow at 100 to a bright pale yellow at 120. Rows never reach that pale end.

### Surge on screen

Below 100 the line grows clockwise round the edge, and a full loop is 100. Above 100 the loop is closed, so Surge shows in the line itself: it thickens from 4 to 9 points, pales, glows wider, and a band of light travels slowly round it. The bright tip is hidden, since the line no longer has an end. With reduced motion the band stays still.

Nothing else marks Surge. It is not named in the app, and no record is kept of reaching it.

## Balancing risks

| Risk | What happens | Default response |
|---|---|---|
| Tag inflation | Tagging all eight tasks of a balanced day with both tags scores 127 points and peaks at 96, short of Surge | Small now that tags are a share of the reward. The tags still only mean something if used honestly |
| Trivial-task breadth farming | With no task size, one trivial task in each of five areas settles at 76, inside the band meant for balanced activity | Accepted now that there is no line to pass. Fallback: an optional effort size |
| The typical day is a guess | Everything is calibrated to two tasks in each of four areas being a balanced day | The gain scale is the one dial: lower it and the same day sits higher. Retune after real use |
| Area proliferation | Every extra area still adds a first task worth more than a repeat | Keep areas few (about 4–6); the bonus shrinks with each one |
| Task splitting | Twenty small tasks instead of one | Bounded at about 3.6 times one task, per area per day |
| Warm rows in Surge | Rings do not cool as HEAT climbs, so in Surge they look as inviting as ever and give no sign that it is fine to stop | The edge line carries that sign: in Surge it thickens, pales and a band travels round it. Rings stay true to what each item is worth |
| Surge as a target | A thicker, brighter line could become the new thing to chase every day | It takes a huge day and fades within about a day. No record is kept and it is never named in the app |
| No landmark on the edge | Without a mark, 70 and 85 are a short distance apart on a featureless line | Colour carries the level. Watch whether position still reads |
| Warm routines carry a lot | Three warm routines and three tasks settle at 87, above a balanced day of eight tasks | Intended reward for consistency; the full-warmth bonus is the lever |
| Time off resets routines | Three missed days in a row leave a routine cold | Intended. A routine pause is a later feature |
| Cadence asymmetry | A daily routine warms in a week, a weekly one in two months | Observe; the step could scale with cadence |
| Retroactive retuning | Changing the defaults in a new build rewrites current HEAT, because it is derived. The Surge change raised everyone's current HEAT when it landed | Wanted in the simulator. A person's own Effort and Cooling apply from the moment they change, so they never rewrite it |
| Settings as a lever | Switching to Easier for a burst of work and back again keeps what was earned under Easier | Accepted for a personal app. The confirmation is the friction |
| Stacked settings | Easier and Slower together put a balanced day at 99, just short of a full gauge | Accepted: both were chosen. The scenario tests keep a balanced day out of Surge on every combination |

One ordering effect is intended: completing the warm or tagged item first in an area earns more than completing a plain one first, because warmth and tags are both a share of a reward that shrinks with each task in the area.
