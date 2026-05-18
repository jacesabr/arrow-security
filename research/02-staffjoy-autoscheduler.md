# Staffjoy Autoscheduler — Deep Reverse-Engineering Notes

**Researched:** 2026-05-17  
**Source repo:** [github.com/Staffjoy/autoscheduler](https://github.com/Staffjoy/autoscheduler) — commit `master`, MIT license  
**Local copy:** `research/staffjoy-autoscheduler/`  
**Purpose:** Understand the scheduling problem formulation well enough to port it to OR-Tools or Timefold.

---

## Summary

The Staffjoy autoscheduler (Generation 1, 2015–2016) is a Julia/JuMP mixed-integer programming (MIP) microservice that simultaneously creates shift times and assigns guards to them. It was replaced in production by the Chomp + Mobius decomposition in 2016 and is now unmaintained (Julia 0.3 syntax). The codebase is nonetheless the clearest open-source reference for the two-level scheduling problem we need to solve:

1. **Week Model** — which guard works which days (binary assignment, maximise "lift")
2. **Day Model** — given today's assigned guards, find concrete start/end times (minimise total hours)
3. **Serial Scheduling** — chain Day Models across the week, carrying intershift-rest forward; run 7 start-day variants in parallel to escape path dependency

The constraint set maps cleanly to OR-Tools CP-SAT. The architecture (microservice called via HTTP, writes back to main API) is directly adoptable.

---

## Stack and Dependencies

| Item | Detail |
|---|---|
| Language | Julia 0.3 (2015 vintage — do not run this) |
| MIP solver | JuMP DSL with Gurobi (production) or CBC (open-source fallback) |
| HTTP framework | Julia `Requests` library, runs as a polling microservice |
| License | MIT |
| Deployment | Docker container; polls a task queue endpoint, fetches data, writes back |
| Timeouts | ITERATION_TIMEOUT = 6 min, SEARCH_TIMEOUT = 20 min, CALCULATION_TIMEOUT = 3 min per sub-problem |

The algorithm constants (`StaffJoy.jl` lines 39–71):

```julia
LYFT_THROTTLE   = 0.999   # each iteration's lift ceiling = prior_lift * 0.999
MIN_LYFT        = 1.1     # stop iterating when lift falls below this
UNASSIGNED_RATIO = 0.4    # synthetic shift length = min + (max-min)*0.4
BIFURCATE_THRESHOLD = 350 # total weekly coverage-hours above which split the problem
```

---

## Data Model: Decision Variables and Domains

### Org-Level Parameters (the `env` dict)

Sourced from `Manager/calculation.jl` lines 22–40 and the README `Org Options` section:

| Parameter | Type | Source | Meaning |
|---|---|---|---|
| `coverage[day][hour]` | int[][] | schedule demand | Guards needed at each hour of each day |
| `shift_time_min` | int (hours) | `organization.min_shift_length` | Shortest allowed shift |
| `shift_time_max` | int (hours) | `organization.max_shift_length` | Longest allowed shift |
| `intershift` | int (hours) | `organization.hours_between_shifts` | Minimum rest between consecutive shifts |
| `no_shifts_after` | int (hour) | optional org field | Curfew: no shift may start after this hour (unassigned mode only) |
| `day_week_starts` | string | `organization.day_week_starts` | e.g. `"monday"` — rotates the 7-day array |
| `time_between_coverage` | int | hardcoded 0 | Gap between demand periods (windowing artifact) |

### Per-Guard Parameters (the `workers` dict)

Sourced from `Manager/calculation.jl` lines 42–63:

| Field | Type | Meaning |
|---|---|---|
| `availability[day][hour]` | bool[][] | Can this guard work at this hour? |
| `hours_min` | int | Weekly minimum hours (from `min_hours_per_week`) |
| `hours_max` | int | Weekly maximum hours (from `max_hours_per_week`) |
| `shift_time_min` | int | This guard's minimum shift length (inherits from org if absent) |
| `shift_time_max` | int | This guard's maximum shift length |
| `shift_count_min` | int | Minimum shifts per week (from `min_shifts_per_week`) |
| `shift_count_max` | int | Maximum shifts per week (from `max_shifts_per_week`) |
| `no_shifts_after` | int | Guard-level curfew (offset by TIME_OFFSET=3 from the 4 AM reference) |
| `worked_day_preceding_week` | bool | Did this guard work the last day of the preceding week? (for consecutive-days-off constraint) |

### Derived per-guard values computed during `build_week()`

(`week.jl` lines 269–349)

| Derived field | How computed |
|---|---|
| `shift_count_min` | `ceil(hours_min / shift_time_max)` if not explicit |
| `shift_count_max` | `min(floor(hours_max / shift_time_min), days_per_week, days_available)` |
| `longest_availability[day]` | Longest consecutive available block on that day, capped at `shift_time_max`, zeroed if below `shift_time_min` |
| `days_assigned[day]` | Output of Week Model — 1 if guard works that day, else 0 |

---

## Week Model

**File:** `StaffJoy/week.jl`, function `assign_employees_to_days()` (lines 444–605)

### Decision Variables

```
decision_variable[i]    ∈ {0, 1}    i ∈ [1 .. days_per_week × num_guards]
decision_consecutive[i] ∈ {0, 1}    (only when consecutive=true)
lift                    ≥ 1.0       (continuous)
```

`decision_variable[i]` encodes guard `e` × day `d` through the index arrays `decision_index_to_employee` and `decision_index_to_day`.

### Objective

```
Maximise: lift
```

`lift` is a real-valued slack variable — the ratio by which the capacity of assigned guards exceeds the daily coverage requirement. Higher lift means more slack for the Day Model to find feasible shifts.

### Constraints

**C-W1 (hard) — Minimum shift count per guard:**
```
shift_count_min[e] ≤ Σ_d decision_variable[e,d]    ∀ guard e
```

**C-W2 (hard) — Maximum shift count per guard:**
```
Σ_d decision_variable[e,d] ≤ shift_count_max[e]    ∀ guard e
```

**C-W3 (hard) — Minimum weekly hours (capacity proxy):**
```
Σ_d (longest_availability[e,d] × decision_variable[e,d]) ≥ hours_min[e]    ∀ guard e
```

**C-W4 (hard) — Zero availability day exclusion:**
```
decision_variable[e,d] = 0    if longest_availability[e,d] == 0
```

**C-W5 (hard) — Daily capacity must cover demand × lift:**
```
Σ_e (longest_availability[e,d] × decision_variable[e,d]) ≥ Σ_t coverage[d][t] × lift    ∀ day d
```

**C-W6 (hard) — Per-hour availability coverage:**
```
Σ_e (availability[e,d,t] × decision_variable[e,d]) ≥ coverage[d][t]    ∀ day d, ∀ hour t
```

**C-W7 (soft/iterative) — Lift ceiling:**
```
lift ≤ lift_ceiling    (applied only in iterations 2+; lift_ceiling = prior_lift × LYFT_THROTTLE)
```

**C-W8 (hard, optional) — Consecutive days off:**
```
When consecutive=true and shift_count_max[e] < (days_per_week - 1):
    Σ_d decision_consecutive[e,d] ≥ 1    ∀ guard e

decision_consecutive[e,1] = 0                                    (if guard worked preceding week's last day)
decision_consecutive[e,1] + decision_variable[e,1] = 1          (if guard did NOT work preceding week's last day)

(decision_variable[e,d] + decision_variable[e,d-1]) ≥ 1 - decision_consecutive[e,d]    ∀ d > 1
(2 - decision_variable[e,d] - decision_variable[e,d-1]) ≥ 2 × decision_consecutive[e,d]   ∀ d > 1
```

`decision_consecutive[e,d] = 1` encodes that guard `e` has two consecutive days off that include day `d` and `d-1`. The two-constraint pair forces it to be 1 only when both `decision_variable[e,d] = 0` and `decision_variable[e,d-1] = 0`.

**Output:** `employees[e]["days_assigned"]` — a 0/1 array of length `days_per_week`.  
**Also returned:** `prior_lift` — the achieved lift value, used to tighten the ceiling in the next outer-loop iteration.

---

## Day Model

**File:** `StaffJoy/day.jl`, function `calculate_day()` (lines 24–230)

The Day Model receives only the guards already assigned to this day (from Week Model output). Time is discretised into hourly slots (`total_time = length(env["coverage"])`).

### Decision Variables

```
shift_start[e]              ∈ Z, [1, total_time + 1 - shift_min[e]]    ∀ guard e
shift_length[e]             ∈ Z, [shift_min[e], shift_max[e]]           ∀ guard e

started[e, t]               ∈ {0, 1}    flat index i = (t-1)×num_e + e_index
active[e, t]                ∈ {0, 1}    same flat index scheme

start_min_now_pos[e, t]     ∈ Z, [0, total_time]
start_min_now_neg[e, t]     ∈ Z, [0, total_time]
start_min_now_helper[e, t]  ∈ {0, 1}
```

The `started`/`active`/`start_min_now_*` variables are a Big-M linearisation to convert the integer `shift_start` variable into a binary "is this guard active at hour t" representation.

### Objective

```
Minimise: Σ_e shift_length[e]
```

Minimise total scheduled hours (cost / overtime minimisation).

### Constraints

**C-D1 (hard) — Shift start upper bound:**
```
shift_start[e] ≤ total_time + 1 - shift_min[e]    ∀ e
(ensures the shift can finish within the day)
```

**C-D2 (hard, optional) — Curfew:**
```
shift_start[e] ≤ no_shifts_after    ∀ e    (when no_shifts_after is set)
```

**C-D3 (hard) — Big-M linearisation of start indicator:**
```
start_min_now_pos[i] ≤ M × start_min_now_helper[i]
start_min_now_neg[i] ≤ M × (1 - start_min_now_helper[i])
start_min_now_pos[i] - start_min_now_neg[i] = shift_start[e] - t
1 ≤ start_min_now_pos[i] + start_min_now_neg[i] + started[i]
where M = total_time + 1
```

This encodes: `started[i] = 1` iff `shift_start[e] = t` (i.e., the shift begins at exactly this hour).

**C-D4 (hard) — Contiguous shift (single block):**
```
When t = 1:  started[e,1] = active[e,1]
When t > 1:  started[e,t] ≥ active[e,t] - active[e,t-1]
```
(Prevents split shifts — once a shift ends it cannot resume.)

**C-D5 (hard) — Exactly one start per guard:**
```
Σ_t started[e,t] = 1    ∀ guard e
```

**C-D6 (hard) — Length consistency:**
```
shift_length[e] = Σ_t active[e,t]    ∀ guard e
```

**C-D7 (hard) — Availability windows:**
```
active[e,t] = 0    when availability[e][t] = 0
```

**C-D8 (hard) — Hourly coverage minimum:**
```
Σ_e active[e,t] ≥ coverage[t]    when coverage[t] > 0    ∀ hour t
Σ_e active[e,t] = 0              when coverage[t] = 0    ∀ hour t
```

The zero-coverage-means-nobody-working constraint prevents unnecessary guard assignment in off-hours.

**Output:** `schedule[e] = { start: int, length: int }` for each guard.

---

## Serial Scheduling

**File:** `StaffJoy/serial_schedulers.jl`

### Why serial?

The intershift rest constraint (`hours_between_shifts`) creates temporal dependency between days. If guard Alice ends Monday at hour 20 and the day is 24 hours long, she has 4 hours left. If `intershift = 12`, she cannot start Tuesday until hour `12 - 4 = 8`. This makes tomorrow's availability depend on today's solution — the problem cannot be decomposed by day independently.

### How it works (`schedule_by_day_balanced`, lines 36–136)

State maintained across the day loop:
- `hours_scheduled[e]` — cumulative hours worked so far this week
- `weekly_schedule[e]` — list of `{day, start, length}` tuples

For each day (in order from `start_day` to `start_day + days_per_week - 1`, modulo 7):

1. **Filter guards:** only include guards where `days_assigned[day] == 1`.
2. **Compute day bounds** via `get_day_bounds()` (see below).
3. **Run Day Model** with the filtered guard list and day-specific bounds.
4. **Update state:** add the day's hours to `hours_scheduled[e]`.
5. **Propagate intershift constraint to next day:**
   ```
   last_shift = schedule[e].start + schedule[e].length - 1
   hours_left_in_day = day_length - last_shift
   overflow = intershift - hours_left_in_day - time_between_coverage
   if overflow > 0:
       availability[e][next_day][1..overflow] = 0
       anneal_availability(...)  # also zero any resulting blocks < shift_time_min
       longest_availability[e][next_day] = recompute
   ```

### `get_day_bounds()` — balanced lookahead (`helpers.jl` lines 63–92)

Prevents over- or under-scheduling in early days by looking at remaining capacity:

```
remaining_hours_max = hours_max[e] - hours_scheduled[e]
remaining_hours_min = hours_min[e] - hours_scheduled[e]
future_capacity = Σ (longest_availability[e,d'] × days_assigned[e,d'])  for d' > today

day_min = max(remaining_hours_min - future_capacity, shift_time_min)
day_max = min(remaining_hours_max - future_min_capacity, longest_availability[e,today])
  where future_min_capacity = Σ days_assigned[e,d'] × shift_time_min  for d' > today
```

This ensures: if a guard has 20h remaining and 2 days left after today, today's shift can be at most `20 - 2 × shift_min` hours, preventing over-assignment.

### Why 7 start-day variants?

Starting from Monday and working forward may create infeasible Tuesday configurations that starting from Tuesday and working forward would avoid. Running all seven start-day orderings in parallel (via Julia's `pmap`) explores all rotations of the weekly constraint chain. Each Day Model result is cached, so redundant computations are skipped.

Two scheduling variants are also run in parallel per start day: **balanced** (lookahead) and **greedy** (no lookahead, drops shifts if over budget). This gives `7 days × 2 methods = 14` parallel chains per outer iteration.

### The outer loop (`schedule_week()`, `week.jl` lines 161–253)

```
valid_schedules = []
prior_lift = false
lift_ceiling = false

while (prior_lift == false OR prior_lift × LYFT_THROTTLE > MIN_LYFT):
    if timeout hit and no solution found: break
    if timeout hit and solution found: break (take best so far)

    lift_ceiling = prior_lift × LYFT_THROTTLE   (false on first iteration)
    ok, employees, prior_lift = assign_employees_to_days(employees, env, consecutive, lift_ceiling)
    if not ok: break

    results = pmap(schedule_by_day, [all 14 {start_day, method} configs])
    for valid_schedule in results:
        if total_hours == perfect_optimality: return immediately
        push to valid_schedules

# Return best valid schedule (fewest total hours scheduled)
```

`perfect_optimality = week_sum_coverage(env)` — the theoretical minimum (exactly meeting demand with zero overage).

---

## Unassigned Shifts Mode and Bifurcation

When no guards are registered (`employees == {}`), the system generates synthetic "unassigned" shift placeholders to fill demand. These are not tied to real people.

**`meet_base_coverage()`** pre-generates unassigned shifts until `Σ hours_max ≥ sum_coverage × MIN_LYFT`.

**`generate_unassigned_shift()`** creates a fake guard with:
- availability = all ones (available all the time)
- `shift_count_min = shift_count_max = 1`
- `hours_min = shift_time_min`, `hours_max = shift_time_max`

**Bifurcation** (`bifurcate.jl`): when total weekly coverage-hours > 350, split the coverage array in half (ceiling and floor), solve both sub-problems independently, merge the results. This is a pure speed heuristic — two smaller MIP problems are faster than one large one.

---

## Windowing Preprocessing

**File:** `StaffJoy/windowing.jl`

Before running any model, the scheduler trims the time dimension to the first and last non-zero coverage hour across all days. This reduces the `total_time` variable in the Day Model, cutting the number of binary variables significantly.

`time_delta` (hours trimmed from start + end) is added to `time_between_coverage` and subtracted from `no_shifts_after` to keep those constraints calibrated. Shift start times are translated back to absolute hours in the output.

---

## Availability Annealing

**File:** `StaffJoy/helpers.jl`, function `anneal_availability()` (lines 23–61)

After an intershift constraint zeros out early hours of the next day's availability, a guard might have a remaining availability window that is shorter than `shift_time_min`. `anneal_availability()` zeros out any availability run shorter than `shift_time_min` — preventing the Day Model from attempting to schedule an illegal short shift.

This is called after every intershift propagation and again during initial `build_week()` preprocessing.

---

## API / Interface Surface

### Inbound task trigger (`Manager/server.jl`)

```json
POST {
  "schedule_id": 1,
  "role_id": 1,
  "location_id": 1,
  "organization_id": 1,
  "api_token": "abc123"
}
```

The microservice polls for tasks, fetches all data from the Suite REST API, runs `StaffJoy.schedule(workers, env)`, and writes shifts back via `set_shifts()`.

### `StaffJoy.schedule(workers, env)` — the core entry point

```
Input:
  workers: Dict[guard_id → worker_dict]
  env:     Dict with coverage, shift_time_min, shift_time_max, intershift, etc.

Output:
  (ok: bool, shifts: Dict[guard_id → [{ day, start, length }, ...]])
```

### Response written back to Suite API

```json
DELETE {
  "solver_hash": "12lfls3lf"
}
```

(Shift objects are written via separate PUT/POST calls to the shifts API.)

---

## Solver-Agnostic Pseudocode: Week Model

```
# Inputs
E = set of guards
D = {1..days_per_week}
coverage[d][t]                    # integer, guards needed at hour t on day d
longest_availability[e][d]        # integer, max hours guard e can work on day d
hours_min[e], hours_max[e]        # per-guard weekly bounds
shift_count_min[e], shift_count_max[e]  # per-guard shift-count bounds

# Decision variables
x[e,d] ∈ {0,1}               for all e in E, d in D   # guard e works day d?
c[e,d] ∈ {0,1}               (only when enforcing consecutive days off)
L ≥ 1.0                       (real-valued lift)

# Objective
Maximise L

# Constraints
for each guard e:
    sum_d x[e,d] >= shift_count_min[e]                                     # C-W1
    sum_d x[e,d] <= shift_count_max[e]                                     # C-W2
    sum_d (longest_availability[e,d] * x[e,d]) >= hours_min[e]            # C-W3
    x[e,d] = 0  if longest_availability[e,d] == 0                         # C-W4

for each day d:
    sum_e (longest_availability[e,d] * x[e,d]) >= sum_t coverage[d][t] * L   # C-W5
    for each hour t:
        sum_e (raw_availability[e,d,t] * x[e,d]) >= coverage[d][t]           # C-W6

if lift_ceiling is set:
    L <= lift_ceiling                                                       # C-W7

# Optional consecutive days off
if consecutive_mode:
    for each guard e where shift_count_max[e] < days_per_week - 1:
        sum_d c[e,d] >= 1                                                   # C-W8a
    for each guard e, day d > 1:
        x[e,d] + x[e,d-1] >= 1 - c[e,d]                                   # C-W8b
        2 - x[e,d] - x[e,d-1] >= 2 * c[e,d]                               # C-W8c
    for day d=1:
        c[e,1] + x[e,1] = 1  (if guard did NOT work last day of prior week) # C-W8d
        c[e,1] = 0            (if guard DID work last day of prior week)     # C-W8e
```

---

## Solver-Agnostic Pseudocode: Day Model

```
# Inputs (for a single day)
E_day = set of guards assigned to this day
total_time = number of hours in the day window (after windowing)
coverage[t]             # integer, guards needed at hour t
availability[e][t]      # bool, guard e available at hour t
shift_min[e], shift_max[e]   # per-guard shift length bounds

# Decision variables
shift_start[e]  ∈ Z, [1, total_time + 1 - shift_min[e]]        for all e
shift_length[e] ∈ Z, [shift_min[e], shift_max[e]]              for all e
active[e,t]     ∈ {0,1}                                         for all e, t
started[e,t]    ∈ {0,1}                                         for all e, t

# Objective
Minimise sum_e shift_length[e]

# Constraints
# Shift curfew (optional)
shift_start[e] <= no_shifts_after    if defined

# Contiguous shift block (linearisation via "started" indicator)
for each guard e:
    sum_t started[e,t] = 1                              # exactly one start
    shift_length[e] = sum_t active[e,t]                 # length consistency
    for each hour t:
        if t == 1:  started[e,t] = active[e,t]
        else:       started[e,t] >= active[e,t] - active[e,t-1]
        # (This + the single-start constraint forces one contiguous run)

# Availability windows
active[e,t] = 0   if availability[e][t] == 0

# Coverage
for each hour t:
    sum_e active[e,t] >= coverage[t]    if coverage[t] > 0
    sum_e active[e,t] = 0              if coverage[t] == 0
```

---

## Constraint Catalog

Numbered list; each tagged hard/soft, with the org-option or guard field that controls it.

| # | Constraint | Type | Controlling parameter |
|---|---|---|---|
| 1 | Guard minimum weekly hours | Hard | `guard.hours_min` (per guard) |
| 2 | Guard maximum weekly hours | Hard | `guard.hours_max` (per guard) |
| 3 | Guard minimum shifts per week | Hard | `guard.shift_count_min` (per guard, or derived from hours_min / shift_time_max) |
| 4 | Guard maximum shifts per week | Hard | `guard.shift_count_max` (per guard, or derived from hours_max / shift_time_min) |
| 5 | Minimum shift length | Hard | `org.min_shift_length` (inherited by guard if not set per-guard) |
| 6 | Maximum shift length | Hard | `org.max_shift_length` (inherited by guard if not set per-guard) |
| 7 | Guard availability windows | Hard | `guard.availability[day][hour]` — binary matrix |
| 8 | Hourly coverage requirement | Hard | `org.coverage[day][hour]` (from demand array) |
| 9 | Minimum rest between consecutive shifts | Hard | `org.hours_between_shifts` (or `guard.intershift` per-guard override) |
| 10 | Single contiguous shift per day (no split shifts) | Hard | Architecture constraint; no parameter |
| 11 | No assignment on zero-coverage hours | Hard | Derived from `coverage[t] == 0` |
| 12 | Shift curfew (latest start time) | Hard | `org.no_shifts_after` (optional; unassigned mode only) |
| 13 | Consecutive days off (≥2 consecutive) | Hard | Triggered when `shift_count_max < days_per_week - 1`; enabled by `consecutive` flag |
| 14 | Cross-week rest continuity (preceding week's last day) | Hard | `guard.worked_day_preceding_week` boolean |
| 15 | Week start day rotation | Hard | `org.day_week_starts` (string: "monday" etc.) |
| 16 | Lift ceiling (iterative tightening) | Soft | `LYFT_THROTTLE = 0.999` constant; `MIN_LYFT = 1.1` stop threshold |
| 17 | Availability annealing (short-block zeroing) | Hard | `org.min_shift_length` — blocks shorter than this are zeroed out |
| 18 | Zero-coverage hour exclusion (guards cannot work) | Hard | Derived from `coverage[t] == 0`; applied in `build_week()` |
| 19 | Minimum hours feasibility check (capacity × MIN_LYFT) | Hard | `MIN_LYFT = 1.1` constant; triggers unassigned shift injection |
| 20 | Bifurcation threshold | Performance | `BIFURCATE_THRESHOLD = 350` weekly coverage-hours |

---

## Algorithms and Techniques Worth Borrowing

1. **Lift as a feasibility proxy.** Maximising lift before running the Day Model dramatically improves Day Model convergence rate. A lift below 1.0 guarantees infeasibility; the higher the lift, the more scheduling slack exists. For Arrow Security, implement as: Week Model objective = maximise `(total available guard-hours) / (total required coverage-hours)`.

2. **Availability annealing.** Before running any solver, sweep the availability matrix and zero out any consecutive-available run shorter than `shift_time_min`. This prunes the search space without changing the feasible solution set.

3. **Windowing.** Trim the time dimension to the first/last non-zero coverage hour. For a site that needs guards only 06:00–22:00, this turns a 24-slot problem into a 16-slot problem — 33% fewer binary variables in the Day Model.

4. **Intershift propagation as availability mutation.** Rather than encoding rest constraints as big-M constraints across two days (complex, many variables), Staffjoy mutates the *availability array* for the next day in-place after each day is scheduled. This is elegant and translates directly to OR-Tools without any cross-day variable linking.

5. **Parallel start-day variants.** For an OR-Tools port, run 7 parallel processes (one per start day), each with a different seed permutation of the day loop. Use Python `multiprocessing.Pool` or Celery tasks. Take the best result.

6. **Two-phase scheduling.** Week Model (assign guards to days) then Day Model (assign exact hours). This decomposition is critical for tractability — the combined problem scales exponentially; the decomposed problem is much smaller at each stage.

7. **Greedy fallback.** When the balanced lookahead fails (due to infeasibility), the greedy approach drops shifts rather than backtracking. This gives a second chance at a solution at the cost of slightly worse optimality.

8. **Unassigned shift injection.** When coverage cannot be met with available guards, inject synthetic "always available" shift slots. This makes the infeasibility explicit in the output (supervisor sees "2 shifts unassigned") rather than returning an error, which is much more useful in production.

---

## What Is Missing for Our Security App

Staffjoy was built for gig-economy food delivery and retail. Security guard operations need additional constraints it does not model:

| Missing feature | Why we need it | Where to add |
|---|---|---|
| Skill/certification matching | Armed vs. unarmed, CCTV operator, first aid certified | Add `skill_tags` to users and `required_skills` to sites; filter guard pool before running solver |
| Site assignment | Guards are not freely interchangeable across sites | Staffjoy scopes by `role_id` (one role = one site); we already have `siteId` on shifts — just filter the guard pool per site before calling solver |
| Indian labour law: 10h minimum rest | Factories Act / OSHWC Code — Staffjoy's `hours_between_shifts` covers this, but must default to 10 | Set `hours_between_shifts = 10` as hard floor |
| Indian labour law: 48h/week maximum | Staffjoy's `hours_max` covers this | Set `hours_max = 48` as default; flag shifts beyond 48h as overtime |
| Indian labour law: mandatory rest day | 1 day off per 7 consecutive days worked | Add constraint: `shift_count_max ≤ 6` always; add cross-week tracking of consecutive days worked |
| Overtime cost flagging | Shifts beyond 48h/week → 2× rate for payroll | Tag shifts `overtime: true` when guard's weekly total exceeds 48h |
| Public holidays | Guards may get premium pay or day off | Add `public_holiday` boolean to shifts; exclude from normal coverage requirement calculations |
| Split shifts | Security often does 6am–noon + 6pm–midnight (two posts) | Staffjoy explicitly prevents split shifts; we may need to allow them by modelling each post as a separate shift |
| Night shift differential | Pay premium for 22:00–06:00 hours | Tag shift hours, compute in payroll; not a scheduling constraint per se |
| Patrol checkpoint requirements | Specific guards must cover specific patrol routes | Add `required_checkpoints` constraint; filter by certified guards |
| Client SLA windows | Some sites need guards from 06:00–18:00, others 24/7 | Already in `coverage_requirements` design; no algorithm change needed |
| Multi-site shift (one guard, two sites) | Not relevant for typical security ops | Skip |

---

## Verdict

**Adopt the algorithm design; rewrite in Python/OR-Tools.**

The Staffjoy autoscheduler codebase cannot be run or extended (Julia 0.3, dead). But the two-level decomposition (Week Model + Day Model), the lift feasibility signal, availability annealing, windowing, intershift propagation, and the parallel start-day strategy are all sound, well-tested ideas that translate directly to OR-Tools CP-SAT.

| Question | Answer |
|---|---|
| Is the Julia code reusable? | No. Julia 0.3, unmaintained, Gurobi required for production speed. |
| Is the algorithm design worth copying? | Yes — strongly. The constraint formulation is complete and production-validated. |
| Best solver for our stack? | Google OR-Tools CP-SAT (free, Python, actively maintained, handles all these constraint classes). |
| Effort to port? | ~300–500 lines of Python for the core solver; 2 weeks to integrate and tune. |
| What NOT to copy? | The LYFT_THROTTLE iterative outer loop — start with a single CP-SAT solve; only add iterative refinement if needed. |
| Risk? | Low. Solver runs offline; supervisors review generated shifts before publishing. |

---

## Concrete Extracts (File Paths and Line Ranges)

All paths relative to `research/staffjoy-autoscheduler/`:

| What | File | Lines |
|---|---|---|
| Module constants (timeouts, thresholds) | `StaffJoy.jl` | 39–71 |
| Week Model: decision variables + full constraints | `StaffJoy/week.jl` | 444–605 |
| Week Model: `build_week()` — shift count derivation | `StaffJoy/week.jl` | 256–350 |
| Week Model: outer scheduling loop `schedule_week()` | `StaffJoy/week.jl` | 161–253 |
| Day Model: full JuMP formulation | `StaffJoy/day.jl` | 24–230 |
| Day Model: pre/post validation | `StaffJoy/day.jl` | 232–318 |
| Serial scheduling: balanced algorithm | `StaffJoy/serial_schedulers.jl` | 36–136 |
| Serial scheduling: greedy algorithm | `StaffJoy/serial_schedulers.jl` | 144–266 |
| Serial scheduling: `schedule_by_day()` dispatcher | `StaffJoy/serial_schedulers.jl` | 1–33 |
| Intershift propagation | `StaffJoy/serial_schedulers.jl` | 98–131 |
| `get_day_bounds()` — balanced lookahead | `StaffJoy/helpers.jl` | 63–92 |
| `anneal_availability()` | `StaffJoy/helpers.jl` | 23–61 |
| Windowing preprocessing | `StaffJoy/windowing.jl` | 1–69 |
| Unassigned shift generation | `StaffJoy/unassigned.jl` | 64–98 |
| Bifurcation (large problem split) | `StaffJoy/bifurcate.jl` | 1–41 |
| Org options parameter mapping | `Manager/calculation.jl` | 22–63 |
| Org options documentation | `README.md` | 81–99 |

GitHub URLs (master branch at time of research):
- `https://github.com/Staffjoy/autoscheduler/blob/master/StaffJoy/week.jl`
- `https://github.com/Staffjoy/autoscheduler/blob/master/StaffJoy/day.jl`
- `https://github.com/Staffjoy/autoscheduler/blob/master/StaffJoy/serial_schedulers.jl`
- `https://github.com/Staffjoy/autoscheduler/blob/master/StaffJoy/helpers.jl`
- `https://github.com/Staffjoy/autoscheduler/blob/master/Manager/calculation.jl`

---

## Open Questions for Synthesis

1. **CP-SAT vs. MIP for the Week Model:** OR-Tools CP-SAT works well for boolean assignment problems. The Week Model's `lift` variable is continuous — CP-SAT handles this via `NewIntVar` with scaling (multiply by 1000, work in milliunits). Is the added complexity worth it, or should we just use a pure binary feasibility check (lift ≥ 1.0) and skip the maximisation?

2. **Intershift cross-midnight:** Staffjoy assumes `intershift < day_length`. For 24/7 security sites with night shifts, a guard ending at 06:00 needs rest until 16:00 — which crosses midnight into the next "day" in the coverage array. How do we handle this in our coverage model (which is currently 24-hour slices)?

3. **24/7 sites with shift turnover:** Staffjoy assumes "businesses are not open 24/7 or if they are that all shifts turn over at one particular time." Arrow Security sites may be genuinely 24/7. Does the windowing optimisation break for these, and should we disable it?

4. **Timefold vs. OR-Tools:** The constraint formulation above maps to both. Timefold uses a constraint-satisfaction / local-search approach (no MIP); OR-Tools CP-SAT uses branch-and-bound. For our scale (50–200 guards, 7 days, 24 hours), both should solve in seconds. Which has better Python/TypeScript integration for our Fastify microservice pattern?

5. **Skill matching as a pre-filter vs. constraint:** Should skill matching be a hard constraint inside the solver (adds binary variables per skill × guard × day) or a pre-filter that reduces the guard pool before running the solver (simpler, faster)? Staffjoy used pre-filtering (role scoping). We should probably do the same.

6. **Consecutive days off for Indian labour law:** The OSHWC Code requires 1 day off per 7 days — but does it need to be the same day each week (fixed weekly off)? If so, this is a persistent per-guard preference, not just a within-week constraint. Does this change the Week Model?

7. **Week-over-week state:** Staffjoy's `worked_day_preceding_week` field passes last week's final day into the next week's Week Model. We need to persist this in our database. Should it be computed from the `shifts` table on demand, or stored in `guard_constraints`?
