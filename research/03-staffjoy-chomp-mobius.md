# Investigation 3 — Staffjoy Chomp + Mobius Decomposition

**Repos cloned:**
- `research/staffjoy-chomp/` — https://github.com/Staffjoy/chomp-decomposition
- `research/staffjoy-mobius/` — https://github.com/Staffjoy/mobius-assignment

**Context:** Staffjoy replaced their monolithic Julia autoscheduler (Investigation 2) with two Python microservices — Chomp and Mobius — deployed to production in June 2016. Both ran in production until Staffjoy shut down in March 2017 with zero production errors reported.

---

## Summary

The Staffjoy autoscheduler (Julia) solved one combined problem: "given a demand forecast and a pool of workers, produce a complete schedule with named workers assigned to concrete shifts." It fused shift *geometry* (when and how long) with worker *assignment* (who gets each shift) into a single ILP run.

The decomposition split this into two sequential microservices:

| Service | Responsibility | Core technique |
|---------|---------------|----------------|
| **Chomp** | Demand → unassigned shifts | Branch-and-bound packing algorithm |
| **Mobius** | Unassigned shifts + workers → assignments | Integer Linear Programming (Gurobi) |

The two services never communicate directly. Chomp writes named shift records (with `user_id = 0`, i.e. unassigned) into the Staffjoy API. Mobius later claims a separate task from the same API, reads those unassigned shifts, and patches each one with a real `user_id`. The shared database (Staffjoy's REST API) is the only communication channel.

---

## Stack & Dependencies

### Chomp
- **Language:** Python 2.7
- **License:** MIT
- **Key dependencies:**
  - `python-memcached` — subproblem result caching via Memcache (localhost)
  - `pytz`, `iso8601` — timezone-aware datetime conversion
  - `staffjoy==0.24` — internal API client (polls task queue, creates shifts)
  - No ILP solver — pure combinatorial search
- **Infrastructure:** Single Docker container; Memcache on localhost (explicitly noted as "may centralize in future")
- **Timeout:** 10 minutes per window (`CALCULATION_TIMEOUT`)
- **Bifurcation threshold:** Demand sum > 100 triggers recursive problem splitting

### Mobius
- **Language:** Python 2.7
- **License:** MIT (implied — same org, same template)
- **Key dependencies:**
  - `gurobipy` — **closed-source** commercial ILP solver (Gurobi). This is the critical dependency.
  - `pytz`, `iso8601`, `numpy`
  - `staffjoy==0.24`
- **Infrastructure:** Docker on AWS Elastic Beanstalk; Gurobi license server (`Dantzig` — named after the simplex method inventor)
- **Threads:** 16 (Gurobi parallelism, limited by license server capacity)
- **Timeouts:**
  - Happiness scoring phase: 20 minutes
  - No timeout on the bare feasibility phase (must find *some* solution)
- **Kill-on-error:** Both services kill their container on failure to force a clean restart, preventing a stale Gurobi connection from hanging the process

---

## Data Model

### Chomp inputs (from Staffjoy API)
```
schedule.demand       — dict of day → [int × 24]   # staffing level needed each hour
schedule.start        — ISO datetime (week start)
schedule.min_shift_length_hour  — int (e.g. 4)
schedule.max_shift_length_hour  — int (e.g. 8)
org.day_week_starts   — "monday" | "sunday" etc.
location.timezone     — IANA tz string
```

### Chomp output (written to API)
```
shifts[]  — list of {start: ISO datetime, stop: ISO datetime}
            all created with user_id = 0 (unassigned sentinel)
```

### Chomp internal representation
```python
# Splitter: weekly demand decomposed into windows (contiguous non-zero blocks)
week_demand = [[int] × 24] × 7   # list of lists, unitless hours
flat_demand = [int × 168]         # flattened

# Decompose: single window
demand    = [int]       # e.g. [0,0,0,5,5,7,8,6,6,7,...,0,0]
_shifts   = [{"start": int, "length": int}]  # unitless offsets
```

### Mobius inputs (from Staffjoy API)
```
schedule.{start, stop, ...}
role.{min_hours_per_workday, max_hours_per_workday,
      min_hours_between_shifts, max_consecutive_workdays}
workers[]  — list of users in this role (availability, preferences,
             min/max hours per week, existing fixed shifts, time-off requests)
shifts[]   — unassigned shifts from Chomp (user_id == 0)
```

### Mobius output (patched back to API)
```
shift.user_id = <real user id>    # PATCH for each assigned shift
# Shifts that cannot be assigned remain user_id = 0
```

### Employee model (Mobius)
```python
Employee:
  user_id
  min_hours_per_workweek, max_hours_per_workweek
  availability     # {day: [0|1] × 24}  — when they can legally work
  preferences      # {day: [0|1] × 24}  — when they want to work
  existing_shifts  # fixed shifts already assigned (reduces min/max budget)
  preceding_day_worked        # bool — affects consecutive-days-off constraint
  preceding_days_worked_streak # int — for max_consecutive_workdays check
  alpha, beta      # derived happiness weight parameters
```

### Environment model (Mobius)
```python
Environment:
  organization_id, location_id, role_id, schedule_id
  tz                       # pytz timezone
  start, stop              # week boundaries (local tz)
  day_week_starts          # "monday" | ...
  min_minutes_per_workday
  max_minutes_per_workday
  min_minutes_between_shifts
  max_consecutive_workdays
```

---

## API / Interface Surface

### Communication architecture

Neither service exposes an HTTP endpoint. Both use a **polling task queue** backed by the Staffjoy REST API:

```
# Chomp
GET  /api/v2/chomp_tasks/claim  →  {organization_id, location_id, role_id, schedule_id}
DELETE /api/v2/chomp_tasks/:id  (on completion)
POST   /api/v2/orgs/:oid/locs/:lid/roles/:rid/shifts  (creates unassigned shifts)

# Mobius
GET  /api/v2/mobius_tasks/claim  →  same shape
DELETE /api/v2/mobius_tasks/:id
PATCH  /api/v2/orgs/.../shifts/:sid  { user_id: <int> }
```

The pipeline is orchestrated by the main Staffjoy Suite API:
1. Scheduler manager creates a `chomp_task` for a schedule
2. Chomp polls, claims it, creates unassigned shifts, deletes the task
3. Suite API then creates a `mobius_task` for the same schedule
4. Mobius polls, claims it, assigns workers, deletes the task

There is no direct RPC between Chomp and Mobius. If Chomp fails, Mobius never receives a task (the Suite orchestrates this). If Mobius fails, shifts remain in the unassigned (`user_id=0`) state.

### Error recovery
Both services call `schedule.patch(state="chomp-queue" | "mobius-queue")` on failure before rebooting the container. This re-enqueues the schedule so the task will be retried.

---

## Algorithms / Techniques Worth Borrowing

### Chomp: branch-and-bound packing

```
Inputs:  demand[t], min_length, max_length
Output:  shifts[] = [{start, length}]
Goal:    minimize sum(shift.length) s.t. coverage[t] >= demand[t] for all t
```

**Key steps:**

1. **Window preprocessing (`Splitter`):** Flatten 7 × 24 demand to a 168-vector. Find contiguous non-zero blocks ("windows"). For 24/7 demand, split day-by-day. Each window is solved independently.

2. **Demand preprocessing (`Decompose._process_demand`):** Strip leading/trailing zeros. Apply edge smoothing: within `min_length` slots of an edge, smooth demand to the peak so shifts aren't stranded at the boundary.

3. **Bifurcation (recursive subproblem splitting):** If `sum(demand) > 100`, split demand in half (ceil + floor), solve each recursively, concatenate results. This prevents exponential growth on large problems and enables Memcache reuse.

4. **Heuristic warm start:** Before tree search, generate a feasible starting solution using a greedy left-to-right fill (minimum-length shifts). This gives the branch-and-bound a known upper bound immediately.

5. **Branch-and-bound DFS:** LIFO stack. At each node, find the first unsatisfied time slot, branch on shift start = that slot, enumerate lengths from max to min (prefer long shifts). Prune when `best_possible_coverage >= best_known_coverage`.

6. **Annealing:** After a feasible solution is found, scan for overages: if a shift starts or ends at an over-covered slot, shorten it by 1 unit. Iterate until no improvement.

7. **Memcache:** Key = SHA256(demand + min_length + max_length). Subproblems with identical shapes (e.g. same demand pattern on repeated weekdays) hit cache across the same processing run. Cache is NOT shared across deploys.

**Efficiency metric:** `(total_shift_hours / total_demand_hours) - 1`. 0 = perfect. Functional tests assert < 80% overage.

---

### Mobius: Integer Linear Programming (Gurobi)

```
Decision variables:
  assignments[employee_id, shift_id]  ∈ {0, 1}
  unassigned[shift_id]                ∈ {0, 1}
  min_week_hours_violation[employee_id] ∈ {0, 1}

Objective: maximize Σ happiness(e, s) × assignments[e,s]
                    - UNASSIGNED_PENALTY × unassigned[s]        # -1000
                    - MIN_HOURS_VIOLATION_PENALTY × violation[e] # -1000
```

**Constraints:**
1. Each shift is assigned to exactly one worker or flagged unassigned: `Σ_e assignments[e,s] + unassigned[s] = 1`
2. No worker works two overlapping shifts (including `min_minutes_between_shifts` buffer)
3. Each worker's total weekly minutes is within `[min, max]_hours_per_workweek` (violation = -1000 penalty, not hard infeasibility)
4. Each worker's daily minutes ≤ `max_minutes_per_workday`
5. Workers only get shifts they're available for (availability[day][hour] == 1)
6. **Optional:** At least one pair of consecutive days off per week (tried first; retried without this constraint if infeasible)

**Happiness scoring (alpha/beta):**

Each employee has `availability` (binary 7×24 matrix of legal work hours) and `preferences` (subset of availability, hours they actually want). The happiness score for a shift hour is:
- `1 + alpha` if preferred
- `1 - beta` if available-but-not-preferred

Where `alpha = (sum(availability) - sum(preferences)) / sum(availability)` and `beta` derived so total happiness = total availability. Workers who mark all or no hours as preferred get alpha=beta=0 (flat scoring).

**Three-attempt fallback:**
1. Consecutive days off + happiness scoring (20-min timeout)
2. Consecutive days off, no happiness (no timeout)
3. No consecutive days off, no happiness (must succeed or container crashes)

**Gurobi tuning:** A `.prm` tuning file is pre-generated offline using `tuner.py` with representative data. On startup, Mobius loads this file to use pre-tuned solver parameters, reducing solve time in production.

---

## What's Missing for Our Security App

### Structural gaps

1. **No role/skill matching.** The original Staffjoy model assumed workers in a "role" are interchangeable. Guards have certifications, site-specific clearances, and required training. Mobius's availability matrix would need a pre-filtering step to zero out hours where a guard lacks clearance for the specific site.

2. **Fixed post coverage, not fluid demand.** Staffjoy worked from "we need 5 couriers at 2pm" demand forecasts. Security has *contractual post requirements*: "this post must be covered 24/7 with at least 1 guard." The Chomp approach (forecast → shifts) is not directly applicable. The post coverage requirement is static, not probabilistic.

3. **No minimum-rest compliance (labor law).** The `min_minutes_between_shifts` constraint exists in Mobius, but Indian labor law and contract norms add complexity: weekly off-day requirements, overtime rules, ESI/PF implications. Staffjoy used simple consecutive-days-off heuristics.

4. **Gurobi is closed-source and expensive.** Mobius is unusable without a Gurobi license (~$10K/year academic, higher commercial). For our stack, we'd need to replace Gurobi with an open alternative (OR-Tools, HiGHS, GLPK, or PuLP + CBC).

5. **No supervisor-to-guard ratio constraint.** Security operations typically require one supervisor per N guards per site per shift. This is a new constraint class not present in Staffjoy.

6. **No inter-site constraints.** A guard cannot be at two sites simultaneously (obvious), but shift-handover overlap is also forbidden. Mobius handles this via `min_minutes_between_shifts` but only within a single role, not across sites.

7. **No demand forecasting.** Chomp consumes a demand vector that Staffjoy's human operators entered manually. Our app needs either (a) human managers to input coverage requirements, or (b) a future demand-forecasting layer. Either way, Chomp's packing algorithm only activates after that input exists.

8. **Polling is not event-driven.** Both services poll the API every 5–20 seconds. For our monolith Fastify API, a simple synchronous route call or job queue (BullMQ with Redis) would be cleaner than polling.

---

## Verdict

### Do we adopt the two-phase pattern?

**Arguments for (create shifts then assign guards):**

- **Clean separation of concerns.** Generating the right shift geometry (how many shifts, what hours) is a packing problem. Assigning guards to those slots is a constraint satisfaction / optimization problem. They have genuinely different inputs, different algorithms, and different failure modes. Keeping them separate means you can re-run assignment without re-running geometry (e.g., if a guard calls in sick).
- **Human review point.** Managers can see generated shifts before assignment runs. This is a real UX benefit for security ops: a supervisor can review and adjust shift coverage before guards are notified.
- **Independent retryability.** If assignment fails for one role/site, geometry for other sites is unaffected. In a monolith this is harder to isolate.
- **Incremental automation.** You can ship Phase 1 (auto-generate shift slots) without Phase 2 (auto-assign), letting managers manually drag guards onto generated shifts at first. This is a lower-risk MVP path.

**Arguments against:**

- **Complexity overhead.** Two services, two task queues, two failure modes, two sets of tests. For a small operation with 20–50 guards, a single synchronous autoscheduler that a manager triggers via a button press is easier to build and maintain.
- **Gurobi dependency.** Mobius only works with Gurobi. Replacing it requires non-trivial ILP modelling expertise. Chomp alone (open-source, no solver needed) is immediately usable.
- **Security app demand is deterministic.** Unlike retail (probabilistic customer arrivals), our coverage requirements are contracts: "site X needs 2 guards 24/7." The Chomp problem shrinks to: "given 24/7 requirement for N guards, generate shifts." This is nearly trivial — fixed shifts with min/max length constraints. The complexity is in *who works which shift*, not *how many shifts*.
- **Sequential dependency creates pipeline fragility.** If Chomp produces suboptimal shift geometry (e.g., too many 4-hour shifts when 8-hour shifts would cover a site better), Mobius cannot fix it — it only assigns to existing slots. Errors in Phase 1 propagate silently to Phase 2.

**Recommendation for Arrow Security:**

Adopt the *conceptual* separation but not the *microservice* separation. Implement as two sequential functions within a single Fastify background job:

1. **`generateShiftSlots(siteId, weekStart, coverageRequirements)`** — produces an array of `{start, stop}` slots using a simplified version of Chomp's logic (or simply fixed templates based on contract requirements). Store them as unassigned shifts.

2. **`assignGuardsToShifts(scheduleId)`** — runs after manager approval, assigns guards based on availability, preferences, certifications, and weekly-hour budgets. Use OR-Tools (open-source, Apache 2.0) or a simple greedy algorithm with constraint checking.

Keep them as two distinct API routes so managers can trigger them independently:
```
POST /api/schedules/:id/generate-shifts   # Phase 1: create shift slots
POST /api/schedules/:id/assign-guards     # Phase 2: assign guards to slots
```

This gives you the human-review checkpoint and the incremental rollout path without the complexity of two separate services.

Do **not** use Gurobi or a full ILP for v1. A greedy availability-weighted assignment with hard constraint checking will cover 90% of cases; escalate to OR-Tools only if guard pools are large enough (30+ guards per site per week) that greedy produces clearly suboptimal results.

---

## Concrete Extracts

### Chomp: branch-and-bound core loop (decompose.py lines 204–264)
```python
while len(stack) != 0:
    if start_time + timedelta(seconds=config.CALCULATION_TIMEOUT) < datetime.utcnow():
        break  # timeout → best known solution wins

    working_collection = stack.pop()  # LIFO = DFS

    if working_collection.is_optimal:
        self.set_shift_collection_as_optimal(working_collection)
        return

    if working_collection.demand_is_met:
        if working_collection.coverage_sum < best_known_coverage:
            best_known_solution = working_collection
            best_known_coverage = working_collection.coverage_sum
    else:
        if working_collection.best_possible_coverage < best_known_coverage:
            t = working_collection.get_first_time_demand_not_met()
            for length in reverse_inclusive_range(self.min_length, self.max_length):
                end_index = t + length
                if end_index <= len(self.demand):
                    shift = (t, length)
                    new_collection = deepcopy(working_collection)
                    new_collection.add_shift(shift)
                    if new_collection.demand_is_met:
                        new_collection.anneal()
                    if new_collection.best_possible_coverage < best_known_coverage:
                        stack.append(new_collection)
```

### Mobius: objective function construction (assign.py lines 107–129)
```python
for e in self.employees:
    for s in self.shifts:
        assignments[e.user_id, s.shift_id] = m.addVar(vtype=GRB.BINARY, ...)
        if happiness_scoring:
            obj += assignments[e.user_id, s.shift_id] * e.shift_happiness_score(s)
        unassigned[s.shift_id] = m.addVar(vtype=GRB.BINARY, ...)
        obj += unassigned[s.shift_id] * config.UNASSIGNED_PENALTY  # -1000
```

### Mobius: three-attempt fallback pattern (assign.py lines 46–77)
```python
def calculate(self):
    # Step 1: consecutive days off + happiness (most constrained, most humane)
    try:
        self._calculate(consecutive_days_off=True, happiness_scoring=True)
        return
    except: pass

    # Step 2: consecutive days off, no happiness
    try:
        self._calculate(consecutive_days_off=True, happiness_scoring=False)
        return
    except: pass

    # Step 3: bare feasibility — no throw allowed
    self._calculate(consecutive_days_off=False, happiness_scoring=False)
```

### Mobius: alpha/beta happiness weight derivation (employee.py lines 304–326)
```python
def _set_alpha_beta(self):
    sum_availability = sum(sum(v) for v in self.availability.values())
    sum_preferences  = sum(sum(v) for v in self.preferences.values())

    if sum_preferences == sum_availability or sum_preferences == 0:
        self.alpha = 0; self.beta = 0; return

    self.alpha = (sum_availability - sum_preferences) / sum_availability
    self.beta  = sum_preferences / sum_availability
```

### Autoscheduler (monolith) vs decomposition — the key difference
The Julia autoscheduler (`Manager/calculation.jl`) called `StaffJoy.schedule(workers, env)` as a single step — one call that ingested demand AND workers and returned fully-assigned shifts. There was no intermediate "unassigned shift" state. The decomposition created that intermediate state as both a review checkpoint and an architectural boundary between the two optimization problems.

---

## Open Questions for Synthesis

1. **OR-Tools vs greedy for guard assignment.** OR-Tools CP-SAT solver is MIT-licensed and capable of solving the Mobius-style ILP. But at what guard pool size does a greedy approach fail badly enough to justify the complexity? Likely the crossover is ~30+ guards competing for the same weekly slot pool.

2. **Do we need Chomp at all?** Security posts have fixed coverage requirements, not probabilistic demand. A simpler "shift template library" (per-site shift patterns that managers configure once) may replace Chomp entirely. Investigate whether Arrow's contracts have variable daily coverage requirements or are uniformly fixed.

3. **What happens when Phase 1 (shift generation) produces geometry that makes Phase 2 (assignment) infeasible?** Staffjoy never addressed this well — Mobius would just leave shifts unassigned. We need a feedback signal to managers: "assignment failed because shift X has no available guards — adjust the shift window or the guard roster."

4. **Multi-site constraint.** A guard working at Site A cannot also be scheduled at Site B if they overlap (even with travel time). Mobius only enforced within-role overlap. For guards covering multiple sites, we need a cross-site `min_minutes_between_shifts` that Staffjoy never needed.

5. **How far ahead should autoscheduling run?** Staffjoy scheduled one week at a time (Sun–Sat or Mon–Sun). Security contracts may require 2-week or 4-week cycle schedules to ensure fair rotation. This affects the size of the assignment problem and the consecutive-workdays constraint.

6. **Preference data collection.** Mobius had a full preference-submission UI (guards mark preferred hours). Our mobile app (`/tabs/shifts`) currently shows schedules but has no preference-submission feature. Before building Mobius-style happiness scoring, we need that data. Is it worth building?

7. **On-call and standby guards.** Staffjoy had no "standby" concept. Security operations often maintain a standby pool for last-minute absences. How do standby guards interact with the ILP model — are they pre-assigned to standby slots, or is standby a runtime escalation path only?
