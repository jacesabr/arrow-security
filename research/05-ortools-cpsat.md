# OR-Tools CP-SAT — Research Notes

**Date:** 2026-05-17
**Context:** Arrow Security — evaluating auto-scheduling for guard shifts across sites. Fastify 4 / Node.js API, looking at a Python microservice pattern.

---

## Problem Formulation for Guard Scheduling

### Decision Variables

The canonical formulation uses a 3-dimensional boolean variable grid:

```python
work = {}
for g in range(num_guards):
    for s in range(num_shifts):   # e.g. Day / Night / Off
        for d in range(num_days):
            work[g, s, d] = model.new_bool_var(f"work_g{g}_s{s}_d{d}")
```

For Arrow Security the fourth dimension — site — must be added, making it `work[guard, site, shift_type, day]`. A guard can only be at one site per shift, so the constraint structure expands accordingly.

### Dimension Map for Arrow Security

| Dimension    | Realistic size          | Example Arrow values     |
|--------------|-------------------------|--------------------------|
| Guards       | 20–50                   | 20 guards                |
| Sites        | 3–10                    | 5 sites                  |
| Shift types  | 2–4 (Day/Night/Off/…)   | 3 (Day 8h, Night 8h, Off)|
| Days         | 7–28                    | 7 days                   |

With 20 guards × 3 shift types × 5 sites × 7 days, the raw variable count is **2,100 boolean variables**. In practice you collapse "Off" as the absence of any site-shift assignment, reducing it further.

### One-Assignment-Per-Day Constraint

Each guard must be assigned exactly one shift type (including Off) per day:

```python
for g in all_guards:
    for d in all_days:
        model.add_exactly_one(work[g, s, d] for s in all_shifts)
```

### Site Coverage Constraint

Each site × shift combination requires a minimum number of guards. Shortfall can be modelled as a soft constraint with a penalty, or hard if non-negotiable:

```python
for site in all_sites:
    for d in all_days:
        for s in working_shifts:  # excludes Off
            # hard: must meet minimum
            model.add(
                sum(work[g, s, d] * assignment[g, site, s, d]
                    for g in all_guards) >= min_coverage[site][s]
            )
```

---

## Key Constraints Available

CP-SAT provides a rich constraint library. Below are the ones directly applicable to guard rostering.

### 1. Hard Coverage (Must-Meet Staffing Floors)

Ensures each site has at least N guards per shift. Modelled with `model.add(sum(...) >= N)`. Violations make the model infeasible — use a soft version with penalty variables if absolute coverage cannot always be guaranteed.

### 2. Exactly-One / At-Most-One Per Day

`model.add_exactly_one(...)` and `model.add_at_most_one(...)` are first-class methods — no need to write `sum() == 1` manually. More efficient internally.

### 3. Minimum Rest Between Shifts (Hard)

Indian labor law: 8-hour standard shift, overtime at double pay beyond that. A typical hard constraint is no guard may work two consecutive morning shifts after a night shift. Implemented via implication chains or transition penalty tables:

```python
# Forbid night-then-morning transition
for g in all_guards:
    for d in range(num_days - 1):
        # if guard worked NIGHT on day d, cannot work DAY on day d+1
        model.add_implication(work[g, NIGHT, d], ~work[g, DAY, d + 1])
```

For a general "minimum 11h rest" rule expressed in discrete shift slots, the implication pattern above is the idiomatic CP-SAT approach.

### 4. Soft Sequence Constraints (Consecutive Shift Limits)

The canonical `shift_scheduling_sat.py` ships an `add_soft_sequence_constraint()` helper that:
- **Hard-forbids** runs shorter than `hard_min` or longer than `hard_max` consecutive working days
- **Penalizes** runs outside the soft bounds (`soft_min`…`soft_max`) with a linear cost term

```python
# Example: guard should work 3–5 consecutive days; never < 2, never > 6
variables, coeffs = add_soft_sequence_constraint(
    model, work_vars_for_guard,
    hard_min=2, soft_min=3, soft_max=5, hard_max=6,
    prefix=f"guard{g}_seq"
)
```

### 5. Weekly Sum Constraints (Hours / Shifts Per Week)

`add_soft_sum_constraint()` bounds total assignments per week, penalising deviation from target:

```python
# Each guard should work 4–5 shifts per week
variables, coeffs = add_soft_sum_constraint(
    model, work_vars_for_guard_week,
    hard_min=3, soft_min=4, soft_max=5, hard_max=6,
    prefix=f"guard{g}_week_sum"
)
```

### 6. Fairness / Load Balancing

Minimise the gap between the busiest and least-busy guard:

```python
min_shifts = model.new_int_var(0, max_possible, "min_shifts")
max_shifts = model.new_int_var(0, max_possible, "max_shifts")
model.add_min_equality(min_shifts, [total_shifts[g] for g in all_guards])
model.add_max_equality(max_shifts, [total_shifts[g] for g in all_guards])
model.minimize(max_shifts - min_shifts)
```

Or, more commonly, add it as a soft term in the main objective with a weight.

### 7. Forbidden / Penalised Shift Transitions

Shift transition rules via a penalty table:

```python
# (previous_shift, next_shift) -> penalty (0 = forbidden)
TRANSITIONS = {
    (NIGHT, DAY):   0,    # forbidden — too short a rest
    (NIGHT, NIGHT): 1,    # allowed, small penalty (fatigue)
    (DAY,   NIGHT): 2,    # allowed, moderate penalty
    (DAY,   DAY):   0,    # fine
}
for g in all_guards:
    for d in range(num_days - 1):
        for (prev, nxt), penalty in TRANSITIONS.items():
            if penalty == 0:
                # hard forbid
                model.add_bool_or([~work[g, prev, d], ~work[g, nxt, d + 1]])
            else:
                # soft penalty
                transition_var = model.new_bool_var(f"trans_{g}_{d}_{prev}_{nxt}")
                model.add_implication(transition_var,  work[g, prev, d])
                model.add_implication(transition_var,  work[g, nxt, d + 1])
                obj_terms.append(transition_var * penalty)
```

### 8. Shift Preference / Request Fulfilment

Guards can submit shift preferences. Preferences are treated as soft terms with weights:

```python
shift_requests[g][d][s] = 1   # guard g wants shift s on day d
# In objective: maximize sum of fulfilled preferences
model.maximize(sum(
    shift_requests[g][d][s] * work[g, s, d]
    for g, d, s in all_combinations
))
```

### 9. Skill / Certification Matching

Not a native constraint type but easily encoded by pre-filtering which (guard, site) pairs are legal:

```python
eligible = {(g, site) for g in guards for site in sites
            if guard_has_clearance(g, site)}
# Only create work variables for eligible pairs; fix others to 0
for g, s_type, d in ...:
    if (g, site) not in eligible:
        model.add(work[g, site, s_type, d] == 0)
```

### Summary Table

| Constraint Type               | Hard or Soft | CP-SAT API                         |
|-------------------------------|:------------:|------------------------------------|
| Site coverage floor           | Both         | `model.add(sum >= N)` + penalty var|
| One shift per day             | Hard         | `model.add_exactly_one`            |
| No consecutive night→morning  | Hard         | `model.add_implication`            |
| Max consecutive working days  | Both         | `add_soft_sequence_constraint`     |
| Weekly shift count            | Both         | `add_soft_sum_constraint`          |
| Fairness (even load)          | Soft         | min/max equality + objective term  |
| Shift preferences             | Soft         | weighted objective term            |
| Skill / clearance matching    | Hard         | variable pre-filtering             |
| Shift transition penalties    | Both         | implication + penalty var          |

---

## Example Code Patterns

### Minimal Complete Skeleton (Arrow Security)

```python
from ortools.sat.python import cp_model

def solve_guard_schedule(guards, sites, num_days, coverage_req, shift_types):
    """
    guards:       list of guard IDs
    sites:        list of site IDs
    num_days:     int (e.g. 7)
    coverage_req: dict {(site_id, shift_type): min_guards}
    shift_types:  list e.g. ['day', 'night', 'off']
    """
    model = cp_model.CpModel()

    # --- Decision variables ---
    work = {}
    for g in guards:
        for site in sites:
            for st in shift_types:
                for d in range(num_days):
                    work[g, site, st, d] = model.new_bool_var(
                        f"w_{g}_{site}_{st}_{d}"
                    )

    # --- Each guard works exactly one (site, shift_type) per day ---
    # (including "off" as shift_type='off' at a dummy site)
    for g in guards:
        for d in range(num_days):
            model.add_exactly_one(
                work[g, site, st, d]
                for site in sites
                for st in shift_types
            )

    # --- Coverage constraints (soft, with penalty) ---
    obj_terms = []
    for (site, st), req in coverage_req.items():
        if st == 'off':
            continue
        for d in range(num_days):
            assigned = sum(work[g, site, st, d] for g in guards)
            shortage = model.new_int_var(0, len(guards), f"short_{site}_{st}_{d}")
            model.add(shortage >= req - assigned)
            obj_terms.append(shortage * 1000)   # high penalty for understaffing

    # --- No back-to-back night→day ---
    for g in guards:
        for d in range(num_days - 1):
            for site in sites:
                model.add_bool_or([
                    ~work[g, site, 'night', d],
                    ~work[g, site, 'day',   d + 1],
                ])

    # --- Fairness: minimise spread of shifts-worked per guard ---
    guard_totals = []
    for g in guards:
        total = model.new_int_var(0, num_days * len(sites), f"total_{g}")
        model.add(total == sum(
            work[g, site, st, d]
            for site in sites
            for st in shift_types if st != 'off'
            for d in range(num_days)
        ))
        guard_totals.append(total)

    max_t = model.new_int_var(0, num_days * len(sites), "max_total")
    min_t = model.new_int_var(0, num_days * len(sites), "min_total")
    model.add_max_equality(max_t, guard_totals)
    model.add_min_equality(min_t, guard_totals)
    obj_terms.append((max_t - min_t) * 10)  # moderate fairness weight

    model.minimize(sum(obj_terms))

    # --- Solve ---
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    solver.parameters.num_search_workers = 4
    status = solver.solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return extract_schedule(solver, work, guards, sites, shift_types, num_days)
    return None
```

### Extracting the Result

```python
def extract_schedule(solver, work, guards, sites, shift_types, num_days):
    schedule = []
    for g in guards:
        for d in range(num_days):
            for site in sites:
                for st in shift_types:
                    if solver.value(work[g, site, st, d]) == 1:
                        schedule.append({
                            "guardId": g,
                            "siteId":  site,
                            "day":     d,
                            "shift":   st,
                        })
    return schedule
```

---

## Microservice Architecture

### Recommended Pattern: FastAPI + OR-Tools, Docker-deployed

This is a proven pattern used in production (e.g., Volt Lines routing microservice). The Node.js Fastify API calls the Python service via HTTP POST.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Fastify API (Node.js, port 4000)                                   │
│                                                                     │
│  POST /api/payroll/:id/schedule  ──►  HTTP POST scheduler:8080      │
│         (fire-and-forget or await)        /api/solve                │
└─────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Scheduler Microservice (Python, FastAPI, port 8080)                │
│                                                                     │
│  POST /api/solve                                                    │
│    ├── Parse ScheduleRequest JSON                                   │
│    ├── Build CP-SAT model                                           │
│    ├── solver.solve() — blocks up to max_time_in_seconds            │
│    └── Return ScheduleResponse JSON                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### FastAPI Endpoint (Python)

```python
# scheduler/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from ortools.sat.python import cp_model
from typing import List, Dict

app = FastAPI()

class ScheduleRequest(BaseModel):
    guards: List[str]           # guard IDs
    sites: List[str]            # site IDs
    num_days: int               # planning horizon
    coverage: Dict[str, Dict[str, int]]  # {siteId: {shiftType: minGuards}}
    max_solve_seconds: float = 30.0

class ShiftAssignment(BaseModel):
    guardId: str
    siteId: str
    day: int
    shift: str

class ScheduleResponse(BaseModel):
    status: str                 # "OPTIMAL" | "FEASIBLE" | "INFEASIBLE"
    solve_time_seconds: float
    assignments: List[ShiftAssignment]
    objective_value: float | None

@app.post("/api/solve", response_model=ScheduleResponse)
async def solve_schedule(req: ScheduleRequest):
    import asyncio
    # CP-SAT is CPU-bound — offload to thread pool to keep FastAPI responsive
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _solve, req)
    return result

def _solve(req: ScheduleRequest) -> ScheduleResponse:
    # ... build model, solve, extract (see code patterns above) ...
    pass
```

### Node.js Caller (Fastify Route)

```typescript
// apps/api/src/routes/scheduler.ts
import { FastifyPluginAsync } from 'fastify'

const SCHEDULER_URL = process.env.SCHEDULER_URL ?? 'http://scheduler:8080'

export const schedulerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/schedule/generate', {
    preHandler: [requireAuth, requireTenantAdmin],
  }, async (request, reply) => {
    const payload = request.jwtPayload

    // Build the request body from your DB data
    const guards = await db.select().from(users)
      .where(and(eq(users.tenantId, payload.tenantId), eq(users.role, 'guard')))
    const sites  = await db.select().from(sitesTable)
      .where(eq(sitesTable.tenantId, payload.tenantId))

    const schedulerPayload = {
      guards:   guards.map(g => g.id),
      sites:    sites.map(s => s.id),
      num_days: 7,
      coverage: buildCoverageRequirements(sites),
      max_solve_seconds: 30,
    }

    const resp = await fetch(`${SCHEDULER_URL}/api/solve`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(schedulerPayload),
      signal:  AbortSignal.timeout(60_000),   // 60s hard timeout
    })

    if (!resp.ok) {
      return reply.status(502).send({ error: 'Scheduler service error' })
    }

    const result = await resp.json()

    if (result.status === 'INFEASIBLE') {
      return reply.status(422).send({ error: 'No feasible schedule found', data: result })
    }

    // Persist assignments as shifts in DB
    await persistShifts(payload.tenantId, result.assignments)
    return reply.send({ data: result })
  })
}
```

### Docker Compose Addition

```yaml
# docker-compose.yml (addition)
scheduler:
  build: ./services/scheduler
  ports:
    - "8080:8080"
  environment:
    - WORKERS=4
  restart: unless-stopped
```

```dockerfile
# services/scheduler/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
```

```
# services/scheduler/requirements.txt
ortools>=9.10
fastapi>=0.115
uvicorn[standard]>=0.30
pydantic>=2.7
```

Note: use `--workers 1` for uvicorn since OR-Tools' CP-SAT already uses internal threading (`num_search_workers`). Multiple uvicorn workers × multiple OR-Tools threads can over-subscribe CPU. If you need concurrent solve requests, put a job queue (Redis + RQ or Celery) in front.

### Async / Long-Running Pattern (Recommended for Production)

For schedules that may take 10–60 seconds:

```
POST /api/schedule/generate   →  returns { jobId: "abc123" }
GET  /api/schedule/status/:jobId  →  { status: "running" | "done", result: {...} }
```

The Fastify route pushes the job onto a queue; the Python worker picks it up and writes the result back (Redis key or DB row). The frontend polls or uses SSE. This avoids 30-second HTTP timeouts and gives the user progress visibility.

---

## Performance Characteristics

### Variable Counts

| Problem Size              | Boolean Variables | Expected Solve Time     |
|---------------------------|:-----------------:|-------------------------|
| 5 nurses, 3 shifts, 7d    | ~105              | < 0.01s (optimal)       |
| 10 guards, 3 shifts, 7d   | ~210              | < 0.1s                  |
| 20 guards, 3 shifts, 5 sites, 7d | ~2,100   | **1–15s** (feasible) / 15–60s (optimal) |
| 50 guards, 3 shifts, 10 sites, 28d | ~42,000 | minutes; set time limit |

The official Google example with 5 nurses over 7 days solves to optimality in **0.003571 seconds**.

For Arrow Security's realistic scenario (20 guards, 5 sites, 3 shift types, 7 days):
- **Feasible solution** (any valid schedule): typically **< 5 seconds**
- **Optimal solution** (minimum cost / maximum fairness): **5–30 seconds** depending on constraint tightness
- Setting `max_time_in_seconds = 30` and returning the best-found solution is the standard production approach

### Parallelism

CP-SAT runs a **portfolio of search strategies in parallel** across threads. Key parameter:

```python
solver.parameters.num_search_workers = 4  # up to num CPU cores
```

Observed scaling (community benchmarks):
- 1 → 2 workers: ~50–80% speedup
- 1 → 4 workers: ~70–90% speedup
- Beyond 7 workers: diminishing returns, sometimes counterproductive

For a 2-vCPU Docker container, `num_search_workers = 2` is a reasonable default.

### Time-Limit Strategy

CP-SAT returns the **best solution found within the time limit** — it does not fail if optimal is not proven. The return status is `FEASIBLE` (good solution, optimality not proven) vs `OPTIMAL` (proven best). For scheduling, `FEASIBLE` is almost always acceptable.

```python
solver.parameters.max_time_in_seconds = 30.0
status = solver.solve(model)
# status == FEASIBLE is fine for production use
```

### Memory

2,100 boolean variables is trivial — well under 1 MB. Even 42,000 variables (50 guards × 4 weeks) stays under 50 MB. Memory is not a concern at Arrow Security's scale.

---

## Comparison to Timefold

| Dimension               | OR-Tools CP-SAT                        | Timefold Solver                           |
|-------------------------|----------------------------------------|-------------------------------------------|
| **Language**            | Python (primary), Java, C++, Go        | Java / Kotlin only                        |
| **Node.js fit**         | Microservice via HTTP                  | Microservice via HTTP (same pattern)      |
| **Modelling style**     | Mathematical: boolean/integer variables | Object-oriented: `Employee`, `Shift` POJOs|
| **Variable count**      | One bool per (guard × site × shift × day) — can grow large | One variable per shift (who is assigned) — stays small |
| **Constraint API**      | Linear + Boolean equations; hard/soft via penalty vars | Functional Java/Kotlin code; native multi-level scoring |
| **Constraint levels**   | 2 (hard + soft in objective)           | 3+ (HardMediumSoftScore, fully composable)|
| **Ease of modelling**   | Requires translating business rules to math; steeper learning curve | Business rules expressed directly in code; lower curve |
| **Performance at scale**| Good up to a few thousand vars; slows above ~10,000 boolean vars in shift scheduling | Generally faster for large shift×employee matrices (far fewer variables) |
| **Prebuilt templates**  | None — build from scratch              | 70+ preloaded scheduling constraints, quickstart repos |
| **Community / docs**    | Excellent (Google-backed, huge community, active GitHub) | Growing (formerly OptaPlanner/Red Hat) |
| **Licensing**           | Apache 2.0 (free)                      | Apache 2.0 community; paid Enterprise     |
| **Solve time (20g/5s/7d)** | 5–30s (estimated)                  | Comparable or faster (fewer variables)    |
| **Python microservice** | Native — OR-Tools ships Python bindings | Requires JVM container (Java/Kotlin)      |

### Key Structural Difference

Timefold's critical advantage for large rosters: it models scheduling as "which guard is assigned to this shift" (2,000 variables for 2,000 shifts) rather than "is this guard×shift pair active" (200,000 booleans). For Arrow Security at 20 guards × 5 sites × 3 shifts × 7 days, the difference is modest (2,100 OR-Tools vars vs ~105 Timefold vars), but the gap widens significantly at 4-week or 50-guard scale.

OR-Tools' critical advantage for Arrow Security: **Python is the native language**, making the microservice straightforward to build and maintain. No JVM, no Java expertise required.

---

## Recommendation for Arrow Security

### Short Answer: **OR-Tools CP-SAT is the right choice for Arrow Security's current scale and stack.**

### Rationale

1. **Python microservice is a natural fit.** The team is building in TypeScript/Node.js. A Python FastAPI sidecar for scheduling is the industry-standard pattern (proven by Volt Lines and others). No JVM overhead, no new runtime, lean Docker image (~200 MB with slim Python base).

2. **Problem scale is well within CP-SAT's sweet spot.** 20 guards, 5 sites, 7-day horizon produces ~2,100 variables — trivial for CP-SAT. Optimal solutions in under 30 seconds. Even 50 guards over 28 days (~42,000 variables) is manageable with a time limit.

3. **All required constraints are natively supported.** Site coverage floors, minimum rest, shift sequence limits, fairness balancing, skill/clearance matching, shift preferences — all modelled with standard CP-SAT primitives. No workarounds needed.

4. **India labor law constraints map cleanly.** 8-hour standard shifts, no night→morning transitions (minimum rest), maximum 48h/week — these are hard `add_implication` and sum constraints that CP-SAT handles elegantly.

5. **Timefold requires Java.** Unless the team is willing to run a JVM container, Timefold is a harder operational burden. For Arrow Security's current scale, OR-Tools' Python bindings deliver equivalent results with far less infrastructure complexity.

### When to Reconsider Timefold

Revisit Timefold if Arrow Security grows to 200+ guards across many clients, or if constraint complexity grows to require Timefold's multi-level scoring (Hard/Medium/Soft tiers). At that scale, Timefold's reduced variable count will deliver meaningfully faster solve times and the prebuilt 70+ constraint library may justify the JVM overhead.

### Recommended Implementation Path

1. **Build a `services/scheduler/` Python package** alongside the existing apps.
2. **Implement a `POST /api/solve` FastAPI endpoint** accepting guards, sites, days, coverage requirements.
3. **Integrate via `POST /api/schedule/generate`** in Fastify — async job pattern with Redis queue for long solves.
4. **Start with a 7-day weekly schedule**, optimising coverage + fairness. Add shift preferences and sequence constraints incrementally.
5. **Set `max_time_in_seconds = 30`** and return `FEASIBLE` as production-ready. Show a "last optimised at" timestamp in the UI.
6. **Install**: `pip install ortools fastapi uvicorn pydantic` — no special infrastructure.

### OR-Tools Package Install

```bash
pip install ortools
# Installs CP-SAT, routing, linear solver — ~150 MB including native libs
# Python 3.9+ required; 3.11/3.12 recommended
```

The package is self-contained — no separate solver binary, no licence server, no API key.

---

## Sources

- [Employee Scheduling — OR-Tools — Google for Developers](https://developers.google.com/optimization/scheduling/employee_scheduling)
- [shift_scheduling_sat.py — google/or-tools (stable)](https://github.com/google/or-tools/blob/stable/examples/python/shift_scheduling_sat.py)
- [CP-SAT Primer — d-krupke/cpsat-primer](https://d-krupke.github.io/cpsat-primer/)
- [CP-SAT Rostering: Complete Guide — Michael Brenndoerfer](https://mbrenndoerfer.com/writing/cp-sat-rostering-constraint-programming-workforce-scheduling)
- [Google OR-Tools versus Timefold comparison — Timefold](https://timefold.ai/blog/google-or-tools-versus-timefold-comparison)
- [OR-Tools vs Timefold: Two Radically Different Approaches — edana.ch (Jan 2026)](https://edana.ch/en/2026/01/31/or-tools-vs-timefold-two-radically-different-approaches-to-optimization/)
- [Routing Engine Microservice with FastAPI + OR-Tools — Volt Lines / Medium](https://medium.com/volt-lines-blog/towards-excellency-routing-engine-microservice-with-python-fast-api-and-or-tools-b8f76ed04762)
- [A Practical Introduction to Constraint Programming using CP-SAT — pganalyze](https://pganalyze.com/blog/a-practical-introduction-to-constraint-programming-using-cp-sat)
- [Security Guard Working Hours — Stalwart Group (India labor law)](https://stalwartgroup.com/security-guard-working-hours-in-hyderabad-legal-requirements-fair-labor-practices/)
- [Security Guard Scheduling — Timefold use case](https://timefold.ai/use-case/shift-scheduling-optimization-security-guard-scheduling)
- [OR-Tools CP-SAT Parallel Threads — or-tools-discuss](https://groups.google.com/g/or-tools-discuss/c/i3TF_Szuz_k)
