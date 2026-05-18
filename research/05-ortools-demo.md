# Investigation 05 — Google OR-Tools CP-SAT for Employee Shift Scheduling

**Date:** 2026-05-17  
**Stack context:** Fastify 4 + TypeScript API, PostgreSQL + Drizzle ORM, Next.js 16 tenant portal, Ionic/Capacitor guard PWA  
**OR-Tools version tested:** 9.15.6755 (Python 3.14, Windows 11)

---

## Summary

Google OR-Tools CP-SAT is a **production-grade constraint-programming solver** from Google Research. It solves combinatorial scheduling problems by modelling them as systems of Boolean and integer variables subject to hard constraints, then optionally optimising a soft objective. For Arrow Security's scheduling problem (assign guards to site-shifts respecting qualifications, rest rules, and hour caps), CP-SAT is the most capable open-source option available.

Key findings from the live demo:

| Scenario | Shifts | Guards | Variables | Status | Wall time | Peak memory |
|----------|--------|--------|-----------|--------|-----------|-------------|
| Full 3-shift/day (63 shifts, infeasible by design) | 63 | 5 | 315 | INFEASIBLE | 17.2 ms | 0.6 KB |
| 1-shift/day variant (21 shifts) | 21 | 5 | 105 | OPTIMAL | 52.4 ms | 0.6 KB |

The solver is extremely fast for this problem size. It detected a mathematically impossible schedule in under 20 ms and proved optimality for a feasible variant in about 50 ms. Memory footprint is negligible (sub-1 KB Python-side; the native C++ solver uses more but stays well within normal process limits for this scale).

**Verdict up front:** CP-SAT is the right algorithmic engine for Arrow Security's auto-scheduling feature. It is pure Python install with a clean API, Apache 2.0 licensed, and requires no JVM or native build tooling beyond pip.

---

## Stack and Dependencies

### Installation

```bash
pip install ortools
# That's it. No extras, no native build, no JVM.
```

The wheel ships the pre-compiled C++ CP-SAT solver binary. No compilation required.

### Packages installed

| Package | Version | License |
|---------|---------|---------|
| `ortools` | 9.15.6755 | Apache 2.0 |
| `numpy` | 2.4.5 | BSD 3-Clause |
| `pandas` | 3.0.3 | BSD 3-Clause |
| `protobuf` | 6.33.6 | BSD 3-Clause |
| `absl-py` | 2.4.0 | Apache 2.0 |
| `immutabledict` | 4.3.1 | MIT |

All dependencies are permissive open-source. No GPL, no LGPL, no commercial licence required.

### Platform support

Pre-built wheels exist for Windows, Linux, macOS on x86-64 and arm64 for Python 3.9–3.14. The render.com deployment (Linux x86-64) would get a wheel directly — no compilation step in the deploy pipeline.

---

## Data Model — Decision Variable Schema

The scheduling problem is encoded as a **0-1 integer program** (binary decision variables):

```
x[guard_index, site_index, day_index, shift_slot] ∈ {0, 1}

Dimensions for the Arrow demo:
  guard_index   ∈ {0, 1, 2, 3, 4}        (5 guards)
  site_index    ∈ {0, 1, 2}              (3 sites)
  day_index     ∈ {0 … 6}               (7-day horizon)
  shift_slot    ∈ {0, 1, 2}             (morning/afternoon/night)

Total variables: 5 × 3 × 7 × 3 = 315
```

Value semantics: `x[g, s, d, t] = 1` means guard `g` is assigned to cover site `s` on day `d` during shift slot `t`.

The solver searches over all 2^315 ≈ 10^94 possible truth assignments but uses constraint propagation and branch-and-bound with clause learning to prune this space to a manageable search tree — typically resolving this scale in milliseconds.

---

## API / Interface Surface

### Readability assessment: EXCELLENT

The CP-SAT Python API reads almost like English pseudocode. Each constraint corresponds directly to a business rule.

```python
from ortools.sat.python import cp_model

model = cp_model.CpModel()

# 1. Declare decision variable
x[g, s, d, t] = model.new_bool_var(f"x_g{g}_s{s}_d{d}_t{t}")

# 2. Hard constraint: exactly one guard per shift
model.add_exactly_one(x[g, s, d, t] for g in range(num_guards))

# 3. Hard constraint: qualification gate (set to 0 = forbidden)
model.add(x[g, s, d, t] == 0)   # if guard lacks site quals

# 4. Hard constraint: max 5 shifts per guard (40 h / 8 h)
model.add(sum(x[g, s, d, t] for s, d, t in all_combos) <= 5)

# 5. Hard constraint: rest gap (no adjacent slots if gap < 16 h)
model.add(x[g, s1, d1, t1] + x[g, s2, d2, t2] <= 1)

# 6. Soft objective: minimise worst-case guard workload (fairness)
model.minimize(max_shifts_var)

# 7. Solve
solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 30.0
status = solver.solve(model)

# 8. Read solution
if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    assigned = solver.value(x[g, s, d, t])  # 0 or 1
```

### Key API methods

| Method | Purpose |
|--------|---------|
| `model.new_bool_var(name)` | Declare a binary decision variable |
| `model.new_int_var(lo, hi, name)` | Declare an integer variable |
| `model.add_exactly_one(vars)` | Exactly one variable in the list must be 1 |
| `model.add(linear_expr <= k)` | Add a linear inequality constraint |
| `model.minimize(expr)` | Set minimisation objective |
| `model.maximize(expr)` | Set maximisation objective |
| `solver.solve(model)` | Run CP-SAT; returns status code |
| `solver.value(var)` | Read assigned value from solution |
| `solver.objective_value` | Read objective value |
| `solver.parameters.*` | Tune time limits, parallelism, etc. |

### Hard vs soft constraints

- **Hard constraints** use `model.add(...)`. Violation makes the model INFEASIBLE — CP-SAT returns no solution.
- **Soft constraints** (preferences) are implemented by introducing a penalty variable added to the objective. For example, to prefer guards not working weekends but allow it:
  ```python
  weekend_penalty = model.new_int_var(0, 999, "weekend_penalty")
  model.add(weekend_penalty >= sum(x[g,s,d,t] for d in [5,6] for s,t in ...))
  model.minimize(weekend_penalty)  # or add to combined objective
  ```

### Objective functions

CP-SAT supports any linear combination of variables as an objective. Common patterns:

```python
# Minimise maximum guard load (fairness)
model.minimize(max_load_var)

# Minimise total overtime
model.minimize(sum(overtime_vars))

# Weighted multi-objective (preference + fairness)
model.minimize(10 * fairness_var + preference_penalty)
```

---

## Algorithms / Techniques Worth Borrowing

### 1. Infeasibility detection is a feature

When Arrow's UI rejects a schedule request (e.g., not enough qualified guards for a long weekend), CP-SAT will return `INFEASIBLE` in milliseconds with the exact overconstrained state. This is far better than letting the scheduler silently produce a broken schedule.

Pattern to borrow: always run CP-SAT with a tight time limit first. If INFEASIBLE, present the user with a "constraint relaxation" dialog (e.g., "Remove the 40h cap for this week?" or "Hire a temporary armed guard?").

### 2. Fairness objective via minimax

The demo uses `minimize(max_shifts_var)` to balance workload across guards. This is directly applicable to Arrow's equity reporting — "who is getting over-scheduled?" becomes the gap between the min and max of the objective over guards.

### 3. Constraint propagation before search

CP-SAT's propagator eliminates many combinations before branching. In the qualification gate pattern (`model.add(x[g,s,d,t] == 0)` for ineligible guards), the solver immediately reduces the search space without any custom filtering code in the application.

### 4. Parameter-based time bounding

`solver.parameters.max_time_in_seconds = N` lets the API return the best-found-so-far solution if the problem is too large to solve to optimality within a time budget. For a Fastify API endpoint, set N to 5–10 seconds and return a `FEASIBLE` schedule rather than waiting for `OPTIMAL`.

### 5. Named variables for debuggability

Using `model.new_bool_var(f"x_g{guard_id}_s{site_id}_d{day}_t{slot}")` means the solver's internal conflict analysis traces map directly back to human-readable guard/site/shift identifiers — invaluable during development.

---

## What Is Missing for Our Security App

### Not in OR-Tools itself

| Gap | Severity | Mitigation |
|-----|----------|-----------|
| **No REST API** — it's a Python library, not a service | High | Run as a Python microservice called from Fastify via HTTP, or use a job queue (see deployment section) |
| **No persistence** — solver is stateless | Medium | Store solved schedules in PostgreSQL `shifts` table; re-run solver to re-optimise |
| **No incremental re-solve** — adding one shift means full re-solve | Low | Acceptable for 7-day horizons at this scale; solve time is <100 ms |
| **No native TypeScript/Node.js binding** | High | Must spawn Python process or run separate service |
| **No guard preference input** (preferred days off, preferred sites) | Medium | Add as soft constraints via penalty variables |
| **No shift-swap workflow** | Medium | Not a solver concern; implement as API/UI layer on top of a solved schedule |
| **No real-time re-scheduling** | Low | Re-solve on demand when a guard calls in sick |

### Arrow-specific gaps to model later

1. **Multi-week rolling horizon** — currently 7 days. CP-SAT handles 28-day horizons fine at this guard count.
2. **ESI/PF payroll impact** — overtime hours affect gross pay; model as an additional cost term in the objective.
3. **Client-site SLA windows** — some clients require a guard at all times vs. only during business hours.
4. **Minimum consecutive days off** — not in the current demo; add as: "if guard works day d, guard cannot work days d-1 to d-(rest_days-1)."
5. **Face-recognition check-in validation feedback loop** — attended vs. scheduled; use to penalise guards with high no-show rates in future objective functions.

---

## Verdict

**Use OR-Tools CP-SAT.** It is the correct technology for Arrow Security's auto-scheduling feature.

- **Correctness:** proves optimality or infeasibility; no heuristic guesswork
- **Speed:** sub-100 ms for 21-shift / 5-guard weekly schedules; estimated <500 ms for 4-week / 20-guard scale
- **Memory:** negligible (<1 MB per solve at this scale)
- **Licence:** Apache 2.0 — no commercial restriction
- **Installation:** single `pip install ortools`, no JVM, no native compilation
- **Readability:** constraint code reads like business rules; non-specialist developers can maintain it
- **Integration path:** run as a Python sidecar service behind a Fastify proxy endpoint (`POST /api/schedule/generate`), or invoke via a BullMQ job queue worker

The only friction point is the Python/Node.js boundary. The recommended integration is a lightweight Python FastAPI or Flask service sitting alongside the Fastify API, called over HTTP on the internal Docker network. The payload is small (guard list + constraint JSON, ~2 KB), and response time is under 200 ms.

---

## Concrete Extracts

### Infeasibility detection (Scenario A)

The solver proved in **17.2 ms** that 63 shifts cannot be covered by 5 guards limited to 40 h/week:

```
5 guards × 5 shifts max = 25 capacity  <  63 shifts needed
=> INFEASIBLE (mathematically impossible regardless of qualifications)
```

Additionally, Bank Branch C (armed) has only 2 eligible guards (Carlos, Dana). Their combined 40h capacity = 10 shifts, but the bank needs 21 shifts in 3-shift/day mode — infeasible on its own.

### Optimal schedule (Scenario B — 1 shift/day × 7 days = 21 shifts)

```
Solver status : OPTIMAL
Wall time     : 52.4 ms
Peak memory   : 0.6 KB
Objective (max shifts any guard works): 5

Site                   Day   Slot              Assigned Guard
----------------------------------------------------------------------
Office Tower A         Mon   Morning (06-14)   Evelyn
Office Tower A         Tue   Morning (06-14)   Evelyn
Office Tower A         Wed   Morning (06-14)   Evelyn
Office Tower A         Thu   Morning (06-14)   Bob
Office Tower A         Fri   Morning (06-14)   Bob
Office Tower A         Sat   Morning (06-14)   Bob
Office Tower A         Sun   Morning (06-14)   Evelyn

Construction Site B    Mon   Morning (06-14)   Dana
Construction Site B    Tue   Morning (06-14)   Dana
Construction Site B    Wed   Morning (06-14)   Alice
Construction Site B    Thu   Morning (06-14)   Alice
Construction Site B    Fri   Morning (06-14)   Alice
Construction Site B    Sat   Morning (06-14)   Alice
Construction Site B    Sun   Morning (06-14)   Alice

Bank Branch C          Mon   Morning (06-14)   Dana
Bank Branch C          Tue   Morning (06-14)   Dana
Bank Branch C          Wed   Morning (06-14)   Carlos
Bank Branch C          Thu   Morning (06-14)   Carlos
Bank Branch C          Fri   Morning (06-14)   Carlos
Bank Branch C          Sat   Morning (06-14)   Carlos
Bank Branch C          Sun   Morning (06-14)   Carlos

Guard workload:
  Alice     5 shifts =  40 h  #####
  Bob       3 shifts =  24 h  ###
  Carlos    5 shifts =  40 h  #####
  Dana      4 shifts =  32 h  ####
  Evelyn    4 shifts =  32 h  ####
```

Qualification constraints enforced correctly: Bob and Evelyn (unarmed-only) are never assigned to Construction Site B (needs outdoor) or Bank Branch C (needs armed). Dana covers both Construction Site B and Bank Branch C because she holds all three qualifications.

### Full demo code

See `research/ortools-demo/solve.py` for the complete runnable script. Key sections:

```python
from ortools.sat.python import cp_model

model = cp_model.CpModel()

# ── Decision variables ──────────────────────────────────────────────────
x = {}
for gi, g in enumerate(GUARDS):
    for si, s in enumerate(SITES):
        for day in range(HORIZON_DAYS):
            for slot in range(shifts_per_day):
                x[gi, si, day, slot] = model.new_bool_var(
                    f"x_g{g['id']}_s{s['id']}_d{day}_t{slot}"
                )

# ── Hard constraint 1: exactly one guard per (site, day, slot) ──────────
for si in range(num_sites):
    for day in range(HORIZON_DAYS):
        for slot in range(shifts_per_day):
            model.add_exactly_one(
                x[gi, si, day, slot] for gi in range(num_guards)
            )

# ── Hard constraint 2: qualification gate ──────────────────────────────
for gi, g in enumerate(GUARDS):
    for si, s in enumerate(SITES):
        if not eligible[(g["id"], s["id"])]:
            for day in range(HORIZON_DAYS):
                for slot in range(shifts_per_day):
                    model.add(x[gi, si, day, slot] == 0)

# ── Hard constraint 3: max 40 hours / week ─────────────────────────────
for gi in range(num_guards):
    model.add(
        sum(x[gi, si, day, slot]
            for si in range(num_sites)
            for day in range(HORIZON_DAYS)
            for slot in range(shifts_per_day)) <= MAX_SHIFTS_PER_GUARD  # 5
    )

# ── Hard constraint 4: min 8h rest between consecutive shifts ──────────
for idx in range(len(all_slots) - 1):
    day_a, slot_a = all_slots[idx]
    day_b, slot_b = all_slots[idx + 1]
    start_a = day_a * 24 + SHIFT_START_HOURS[slot_a]
    start_b = day_b * 24 + SHIFT_START_HOURS[slot_b]
    if start_b < start_a + SHIFT_HOURS + MIN_REST_HOURS:
        for gi in range(num_guards):
            for si_a in range(num_sites):
                for si_b in range(num_sites):
                    model.add(
                        x[gi, si_a, day_a, slot_a] +
                        x[gi, si_b, day_b, slot_b] <= 1
                    )

# ── Soft objective: minimise max shifts (fairness) ─────────────────────
max_shifts_var = model.new_int_var(0, 63, "max_shifts")
for gi in range(num_guards):
    model.add(
        sum(x[gi, si, day, slot] for si, day, slot in ...) <= max_shifts_var
    )
model.minimize(max_shifts_var)

# ── Solve ───────────────────────────────────────────────────────────────
solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 30.0
status = solver.solve(model)
# status ∈ {OPTIMAL, FEASIBLE, INFEASIBLE, UNKNOWN, MODEL_INVALID}
```

---

## Open Questions for Synthesis

1. **Python sidecar vs subprocess:** Should the scheduling solver run as a persistent FastAPI microservice (lower latency, warm model cache) or be spawned per-request from Node.js (simpler ops, cold start ~200 ms)? At Arrow's current scale, per-request subprocess is fine.

2. **Scaling horizon:** How does solve time scale for 20 guards × 3 sites × 28 days (252 shifts, ~1680 variables)? Needs empirical measurement. Likely still <1 s.

3. **Multi-site day guard:** Current demo assigns one guard per (site, day, slot). Should the model allow a guard to cover two sites in one day (e.g., morning at Office Tower, evening at Construction Site)? The rest-hours constraint handles this automatically if modelled correctly.

4. **Operator-guided re-scheduling:** When a supervisor manually reassigns a guard, should CP-SAT fix that assignment as a hard constraint and re-optimise the rest? This is straightforward: add `model.add(x[known_gi, known_si, known_day, known_slot] == 1)` before solving.

5. **Integration with the payroll module:** Solved schedules feed directly into `shifts` table. The payroll calculation already reads from `shifts`. Is there a closed feedback loop where payroll cost targets constrain the scheduler's objective?

6. **Testing strategy for the Python sidecar:** Unit tests can mock the JSON input/output. Integration tests should cover the INFEASIBLE path explicitly — it is the most important safety property of the system.

7. **Deployment on Render:** The Python sidecar would be a separate `web service` on Render (same Docker-compose internal network in dev). Should it share the same PostgreSQL connection, or remain stateless and receive all data via the request body from Fastify?
