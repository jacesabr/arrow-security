# Two-Phase Scheduling Decomposition — Research Notes

## What Two-Phase Decomposition Is

Two-phase decomposition is a strategy for solving the workforce scheduling problem by splitting it into two sequential sub-problems rather than solving everything simultaneously in one large optimization model.

**The core insight:** A monolithic scheduler must simultaneously decide (a) which shift slots exist and when they start/end, and (b) which specific worker fills each slot. These two decisions interact but have very different mathematical structures. Attempting to solve them together creates a combinatorial explosion: 50 guards × 3 shifts/day × 7 days yields roughly 10^75 possible schedule combinations. Decomposing into phases dramatically reduces the search space for each solver.

**The Staffjoy existence proof:** Staffjoy (a workforce management SaaS that ran 2016–2017) built exactly this architecture in production. Their original `autoscheduler` was monolithic — a mixed-integer program that simultaneously created shifts and assigned workers. They replaced it with two microservices: **Chomp** (Phase 1: demand → shift slots) and **Mobius** (Phase 2: shift slots → worker assignments). The decomposed system ran in production from June 2016 to March 2017 with zero modifications or production errors. The monolithic autoscheduler repository was deprecated and is no longer compatible with their open-source suite.

---

## Phase 1: Demand Planning

**Goal:** Given a demand forecast (how many guards are needed per time unit, per site), produce a set of shift _slots_ — concrete time windows with defined start times, durations, and minimum headcounts — without yet deciding who fills them.

**Inputs:**
- Demand array: e.g., how many guards are needed at Site A each hour of the week
- Shift length constraints: minimum (e.g., 4 hrs) and maximum (e.g., 12 hrs) duration
- Site coverage requirements
- Any hard business rules: no shifts shorter than X, no more than Y concurrent shifts

**Outputs:**
- A list of shift slots: `{ siteId, startTime, endTime, requiredHeadcount }`
- This is the "demand skeleton" — it tells you _what_ shifts need to exist without assigning anyone

**Mathematical approach (Chomp):**
Chomp treats this as a **bin-packing / covering problem** and solves it with **branch-and-bound**. The objective is to tessellate the demand curve with shift blocks — finding the minimum total person-hours of shifts that fully covers the demand at every time slot. Results are cached by demand profile + min/max shift length fingerprint, so identical demand patterns across sites or weeks avoid redundant computation.

**General academic framing:**
The literature calls this the "shift design" or "shift generation" sub-problem. A two-phase ILP paper (Springer, 2019) describes the first stage as solving an "approximate aggregated model of reduced size" that produces shift templates, sometimes intentionally infeasible at the individual constraint level, to be refined in Phase 2.

---

## Phase 2: Guard Assignment

**Goal:** Given the shift slots from Phase 1, assign specific guards to each slot while respecting guard-level constraints (availability, hours limits, qualifications, preferences, rest periods).

**Inputs:**
- Shift slots from Phase 1
- Guard availability windows
- Guard qualifications / site authorizations
- Labor rules: max hours/week, minimum rest between shifts, no back-to-back nights
- Guard preferences (optional, treated as soft constraints)
- Headcount requirements per slot

**Outputs:**
- `{ shiftSlotId, guardId }` assignment records
- Optionally: a ranked preference score showing how well the schedule satisfies soft constraints

**Mathematical approach (Mobius):**
Mobius uses **Gurobi** (a commercial MIP/LP solver) to find an optimal assignment. The problem is now a structured assignment problem — much smaller than the combined Phase 1+2 problem — so Gurobi can find proven-optimal or near-optimal solutions quickly. Constraint types: hard (availability, site authorization) and soft (preference matching, hour fairness).

**General academic framing:**
This sub-problem is a variant of the **generalized assignment problem** or a binary integer program where `x[guard][slot] ∈ {0,1}` and constraints enforce coverage and guard-level limits. At the ~50-guard scale, this is tractable with standard CP-SAT or ILP solvers in seconds to low minutes.

---

## Chomp Algorithm (Staffjoy, 2016)

**Source:** [GitHub — Staffjoy/chomp-decomposition](https://github.com/Staffjoy/chomp-decomposition) | [PyPI — chomp 1.0](https://pypi.org/project/chomp/1.0/)

**Author:** Philip I. Thomas, Staffjoy

**What it is:** An open-source Python microservice (Docker-containerized) that solves the demand-to-shift decomposition sub-problem. It is unitless and time-granularity agnostic — designed for hourly weekly scheduling but works at any granularity.

**Algorithm:**
- Branch-and-bound search over the space of possible shift start times and durations
- Caches subproblem results keyed on `(demand_profile_hash, min_shift_len, max_shift_len)` — so identical demand curves across multiple sites don't recompute
- Preprocessing detects infeasible inputs before committing to full search
- Tessellation heuristic guides branching toward solutions that cover demand tightly with minimum total hours

**Key properties:**
- Produces shift slots to meet demand; does NOT assign workers
- Minimizes total scheduled hours while guaranteeing demand coverage at every time unit
- Ran in Staffjoy production with zero errors for ~9 months
- Explicitly described as "more stable and with faster computation times compared to the current Scheduler system" (the old monolithic autoscheduler)

**Why it was created:** The old autoscheduler "completed shift creation and assignment simultaneously." Chomp was introduced to decouple the demand-matching step, making the downstream assignment problem (Mobius) structurally simpler — and enabling independent improvement of each phase.

**Practical limitation for Arrow Security:** Chomp operates on a single demand time-series. For multi-site scheduling, you run Chomp independently per site, then feed all resulting slots into a single Mobius instance that handles cross-site guard fairness and availability.

---

## Mobius Approach (Staffjoy, 2017)

**Source:** [GitHub — Staffjoy/mobius-assignment](https://github.com/staffjoy/mobius-assignment) | [Blog — Introducing Mobius](https://blog.staffjoy.com/introducing-mobius-giving-employees-the-shifts-they-want-5eadfdf6de71)

**Author:** Philip I. Thomas, Staffjoy

**What it is:** A Python microservice that assigns workers to pre-created shifts, subject to constraints. It runs after Chomp in the pipeline and uses the **Gurobi** optimizer internally.

**Inputs:** Shift slots (from Chomp output), worker availability/preference data, constraints

**Outputs:** Worker-to-shift assignments

**Key framing:** The name "Mobius" is thematic — shift schedules that loop back on themselves (cyclical weekly patterns), not a reference to a specific algorithm named "Mobius decomposition." There is no academic method called "Mobius strip scheduling" in the literature; it is Staffjoy's product name.

**Why Gurobi:** The assignment problem, even decoupled from shift design, involves binary integer variables and multiple competing constraints. Gurobi's branch-and-cut engine finds provably near-optimal solutions quickly. This is a limitation if you want to avoid commercial licenses — Gurobi can be replaced with Google OR-Tools CP-SAT for the assignment phase with comparable results at the scales Arrow Security operates.

**Constraint types Mobius handles:**
- Worker availability windows (hard)
- Maximum weekly hours (hard)
- Minimum rest between shifts (hard)
- Site/role qualification matching (hard)
- Worker shift preferences (soft — maximized in objective)
- Fairness / hour equalization across workers (soft)

---

## Academic Two-Phase Literature

**Key papers:**

1. **"A two-phase mathematical-programming heuristic for flexible assignment of activities and tasks to work shifts"** (Springer, Journal of Scheduling, 2013) — Phase 1 constructs shift templates under uncertainty; Phase 2 assigns workers once demand is revealed. Produces good-quality solutions fast even on large instances.

2. **"One- and two-phase heuristics for workforce scheduling"** (ScienceDirect, 1978) — The earliest formal treatment. Establishes that splitting shift design from worker assignment is computationally advantageous. Two-phase consistently outperforms one-phase on real-world instances.

3. **"A two-stage solution approach for personalized multi-department multi-day shift scheduling"** (ScienceDirect, 2019) — Stage 1 solves an aggregated problem to get a demand skeleton; Stage 2 disaggregates to produce individual guard schedules. For 5 departments / 20 employees: solved in under 6 seconds. Scales to 25 departments / 1,000 employees in under 2 hours.

4. **"A decomposition heuristic for rotational workforce scheduling"** (Springer, Journal of Scheduling, 2020) — Focuses on cyclic / rotational schedules (guards rotating through fixed patterns). Decomposes by fixing the set of shift blocks, then using a network model to find valid sequences. Greatly outperforms previous heuristics on standard benchmarks.

5. **Assembled.com (2024)** — Engineering blog documenting a 12× speedup (from 2+ hours to under 10 minutes for 1,000 agents) achieved by switching from a monolithic ILP to a decomposed approach. Key technique: temporal decomposition (scheduling non-overlapping shifts independently) + parallel solving of independent subproblems.

---

## Practical Implementation Complexity

### Two-Phase Decomposition

| Aspect | Notes |
|---|---|
| Implementation effort | Medium-high — two separate models, pipeline between them |
| Phase 1 complexity | Low-medium: bin-packing/covering with branch-and-bound; well-understood |
| Phase 2 complexity | Medium: assignment ILP/CP; solvable with OR-Tools CP-SAT (free) |
| Solution quality | Near-optimal for each phase independently; can be suboptimal globally (phase 1 choices constrain phase 2) |
| Modularity | High — demand planning and assignment can be improved independently |
| Debuggability | High — you can inspect and edit the Phase 1 output (shift slots) before running Phase 2 |
| Parallelism | Phase 1 can run per-site in parallel |
| Explainability | High — manager sees "here are the slots we need" before assignment runs |

### Monolithic CP-SAT (All-at-Once)

| Aspect | Notes |
|---|---|
| Implementation effort | Lower — single model with all constraints |
| Solver | Google OR-Tools CP-SAT (free, battle-tested) |
| Solution quality | Globally optimal (subject to solver time limit) |
| Performance at 20-50 guards | Excellent — solves weekly schedule in seconds to low minutes |
| Scalability ceiling | Starts degrading at ~200+ guards with complex constraints |
| Modularity | Low — changing one constraint can affect everything |
| Debuggability | Lower — infeasibility harder to diagnose |
| Explainability | Lower — harder to show managers intermediate reasoning |

### Where Decomposition Overhead Hurts

Decomposition can produce **globally suboptimal** solutions because Phase 1 commits to a shift layout without knowing which guards will be available. If a key guard is unavailable on Tuesday, Phase 1 might have created an 8-hour Tuesday slot that Phase 2 can only cover with two overtime guards — whereas a monolithic solver would have seen the availability data and created two 4-hour slots instead.

Mitigations:
- Feed availability heatmaps as soft constraints into Phase 1 (weight demand down during low-availability periods)
- Run iterative feedback: if Phase 2 fails, relax Phase 1 constraints and rerun
- Accept that for small instances, the quality gap between decomposed and monolithic is small in practice

---

## Recommendation for Arrow Security

**Short answer: Start monolithic (CP-SAT), build Phase 1 as a manual UI step, keep the architecture open for Phase 2 decomposition later.**

### Why not full decomposition yet

At 20–50 guards and 5–10 sites, a monolithic CP-SAT model is the right call:

- **Scale fits perfectly in a monolithic solver.** OR-Tools CP-SAT solves nurse-scheduling problems of this size in under 1 second. There is no computational pressure requiring decomposition.
- **You don't yet have demand forecasts.** Chomp-style Phase 1 requires an hourly demand curve per site. Arrow Security's demand is driven by client contracts (site A needs 2 guards daily 06:00–18:00), not variable forecast data. This collapses Phase 1 to a trivial step — shift slots are already defined by contracts.
- **Decomposition overhead is real.** Building two models, a pipeline between them, and diagnostic tooling roughly doubles implementation effort for no current benefit.
- **Infeasibility diagnosis is easier monolithically.** When a schedule can't be made (e.g., guard unavailable, site short-staffed), CP-SAT can explain why. Decomposed systems make this harder — Phase 2 infeasibility may be caused by bad Phase 1 decisions.

### Recommended architecture for Arrow Security

**Phase 1 (manual, UI-driven — build now):**
Supervisors define shift _templates_ per site through the roster UI: "Site A needs 2 guards on day shift (06:00–18:00) and 1 guard on night shift (18:00–06:00), Monday–Sunday." This is the demand skeleton — humans do Phase 1 because contract-driven demand is stable and doesn't need algorithmic inference.

The `shifts` table already stores this. The roster page at `/roster` can show the weekly grid of slots that need filling.

**Phase 2 (algorithmic — build next):**
A `POST /api/shifts/auto-assign` endpoint takes the open shift slots for a week and runs a CP-SAT model (OR-Tools, Node.js via `node-addon-api` bindings or a Python sidecar) to assign guards optimally. Constraints:

```
Hard:
  - Guard must be available (not on leave, not already assigned that day)
  - Guard must be authorized for the site
  - Max 48 hrs/week (Indian labour law)
  - Minimum 11 hrs rest between shifts

Soft (objective to maximize):
  - Guard preference for specific sites
  - Hour fairness across all guards
  - Minimize last-minute reassignments from previous week
```

The output is a set of `{ shiftId, guardId }` records written to the `shifts` table.

**When to add Chomp-style Phase 1 decomposition:**
Only if Arrow Security adds **variable demand** — e.g., event security where the number of guards needed per hour fluctuates based on crowd estimates. At that point, run a Chomp-equivalent (branch-and-bound bin-packing) per event to produce shift slots, then feed them into the CP-SAT assignment model.

### Technology choices

| Component | Recommendation |
|---|---|
| Phase 2 solver | Google OR-Tools CP-SAT (free, Apache 2.0) |
| Language binding | Python sidecar process called from Fastify via `child_process.spawn`, or `@google/or-tools` npm package |
| Gurobi (Mobius used it) | Avoid — commercial license, $10k+/year. OR-Tools matches its performance at this scale |
| Full Chomp reuse | No — Chomp is Python, Docker-only, and solves a problem Arrow doesn't have yet (variable demand inference) |

### Sequencing

1. **Now:** Manual roster UI (Phase 1 done by supervisors)
2. **Next sprint:** `auto-assign` endpoint with CP-SAT for Phase 2
3. **Later (if needed):** Chomp-style demand inference when client contracts become variable

This gives Arrow Security a working scheduler in the least time, with a clear upgrade path to full two-phase decomposition when scale or demand complexity justifies it.

---

## Sources

- [GitHub — Staffjoy/chomp-decomposition](https://github.com/Staffjoy/chomp-decomposition)
- [GitHub — Staffjoy/mobius-assignment](https://github.com/staffjoy/mobius-assignment)
- [GitHub — Staffjoy/autoscheduler (deprecated)](https://github.com/Staffjoy/autoscheduler)
- [Nextmv — Shift scheduling optimization: Generating shift types, planning for demand, and assigning workers](https://www.nextmv.io/blog/shift-scheduling-optimization-generating-shift-types-planning-for-demand-and-assigning-workers)
- [Assembled.com — Old school AI isn't dead: How we achieved a 12x speedup on an NP hard problem](https://www.assembled.com/blog/np-hard-scheduling-optimization)
- [Springer — A two-phase mathematical-programming heuristic for flexible assignment of activities and tasks to work shifts](https://link.springer.com/article/10.1007/s10951-013-0324-2)
- [Springer — A decomposition heuristic for rotational workforce scheduling](https://link.springer.com/article/10.1007/s10951-020-00659-2)
- [Springer — An assessment of a days off decomposition approach to personnel shift scheduling](https://link.springer.com/article/10.1007/s10479-014-1674-7)
- [Google OR-Tools — Employee Scheduling](https://developers.google.com/optimization/scheduling/employee_scheduling)
- [CP-SAT Rostering Guide — Michael Brenndoerfer](https://mbrenndoerfer.com/writing/cp-sat-rostering-constraint-programming-workforce-scheduling)
- [MCP Analytics — Workforce Scheduling Optimization Whitepaper](https://mcpanalytics.ai/whitepapers/whitepaper-workforce-scheduling)
- [ScienceDirect — One- and two-phase heuristics for workforce scheduling (1978)](https://www.sciencedirect.com/science/article/pii/0360835278900037)
- [ScienceDirect — A two-stage solution approach for personalized multi-department multi-day shift scheduling (2019)](https://www.sciencedirect.com/science/article/abs/pii/S0377221719306472)
