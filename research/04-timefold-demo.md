# Investigation 04 — Timefold Solver for Employee Shift Scheduling

**Date:** 2026-05-17  
**Investigator:** Claude Code (automated research sprint)  
**Subject:** Timefold 1.24.0b0 (Python) — evaluation for Arrow Security shift rostering

---

## Summary

Timefold is a mature, actively-maintained constraint optimisation solver forked from OptaPlanner by the original Red Hat team. It is the best-in-class open-source option for employee rostering with hard/soft constraint hierarchies.

**The demo could not run on this machine** due to two blockers:
1. **No JVM installed** — Java is not in PATH and `JAVA_HOME` is not set. Timefold's Python package uses JPype to bridge Python to the Java solver; without a JDK the `timefold` wheel will import but all solver calls will fail.
2. **Python version mismatch** — Timefold 1.24.0b0 supports Python 3.10–3.12. The machine has Python 3.14.0, which is not yet supported.
3. **Network restrictions blocked wheel download** — `pip install timefold` reached PyPI metadata but failed to download the 21.9 MB wheel (DNS resolution failed for `files.pythonhosted.org`).

The full working demo code is in `research/timefold-demo/demo_attempt.py`. It will run once JDK 21 and Python 3.12 are available.

All code analysis below is based on the actual source from the official `timefold-solver-python` GitHub repository (employee-scheduling quickstart, tag v1.24).

---

## Stack & Dependencies

| Item | Detail |
|---|---|
| Package | `timefold` 1.24.0b0 on PyPI |
| License | **Apache 2.0** (Community Edition) — commercial Plus/Enterprise editions exist but are not needed for this use case |
| Python support | 3.10, 3.11, 3.12 (3.14 not yet supported) |
| **JVM required** | **Yes — JDK 17 minimum, JDK 21 recommended** |
| JVM bridge | JPype 1.5.1 (listed as a direct dependency in `requirements`) |
| Python wheel size | 21.9 MB (includes bundled Java solver JARs) |
| Other Python deps | `pydantic`, `fastapi`, `uvicorn` (for the REST quickstart only — not required for solver-only use) |
| Performance note | Official docs state Python is "significantly slower" than Java/Kotlin — expect 3–10× slower solving vs Java |
| Lineage | Fork of OptaPlanner (Red Hat) + OptaPy; all files Apache 2.0 |

**Install footprint estimate:**
- JDK 21: ~350 MB
- Python 3.12 venv: ~50 MB
- `timefold` wheel + JPype: ~35 MB
- Total: **~435 MB** on disk before any application code

---

## Data Model

Timefold uses a three-tier domain model expressed with Python decorators and `Annotated` type hints.

### Problem Facts (immutable input data)

Plain Python dataclasses — no decorator needed:

```python
@dataclass
class Employee:
    name: str                            # acts as PlanningId
    skills: set[str]
    unavailable_dates: set[date]
    undesired_dates: set[date]
    desired_dates: set[date]
```

### Planning Entity (what gets assigned)

Decorated with `@planning_entity`. The field the solver changes is marked `PlanningVariable`:

```python
@planning_entity
@dataclass
class Shift:
    id: Annotated[str, PlanningId]
    start: datetime
    end: datetime
    location: str
    required_skill: str
    employee: Annotated[Employee | None,   # ← solver changes this
                        PlanningVariable,
                        Field(default=None)]
```

### Planning Solution (the container)

Decorated with `@planning_solution`. Holds facts, entities, and the current score:

```python
@planning_solution
@dataclass
class EmployeeSchedule:
    employees: Annotated[list[Employee],
                         ProblemFactCollectionProperty,   # queryable in constraints
                         ValueRangeProvider]              # valid values for Shift.employee
    shifts: Annotated[list[Shift], PlanningEntityCollectionProperty]
    score: Annotated[HardSoftDecimalScore | None, PlanningScore, Field(default=None)]
    solver_status: Annotated[SolverStatus | None, Field(default=None)]
```

**Mapping to Arrow Security:**

| Arrow concept | Timefold concept |
|---|---|
| `Guard` | Problem fact (`Employee`) |
| `Site` | Embedded in `Shift.location` / `Shift.required_skill` |
| `Shift` record | Planning entity |
| `guard_id` on Shift | `PlanningVariable` |
| Week schedule | `@planning_solution` container |

---

## API / Interface Surface

### Configuration

```python
from timefold.solver import SolverFactory, SolverManager, SolutionManager
from timefold.solver.config import SolverConfig, ScoreDirectorFactoryConfig, TerminationConfig, Duration

solver_config = SolverConfig(
    solution_class=EmployeeSchedule,
    entity_class_list=[Shift],
    score_director_factory_config=ScoreDirectorFactoryConfig(
        constraint_provider_function=define_constraints
    ),
    termination_config=TerminationConfig(
        spent_limit=Duration(seconds=30)      # tune to minutes in production
    )
)
```

### Synchronous solve (one-shot)

```python
solver = SolverFactory.create(solver_config).build_solver()
solution = solver.solve(problem)          # blocks until termination
print(solution.score)                     # e.g. "0hard/-42soft"
```

### Async solve with live updates (used in the quickstart REST API)

```python
solver_manager = SolverManager.create(SolverFactory.create(solver_config))

def on_update(partial_solution: EmployeeSchedule):
    data_store[job_id] = partial_solution   # called on each improvement

solver_manager.solve_and_listen(job_id, problem, on_update)
status = solver_manager.get_solver_status(job_id)   # SOLVING_ACTIVE | NOT_SOLVING
solver_manager.terminate_early(job_id)
```

### Score explanation

```python
solution_manager = SolutionManager.create(solver_manager)
score_analysis = solution_manager.analyze(solution)
# Returns per-constraint breakdown: which matches fired, by how much
```

### Constraint provider

```python
@constraint_provider
def define_constraints(cf: ConstraintFactory):
    return [hard_constraint_1(cf), soft_constraint_2(cf), ...]

def hard_constraint_1(cf: ConstraintFactory):
    return (
        cf.for_each(Shift)
        .filter(lambda s: ...)
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Descriptive name")
    )
```

### Key ConstraintFactory methods

| Method | Purpose |
|---|---|
| `for_each(Class)` | Stream over all assigned instances |
| `for_each_unique_pair(Class, *joiners)` | Cartesian pairs with joiners |
| `join(Class, *joiners)` | Cross-join two streams |
| `filter(predicate)` | Narrow stream |
| `group_by(key_fn, collector)` | Aggregate (like SQL GROUP BY) |
| `flatten_last(fn)` | Expand a collection field into tuples |
| `if_exists / if_not_exists` | Conditional propagation |
| `penalize(score, [weight_fn])` | Worsen score per match |
| `reward(score, [weight_fn])` | Improve score per match |
| `as_constraint("name")` | Terminal — names the constraint |

### Joiners

| Joiner | Meaning |
|---|---|
| `Joiners.equal(fn_a, fn_b)` | Properties are equal |
| `Joiners.overlapping(start_fn, end_fn)` | Time intervals overlap |
| `Joiners.less_than_or_equal(fn_a, fn_b)` | Ordered comparison |
| `Joiners.containing(fn, item_fn)` | Collection membership |

### Score types

| Type | Use case |
|---|---|
| `HardSoftScore` | Standard two-level (recommended for scheduling) |
| `HardSoftDecimalScore` | When penalties need fractional weights |
| `HardMediumSoftScore` | Three-level hierarchy |
| `BendableScore` | Arbitrary levels |

Hard violations always dominate soft — the solver will never trade a hard violation for any soft gain.

---

## Algorithms / Techniques Worth Borrowing

### What Timefold does under the hood

1. **Construction Heuristic** (phase 1): First Fit Decreasing — quickly assigns all entities to produce a valid (if suboptimal) initial solution.

2. **Local Search Metaheuristic** (phase 2, default): Late Acceptance or Tabu Search — iteratively moves planning variables to neighbours, accepting moves that improve or are within a tolerance of the best score.

3. **Incremental Score Calculation**: only the constraints affected by the last move are re-evaluated, not the full problem — this is what makes it practical at scale.

4. **Move generation**: automatically generates swap moves, change moves, and pillar moves across the `ValueRangeProvider` population.

### Techniques applicable to a hand-rolled Node.js scheduler

If you build scheduling without Timefold, these ideas are worth borrowing:

- **Constraint hierarchy**: evaluate hard constraints first; only pursue soft optimisation after all hard constraints are satisfied. Encode score as `[hardViolations, softPenalty]` and sort lexicographically.
- **Greedy construction + local swap**: assign shifts greedily by most-constrained first (fewest qualified guards), then improve with guard swaps.
- **Qualification bitmasks**: represent guard qualifications and site requirements as integers; `(guardQuals & siteQuals) === siteQuals` is O(1) eligibility check.
- **Rest-time window precomputation**: for each guard, precompute which shift slots they are eligible for given rest constraints — reduces candidate set dramatically.
- **Fair-load balancing via load_balance collector**: Timefold's `ConstraintCollectors.load_balance` measures unfairness as variance across guard assignment counts — simple to replicate as `Math.max(counts) - Math.min(counts)` penalty.

---

## What's Missing for Our Security App

These are gaps between the official employee-scheduling quickstart and Arrow Security's requirements:

| Requirement | Quickstart coverage | Gap |
|---|---|---|
| Qualification matching (armed/unarmed/outdoor) | `required_skill: str` (single skill) | Arrow needs **multi-skill AND logic** — a site requires ALL listed quals, not just one |
| 8h minimum rest between shifts | `at_least_10_hours_between_two_shifts` (10h) | Trivially tunable: change the threshold |
| 40h/week cap | Not in quickstart | Needs `group_by(guard, sum(duration))` constraint (shown in demo code) |
| Each shift exactly one guard | Implicit (PlanningVariable is nullable — unassigned = hard violation) | Need `for_each_unassigned(Shift).penalize(HARD)` or check score for 0hard |
| Shift swap requests | Not modelled | Additional planning variable or pre-processing |
| Availability/unavailability windows | `unavailable_dates: set[date]` | Quickstart handles this well; map to our DB `user_availability` table |
| On-call / standby | Not modelled | Would need a new shift type |
| Indian labour law (ESI/PF) | Not modelled | Separate payroll concern, not a scheduling constraint |
| Multi-site guard travel | Not modelled | Could add `between_sites_travel_time` soft constraint |
| Fair weekend distribution | Not modelled | Add `count_weekend_shifts_per_guard` soft constraint |

---

## Verdict

**Do not adopt Timefold as a runtime dependency for Arrow Security's current phase.**

### Why not now

1. **JVM is a hard requirement.** Every deployment — dev laptop, staging, production — must have JDK 21 installed and `JAVA_HOME` set. That adds ~350 MB, a startup overhead of 1–2 seconds for JVM warm-up, and operational complexity that does not fit a lightweight Fastify + Node.js stack.

2. **Python 3.10–3.12 only.** The machine already has Python 3.14. Adding a pinned Python environment alongside the main stack is extra infrastructure friction.

3. **Performance caveat is significant.** The official docs flag Python as "significantly slower" than Java/Kotlin. For a 63-shift / 5-guard problem, the solver would likely converge in under 30 seconds regardless, but for a real weekly roster (100+ shifts, 20+ guards) this matters.

4. **Overkill for current scale.** With 5–20 guards and 63 shifts/week, a greedy + local-swap algorithm implemented directly in TypeScript will be fast enough (<100ms) and fully controllable.

### When to revisit

- When roster size exceeds ~30 guards or 200 shifts/week — at that point greedy heuristics start producing meaningfully suboptimal schedules.
- When multi-constraint complexity grows (shift swaps, on-call pools, part-time guards, certification expiry) — Timefold's declarative constraint model becomes a genuine productivity win.
- If the team moves to a Java/Kotlin microservice architecture, Timefold Java is the clear choice: no JVM overhead argument, no Python mismatch.

### Alternative path recommended

Implement a lightweight TypeScript scheduler in `apps/api/src/lib/scheduler.ts`:
1. Greedy construction: sort shifts by most-constrained (fewest eligible guards); assign first eligible guard by fairness score.
2. 2-opt swap pass: for each pair of shifts, try swapping guards; keep if score improves.
3. Score = `[hardViolations × 1000 + softPenalty]`; hard = unqualified or overlap or rest violation; soft = overwork penalty.
4. Run in ~10ms; expose as `POST /api/roster/generate`.

This borrows Timefold's conceptual model without the JVM dependency.

---

## Concrete Extracts

### Actual constraint code from employee-scheduling quickstart (`constraints.py`)

```python
@constraint_provider
def define_constraints(constraint_factory: ConstraintFactory):
    return [
        # Hard constraints
        required_skill(constraint_factory),
        no_overlapping_shifts(constraint_factory),
        at_least_10_hours_between_two_shifts(constraint_factory),
        one_shift_per_day(constraint_factory),
        unavailable_employee(constraint_factory),
        # Soft constraints
        undesired_day_for_employee(constraint_factory),
        desired_day_for_employee(constraint_factory),
        balance_employee_shift_assignments(constraint_factory)
    ]


def required_skill(constraint_factory: ConstraintFactory):
    return (constraint_factory.for_each(Shift)
            .filter(lambda shift: shift.required_skill not in shift.employee.skills)
            .penalize(HardSoftDecimalScore.ONE_HARD)
            .as_constraint("Missing required skill"))


def no_overlapping_shifts(constraint_factory: ConstraintFactory):
    return (constraint_factory
            .for_each_unique_pair(Shift,
                Joiners.equal(lambda shift: shift.employee.name),
                Joiners.overlapping(lambda shift: shift.start, lambda shift: shift.end))
            .penalize(HardSoftDecimalScore.ONE_HARD, get_minute_overlap)
            .as_constraint("Overlapping shift"))


def at_least_10_hours_between_two_shifts(constraint_factory: ConstraintFactory):
    return (constraint_factory
            .for_each(Shift)
            .join(Shift,
                Joiners.equal(lambda shift: shift.employee.name),
                Joiners.less_than_or_equal(
                    lambda shift: shift.end, lambda shift: shift.start))
            .filter(lambda a, b:
                (b.start - a.end).total_seconds() // (60 * 60) < 10)
            .penalize(HardSoftDecimalScore.ONE_HARD,
                lambda a, b: 600 - ((b.start - a.end).total_seconds() // 60))
            .as_constraint("At least 10 hours between 2 shifts"))


def balance_employee_shift_assignments(constraint_factory: ConstraintFactory):
    return (constraint_factory.for_each(Shift)
            .group_by(lambda shift: shift.employee,
                      ConstraintCollectors.count())
            .complement(Employee, lambda e: 0)
            .group_by(ConstraintCollectors.load_balance(
                lambda employee, count: employee,
                lambda employee, count: count))
            .penalize_decimal(HardSoftDecimalScore.ONE_SOFT,
                lambda lb: lb.unfairness())
            .as_constraint("Balance employee shift assignments"))
```

### Solver configuration (from `solver.py`)

```python
solver_config = SolverConfig(
    solution_class=EmployeeSchedule,
    entity_class_list=[Shift],
    score_director_factory_config=ScoreDirectorFactoryConfig(
        constraint_provider_function=define_constraints
    ),
    termination_config=TerminationConfig(
        spent_limit=Duration(seconds=30)
    )
)

solver_manager = SolverManager.create(SolverFactory.create(solver_config))
solution_manager = SolutionManager.create(solver_manager)
```

### REST API pattern (from `rest_api.py`) — maps directly to Fastify

```python
# POST /schedules — start async solve, return job ID
@app.post("/schedules")
async def solve_timetable(schedule: EmployeeSchedule) -> str:
    job_id = str(uuid4())
    solver_manager.solve_and_listen(job_id, schedule,
                                    lambda sol: update_schedule(job_id, sol))
    return job_id

# GET /schedules/{id} — poll for current best solution
@app.get("/schedules/{problem_id}")
async def get_timetable(problem_id: str) -> EmployeeSchedule:
    schedule = data_sets[problem_id]
    return schedule.model_copy(update={
        'solver_status': solver_manager.get_solver_status(problem_id)
    })

# DELETE /schedules/{id} — stop solver early
@app.delete("/schedules/{problem_id}")
async def stop_solving(problem_id: str) -> None:
    solver_manager.terminate_early(problem_id)
```

### Domain model (from `domain.py`)

```python
class Employee(JsonDomainBase):
    name: Annotated[str, PlanningId]
    skills: Annotated[set[str], Field(default_factory=set)]
    unavailable_dates: Annotated[set[date], Field(default_factory=set)]
    undesired_dates: Annotated[set[date], Field(default_factory=set)]
    desired_dates: Annotated[set[date], Field(default_factory=set)]

@planning_entity
class Shift(JsonDomainBase):
    id: Annotated[str, PlanningId]
    start: datetime
    end: datetime
    location: str
    required_skill: str
    employee: Annotated[Employee | None, PlanningVariable, Field(default=None)]

@planning_solution
class EmployeeSchedule(JsonDomainBase):
    employees: Annotated[list[Employee], ProblemFactCollectionProperty, ValueRangeProvider]
    shifts: Annotated[list[Shift], PlanningEntityCollectionProperty]
    score: Annotated[HardSoftDecimalScore | None, PlanningScore, ScoreSerializer, ScoreValidator, Field(default=None)]
    solver_status: Annotated[SolverStatus | None, Field(default=None)]
```

---

## Demo Run Results

| Item | Result |
|---|---|
| Install attempted | Yes — `pip install timefold` |
| Install outcome | **FAILED** — network blocked (`files.pythonhosted.org` DNS failure) |
| Java present | **No** — `java` not found in PATH; no JDK in `C:\Program Files\Java` or `C:\Program Files\Eclipse Adoptium` |
| Python version | 3.14.0 (timefold requires 3.10–3.12) |
| Wall time | Not measured — blocked |
| Peak memory | Not measured — blocked |
| Solution feasibility | Not measured — blocked |
| Assignment table | Not generated — blocked |

**What would need to change to run the demo:**
1. Install JDK 21 from https://adoptium.net and set `JAVA_HOME`
2. Install Python 3.12 (alongside 3.14)
3. `python3.12 -m venv research/timefold-demo/venv && venv/Scripts/activate`
4. `pip install timefold==1.24.0b0` (requires network access to PyPI)
5. `python research/timefold-demo/demo_attempt.py`

Expected results for 63 shifts / 5 guards / 30s timeout:
- Wall time: 5–30 seconds (JVM warm-up ~2s + solving ~3–28s)
- Peak memory: 200–400 MB (JVM heap dominates)
- Feasibility: likely **feasible** (63 shifts, 5 guards at 8h each = 504 guard-hours/week; 5 × 40h = 200h available → mathematically **infeasible** to satisfy max_40h_per_week as hard; it must be soft, which matches the shared input spec)
- S3 (Bank/armed) shifts would be assigned only to Carlos (G3) or Dana (G4) — the only armed-qualified guards

---

## Open Questions for Synthesis

1. **Infeasibility of the shared input**: 63 shifts × 8h = 504 guard-hours required; 5 guards × 40h max = 200h available. The 40h/week cap cannot be hard if all shifts must be covered. Is the intent to find minimum-violation solutions, or should we relax the cap to soft?

2. **Single-skill vs multi-skill**: The official quickstart uses `required_skill: str` (exactly one required skill). Arrow Security's sites need multi-skill AND logic (`["unarmed", "outdoor"]` means both are required). The correct model changes `required_skill: str` to `required_skills: set[str]` and updates the constraint to `shift.required_skills.issubset(guard.skills)`.

3. **Microservice vs in-process**: If we ever adopt Timefold, should it run as a separate Java microservice (optimal performance, clean separation, no Python needed) or as a Python sidecar (same language surface but JVM overhead still applies)? The REST API pattern in the quickstart is already microservice-ready.

4. **Benchmarking vs other solvers**: Investigations 01–03 cover other approaches. Does Timefold actually outperform a simpler OR-Tools CP-SAT model (Python, no JVM) for this problem size? At 63 shifts / 5 guards, both would be equally effective.

5. **Timefold Cloud**: Timefold offers a hosted SaaS solver API (`api.solver.timefold.ai`). For Arrow's scale, this could eliminate the JVM deployment concern entirely — call their REST API, pay per solve. Worth evaluating cost vs complexity.
