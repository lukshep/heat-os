# HEAT — product specification

## Concept

HEAT is a personal productivity app built around one mechanic: a value from 0 to 100 that cools continuously and rises when you complete tasks and routines. A threshold (initially 60) is marked on the bar. The aim is to bring HEAT up to that line at some point each day. Staying above it all day is not the goal. There are no streaks, deadlines, completion states or analytics.

It is a mobile-first Progressive Web App used mainly on iPhone and also in a desktop browser. Data is stored locally; the structure allows cloud sync later.

## Principles

- HEAT is visually dominant and is the only progress bar.
- Temperature and colour are the primary feedback. Users should recognise the most rewarding action without reading numbers.
- Balanced activity across life areas is rewarded more than volume in one area, but breadth alone is not enough: one task in each area does not reach the line.
- Consistency pays: routines kept reliably are worth more, and lapse quickly when missed.
- Recovery from inactivity is forgiving and immediately rewarding.
- No streak counts, XP, currencies, achievements or dashboards.
- The system must not become a contest to maximise daily output.
- Capture and completion take as few taps as possible.

## Sections

**Today** shows HEAT prominently, then suggested tasks and routines. Suggestions are every routine scheduled today plus a few tasks chosen by how much HEAT they would add. Each pick assumes the earlier ones are done, which spreads suggestions across areas. A suggestion can be swapped for the next candidate. There is no completed state for the day; when suggestions run out the list is empty.

**Projects** shows areas, each holding tasks, routines and arbitrarily nested projects. Projects are organisational only and have no progress.

**Inbox** is frictionless capture. An inbox item is a task with no area and no project; organising it means giving it a home.

Tasks can be completed from any section. A slim HEAT strip stays visible outside Today so every completion gives feedback.

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
  important: boolean; avoided: boolean;
}

interface Routine extends Meta {
  title: string; areaId: ID; projectId: ID | null;
  important: boolean; avoided: boolean;
  schedule: { days: number[] };              // weekdays 0-6 (0 = Sunday); all seven = daily
  warmthBase: { warmth: number; missRun: number; asOf: DayKey };
}

interface Completion extends Meta {          // activity history
  at: number; dayKey: DayKey;
  itemId: ID; kind: 'task' | 'routine';
  areaId: ID | null; important: boolean; avoided: boolean;
  warmth: number;                            // routine warmth when completed; 0 for tasks
  scheduled: boolean;                        // routine: was this a scheduled day
}

interface AppState {
  schemaVersion: number;
  areas: Record<ID, Area>; projects: Record<ID, Project>;
  tasks: Record<ID, Task>; routines: Record<ID, Routine>;
  completions: Record<ID, Completion>;
  deferred: { dayKey: DayKey; taskIds: ID[] };   // set aside from Today; local to the device
}
```

- Nesting is `Project.parentId`. Tasks and routines can sit directly in an area or in any project.
- "Done" is derived from the completion log. Tasks have no `completedAt`.
- Completions record facts, not scores, and snapshot everything needed to score them. Editing or deleting an item later never changes past HEAT.
- Routine warmth is derived by walking scheduled days after `warmthBase.asOf` against the days the routine was completed. Editing a schedule re-snapshots the base so history is not reinterpreted.
- `deferred` holds the tasks swapped out of Today's suggestions. It only counts on the day it was made and is not meant to sync.
- Sync readiness consists of stable IDs, `updatedAt`, soft-delete tombstones, an append-only log, and a fold that ignores duplicates (one completion per task; one per routine per day).

## HEAT model

HEAT is never stored. It is computed by replaying the completion log up to the present. All numbers below are the current values in `HeatConfig` and are expected to change through tuning.

### Cooling

Continuous and proportional, with no reset at midnight:

```
H(t) = H0 * retention^(hours / 24)          retention = 0.80
```

### Points

What a completion is worth before HEAT resistance:

```
points = base * areaFactor * quality        base = 10

areaFactor = 0.8^n                          n = completions already logged in that area today
           + 0.5 * 0.7^k   when n = 0       k = areas already opened today

quality = 1 + (0.5*important + 0.5*avoided) * 0.5^f + 1.0*warmth
                                            f = flagged completions already logged today
```

- **Within an area** each further task is worth 80% of the one before. Plain tasks in the day's first area score 15, 8, 6.4, 5.1, 4.1, so several tasks in an area stay worthwhile.
- **The first task in an area** earns a bonus of half a plain task. Each further area opened that day earns 70% of the previous area's bonus, so first tasks score 15, 13.5, 12.4, 11.7, 11.2, 10.8. A first task in a new area is always worth more than a repeat.
- **An area's daily ceiling** is 55 points from plain tasks, however many are completed or however finely they are split.
- **Flags** add to quality, and the flag bonus halves with each flagged completion already logged that day.
- **Inbox tasks** with no area earn no bonus and do not count as an opened area.

The area day starts at 04:00 local. Each completion stores its own `dayKey`, so travel never rescores history.

### Gain

Each point closes a fraction of the remaining gap to 100:

```
H <- 100 - (100 - H) * e^(-points / S)      S = 300
```

HEAT cannot exceed 100. Low HEAT rises faster than high HEAT: a 15-point task adds 4.9 at HEAT 0, 2.5 at 48 and 1.9 at 60.

A day that ends at the line has cooled to 48 by the same time the next day. Lifting it back to 60 takes about 79 points, and that figure is what the gain scale really sets.

### Expected behaviour

The same pattern every day, completed in one sitting:

| Daily pattern | Points | Daily peak | Reaches the line |
|---|---|---|---|
| One task in each of 5 areas | 64 | 54 | No |
| One task in each of 6 areas | 75 | 59 | No |
| Two tasks in each of 3 areas | 65 | 55 | No |
| Two tasks in each of 4 areas | 85 | 62 | Yes |
| Three tasks in each of 3 areas | 84 | 62 | Yes |
| Three tasks in each of 4 areas | 110 | 69 | Yes |
| One area, unlimited tasks | at most 55 | 50 | No |
| Three fully warm routines alone | 82 | 58 | No |
| Three warm routines and three tasks | 106 | 65 | Yes |

- **Maintenance.** About eight plain tasks across three or four areas reach the line. Six do not, and neither does one task in each area.
- **Balance.** Breadth pays more per task than depth, but one area alone tops out at 50.
- **Consistency.** Three routines plus three tasks settle at 55 while the routines are new and at 65 once they are warm.
- **Stored momentum.** From 75, HEAT is still at the line a day later. From 86, it is still there the morning after a fully skipped day. Holding 75 takes about 140 points a day, so this is a stretch.
- **Recovery.** From zero the first task adds about 5. Maintenance days reach the line on the seventh day; big days (three tasks in each of four areas, one of them Important) on the fourth. After a week away, big days are back at the line within four days.

### Routine warmth

Warmth is a hidden value from 0 to 1 per routine. A fully warm routine is worth twice a plain task.

- Each completion on a scheduled day closes 25% of the gap to full warmth. Warmth is 0.76 after five completions and 0.94 after ten.
- A missed scheduled day removes a share of the warmth that is left: 20% for one miss, 80% for the second in a row, all of it for the third. From full warmth that is 0.80, then 0.16, then 0.
- Warmth settles lower the more often a routine is skipped: around 0.64 to 0.80 when skipped every third day, 0.50 to 0.63 when skipped every other day.
- A completion on an unscheduled day earns HEAT but does not change warmth.
- Warmth, miss counts and streaks are never shown.

### Colour

An item's colour maps the HEAT it would add if completed now onto a continuous temperature gradient. Completing a task immediately cools the other items in its area, and completing a flagged item cools the other flagged ones.

## Balancing risks

| Risk | What happens | Default response |
|---|---|---|
| Trivial-task breadth farming | With no task size, six trivial tasks in six areas settle at 59, just under the line | The shrinking area bonus limits it. Fallback: an optional effort size |
| Flag inflation | Flagging everything lifts a maintenance day from 62 to 69 | The halving rule limits it; self-policing beyond that |
| Area proliferation | Every extra area still adds a first task worth more than a repeat | Keep areas few (about 4–6); the bonus shrinks with each one |
| Task splitting | Twenty small tasks instead of one | Bounded at about 3.6 times one task, per area per day |
| Small steps | At the line each task moves the bar by only 2 or 3 points | Watch in real use. If it feels sluggish, steepen the gain curve rather than lower the bar |
| Slow recovery | From zero it takes a week of maintenance days to reach the line | Big days get there in four. The same fix as small steps |
| Warm routines carry a lot | Three fully warm routines alone reach 58 | Intended reward for consistency; the full-warmth bonus is the lever |
| Very high HEAT is nearly out of reach | Coasting through a day off needs about 140 points a day beforehand | Accept; revisit if it never happens in real use |
| A daily pass or fail | Aiming to touch the line each day can feel like a streak | Never record or display whether the line was reached; the bar and the line are the only signals |
| Time off resets routines | Three missed days in a row leave a routine cold | Intended. A routine pause is a later feature |
| Cadence asymmetry | A daily routine warms in a week, a weekly one in two months | Observe; the step could scale with cadence |
| Retroactive retuning | Changing config rewrites current HEAT, because it is derived | Wanted in the simulator; config is fixed in production builds |

One ordering effect is intended: completing the flagged or warm item first in an area earns more than completing a trivial one first.
