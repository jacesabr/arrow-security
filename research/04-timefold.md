# Timefold Solver — Research Notes

## What It Does

Timefold Solver is an open-source, Apache 2.0-licensed **constraint satisfaction and optimization engine** built by the original OptaPlanner team (the Red Hat project that was spun out in 2023). It is the direct successor to OptaPlanner with full API compatibility.

Given a planning problem defined as:
- **Planning entities** — the things being assigned (e.g., shifts needing a guard)
- **Problem facts** — fixed inputs (e.g., guards, their availability, site requirements)
- **Planning variables** — the fields being decided (e.g., which guard goes on which shift)
- **Constraints** — rules scored as Hard/Medium/Soft violations

…the solver applies metaheuristics (Tabu Search, Simulated Annealing, Late Acceptance, etc.) plus an incremental score calculator to iteratively improve the solution until a time limit or solution quality threshold is met.

**What it is NOT:** It is not a rules engine or an ML model. It is a combinatorial optimization engine — think of it as an extremely smart backtracking search that explores billions of possible assignment combinations per second.

**Current version:** 2.0 (stable), released 2025. Key 2.0 additions: full list variable support, a new Neighborhoods API to escape local optima, and a new Plus commercial tier.

**Documented use cases:** Vehicle routing, employee rostering, maintenance scheduling, task assignment, school timetabling, conference scheduling, job shop scheduling, facility location — and explicitly, **security guard scheduling**.

---

## Language / Runtime Requirements

| Option | Runtime required | Performance |
|--------|-----------------|-------------|
| **Java / Kotlin** | JDK 21+ | Full / fastest |
| **Python** (`timefold` PyPI package) | JDK 17+ (JVM runs underneath via JPype/GraalPy bridge) | ~25% of Java speed |

**The solver core is 100% Java.** There is no native Node.js SDK, no WASM build, no pure-Python implementation. Every deployment requires a JVM.

For Arrow Security's stack (Node.js/TypeScript), the practical path is:

> **Deploy Timefold as a separate microservice** (Quarkus or Spring Boot JAR/container) that exposes a REST API. The Fastify API calls into it over HTTP.

Python is technically possible but still requires a JVM, runs at one-quarter the speed, and gains nothing over just running the Java service — so the Java Quarkus path is the correct one.

---

## Employee Rostering Demo Analysis

The official quickstart lives at:
`https://github.com/TimefoldAI/timefold-quickstarts/tree/stable/java/employee-scheduling`

It is a **Quarkus application** (Java) with a REST front-end and an in-browser UI. The demo schedules shifts to employees considering:

### Domain Model (simplified)

```
Shift          ← planning entity
  id           String
  start        LocalDateTime    (problem fact)
  end          LocalDateTime    (problem fact)
  location     String           (problem fact, maps to "site")
  requiredSkill String          (problem fact)
  employee     Employee         ← @PlanningVariable (what the solver assigns)

Employee       ← problem fact
  id           String
  name         String
  skills        Set<String>
  availabilities List<Availability>

Availability
  date         LocalDate
  type         AVAILABLE / UNAVAILABLE / DESIRED / UNDESIRED
```

### Constraints implemented in the quickstart

**Hard (must not be violated):**
1. No employee scheduled during a period they marked as UNAVAILABLE
2. No overlapping shifts for the same employee
3. Minimum 10-hour rest between consecutive shifts
4. Maximum one shift per employee per day
5. Employee must have the required skill for the shift

**Soft (optimized, not enforced):**
6. Minimize scheduling on UNDESIRED days
7. Maximize scheduling on DESIRED days
8. Distribute shift count equitably across all employees (fairness)

### REST API Pattern

```
POST /schedules          → submits a schedule problem, returns { jobId }
GET  /schedules/{jobId}/status  → "SOLVING_SCHEDULED" | "SOLVING_ACTIVE" | "SOLVING_COMPLETED"
GET  /schedules/{jobId}  → returns full solution with score and assignments
DELETE /schedules/{jobId} → terminates a running solve
```

The `SolverManager` handles async execution in a thread pool — the POST returns immediately with a `jobId`, the Node.js API polls `GET /status` until `SOLVING_COMPLETED`, then fetches the result.

### Full commercial constraint library (Timefold Employee Shift Scheduling product)

Beyond the OSS quickstart, Timefold sells a pre-built Employee Shift Scheduling model with 70+ constraints including:

- Employee contracts (min/max hours per week/period)
- Employee priority tiers
- Pairing constraints (guard A and guard B always together, or never together)
- Shift travel and location adjacency
- Mandatory break enforcement
- Time-off and leave management
- Shift rotation patterns (e.g., no more than 5 consecutive nights)
- Shift type diversity (balance days/nights/weekends)
- Demand-based minimum staffing
- Cost management (minimize overtime)

The OSS quickstart covers the essentials; the paid product covers the edge cases.

---

## Constraint Modeling for Guard Scheduling

The following constraints map directly to Arrow Security's domain. All are achievable with the OSS solver.

### Hard Constraints (must hold)

| Constraint | Arrow context |
|------------|---------------|
| Skill / certification match | Guards have site-specific clearances; `requiredSkill` on shift |
| No overlapping shifts | One guard cannot be at two sites simultaneously |
| Minimum rest between shifts | Indian labour law: typically 8–12 hours between shifts |
| Site minimum headcount | Each shift at a site needs N guards (modeled as N identical shift slots) |
| Unavailability | Guard has requested leave or a day off |
| Active guard only | Do not schedule a deactivated guard (`users.isActive`) |

### Soft Constraints (optimize)

| Constraint | Arrow context |
|------------|---------------|
| Prefer desired shifts | Guard has indicated preferred days/times |
| Equitable distribution | No guard gets overloaded relative to peers |
| Minimize split shifts | Avoid short gaps between shifts for the same guard |
| Balance weekend/night shifts | Fairness across the roster |
| Minimize undesired hours | Reduce employee churn / fatigue |
| Preferred site proximity | Not modeled in Arrow schema yet, but a future add |

### Score type to use

`HardSoftScore` (two levels) is sufficient for most guard scheduling. If you add "mandatory shift coverage that must be filled even if no one is available" — i.e., you must always fill the post — use `HardMediumSoftScore` where Medium = assign as many mandatory shifts as possible.

---

## Integration Architecture (Node.js → Timefold Microservice)

### Deployment topology

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose (existing)                          │
│                                                     │
│  ┌──────────────┐     HTTP/JSON     ┌─────────────┐ │
│  │  Fastify API │ ──────────────── │  Timefold   │ │
│  │  :4000       │  POST /schedules  │  Quarkus    │ │
│  │  (Node.js)   │  GET /schedules/  │  :8080      │ │
│  └──────────────┘    {id}/status   └─────────────┘ │
│          │                                │         │
│          └────── PostgreSQL :5432 ────────┘         │
└─────────────────────────────────────────────────────┘
```

The Timefold service reads its initial data from the same PostgreSQL database (or you pass everything in the POST body — simpler to start).

### Sequence: "Auto-schedule a pay period"

```
Supervisor clicks "Auto-schedule" in Operations Portal
    │
    ▼
POST /api/payroll/:id/autoschedule   (new Fastify route)
    │   reads guards, sites, shifts, availability from DB
    │   builds ScheduleRequest JSON
    ▼
POST http://timefold:8080/schedules   (Timefold microservice)
    │   returns { jobId: "abc-123" }
    │
    ▼  (Fastify stores jobId in DB, returns 202 Accepted)
    
Supervisor polls / UI polls
    │
    ▼
GET /api/payroll/:id/autoschedule/status
    │   Fastify calls GET http://timefold:8080/schedules/abc-123/status
    ▼
    returns { status: "SOLVING_ACTIVE", scoreProgress: "-3hard/-12soft" }

When SOLVING_COMPLETED:
    │
    ▼
GET http://timefold:8080/schedules/abc-123
    │   full solution: Shift[] with employee assigned to each
    ▼
Fastify writes shift assignments to DB → Supervisor reviews → Approves
```

### What the Timefold service looks like (Java / Quarkus skeleton)

```java
// Shift.java
@PlanningEntity
public class Shift {
    String id;
    LocalDateTime start, end;
    String siteId;
    String requiredSkill;       // e.g. "ARMED", "SUPERVISOR"

    @PlanningVariable
    Guard guard;                // solver assigns this
}

// ShiftConstraintProvider.java
public class ShiftConstraintProvider implements ConstraintProvider {
    @Override
    public Constraint[] defineConstraints(ConstraintFactory f) {
        return new Constraint[]{
            requiredSkillConstraint(f),
            noOverlappingShifts(f),
            minRestBetweenShifts(f),
            noUnavailableGuards(f),
            fairDistribution(f),
            preferDesiredShifts(f),
        };
    }
}

// ShiftScheduleResource.java  (JAX-RS)
@Path("/schedules")
public class ShiftScheduleResource {
    @Inject SolverManager<ShiftSchedule, String> solverManager;

    @POST
    public String solve(ShiftSchedule problem) {
        String jobId = UUID.randomUUID().toString();
        solverManager.solve(jobId, problem);
        return jobId;
    }

    @GET @Path("/{jobId}/status")
    public SolverStatus status(@PathParam("jobId") String jobId) {
        return solverManager.getSolverStatus(jobId);
    }

    @GET @Path("/{jobId}")
    public ShiftSchedule solution(@PathParam("jobId") String jobId) {
        return solverManager.getSolverJob(jobId).getFinalBestSolution();
    }
}
```

### What the Fastify side looks like (TypeScript)

```typescript
// apps/api/src/routes/autoschedule.ts
fastify.post('/payroll/:id/autoschedule', async (req, reply) => {
  const payload = req.jwtDecode();
  const { id } = req.params as { id: string };

  // Build problem from DB
  const guards = await db.select().from(users)
    .where(and(eq(users.tenantId, payload.tenantId), eq(users.role, 'guard')));
  const shifts = await db.select().from(shiftsTable)
    .where(eq(shifts.payrollPeriodId, id));

  const problem = { guards, shifts, availability: [...] };

  // Submit to Timefold
  const res = await fetch('http://timefold:8080/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(problem),
  });
  const { jobId } = await res.json();

  // Persist jobId for polling
  await db.update(payrollPeriods).set({ solverJobId: jobId }).where(...);

  return reply.status(202).send({ data: { jobId } });
});
```

### Docker Compose addition

```yaml
# docker-compose.yml addition
timefold:
  image: quay.io/timefold/solver-employee-scheduling:latest  # or build from quickstart
  ports:
    - "8080:8080"
  environment:
    - QUARKUS_DATASOURCE_JDBC_URL=jdbc:postgresql://postgres:5432/secureops
    - QUARKUS_DATASOURCE_USERNAME=secureops
    - QUARKUS_DATASOURCE_PASSWORD=secureops
```

**Important:** The Quarkus native build (`quarkus.package.type=native`) starts in under 100 ms and uses ~50 MB RAM — very Docker-friendly. The JVM build starts in ~3 s and uses ~150 MB.

---

## Effort to Implement

### Phase 1: Proof of Concept (1–2 weeks)

- Fork / clone `timefold-quickstarts/java/employee-scheduling`
- Replace the demo domain model with Arrow's: `Guard`, `Shift`, `Site`, `Availability`
- Implement 4 hard constraints + 2 soft constraints using the ConstraintProvider DSL
- Build the Quarkus JAR, add to docker-compose
- Add one Fastify route: `POST /autoschedule` → fire and forget
- Wire up polling in the Operations Portal (a status badge on the roster page)

### Phase 2: Production-grade (2–4 additional weeks)

- Add remaining constraints (fairness scoring, site-specific skills, min headcount per site)
- Integrate with existing `availability_records` and `shifts` schema properly
- Add a "solver job" table to track status, score, solution JSON
- Supervisor approval flow: proposed schedule sits in "draft" state until approved
- Expose solve time limit as a config (default 30 s is enough for < 50 guards)
- Add unit tests for each constraint using Timefold's `ConstraintVerifier` test API

### Phase 3: Nice to have

- Score explanation ("why wasn't Guard X assigned to Site Y?") — requires Plus edition
- Real-time score progress SSE to the browser during solving
- Historical solving analytics

**Total realistic effort: 3–5 weeks** for a solid, production-ready auto-scheduling microservice covering Arrow's constraint set. The employee-scheduling quickstart eliminates all boilerplate — you are writing business logic from day one.

**Java knowledge required:** Intermediate. The Timefold constraint DSL is readable even for non-Java developers; the Quarkus REST plumbing is one file. The math is handled by the solver. A developer comfortable with TypeScript would find Java unfamiliar but manageable for this scope.

---

## Community vs Commercial Editions

| Feature | Community (Apache 2.0, free) | Plus (commercial) | Enterprise (commercial) |
|---------|------------------------------|-------------------|------------------------|
| Core solver algorithms | Yes | Yes | Yes |
| All planning problem types | Yes | Yes | Yes |
| Employee scheduling quickstart | Yes | Yes | Yes |
| Score Analysis (explain why) | No | **Yes** | Yes |
| Recommendation API | No | **Yes** | Yes |
| Single-threaded only | Yes (single thread) | Single thread | No — multi-threaded |
| Nearby selection (geo-aware) | No | No | **Yes** |
| Multithreaded solving | No | No | **Yes** |
| Partitioned search (large datasets) | No | No | **Yes** |
| Support SLA | Community forum | Commercial | Commercial |

**Verdict on editions for Arrow Security:**

Community Edition is sufficient for Arrow's current scale (< 200 guards). The Enterprise features (multithreading, partitioned search) matter at 10,000+ employees. Plus's Score Analysis is genuinely useful for explaining to supervisors why the solver made a decision — worth considering once the feature is proven. Start with Community.

---

## Verdict: Worth It for Arrow Security?

### Arguments for

1. **Exact match for the problem.** Timefold has a purpose-built security guard scheduling page on their website listing the exact constraints Arrow needs: clearance-based assignment, rest periods, site coverage, fairness.

2. **Open source, no licensing cost.** Community Edition is Apache 2.0, free for commercial use forever.

3. **The quickstart does 80% of the work.** The employee-scheduling demo already has the correct domain shape. Arrow's customization is replacing the demo domain classes and adding 2–3 Arrow-specific constraints.

4. **Clean microservice boundary.** The solver lives in its own container. It doesn't touch the Fastify codebase — only the new `autoschedule` route calls it. If you remove it, nothing breaks.

5. **Augmentation only, as intended.** The solver produces a *proposed* schedule. The supervisor still reviews and approves before anything is written to production shifts. It speeds up a manual process rather than replacing human judgment.

6. **Scales correctly.** For Arrow's likely scale (20–200 guards, weekly schedule, 1–5 sites), the solver will find an excellent solution in under 60 seconds on commodity hardware.

7. **Production-proven lineage.** OptaPlanner (Timefold's predecessor) has been in production since 2006. The algorithms are battle-hardened.

### Arguments against

1. **Java runtime is a foreign dependency.** The Arrow stack is entirely Node.js. Adding a JVM service is a genuine operational burden — different build toolchain, different debugging, different memory model. It is manageable but not trivial.

2. **Intermediate Java knowledge required.** The constraint DSL is clean, but building the domain model, wiring Quarkus, and debugging constraint issues requires someone comfortable with Java/Maven. This is learnable but adds ramp-up time.

3. **Solving takes time.** For 50 guards across 7 days, a 30-second solve time is fine. For interactive "try this one change" use cases, it feels slow. Timefold supports a *real-time planning* mode (re-solve on each change) but it adds complexity.

4. **Async polling adds frontend complexity.** The Operations Portal needs a polling mechanism or SSE connection to show solve progress. Minor but real work.

### Recommendation

**Yes, implement it — but as a Phase 2 feature after the core roster UI is shipped.**

The immediate priority is the manual weekly roster grid (`/roster` page). Once supervisors are scheduling manually and can identify the pain points, build the Timefold auto-suggest layer on top. That order also means you have real constraint data (what rules supervisors actually care about) before you write the constraint provider.

Suggested trigger: when Arrow has > 30 guards active across > 2 sites, manual scheduling becomes painful enough that auto-scheduling has clear ROI. Until then, the roster page alone is the right investment.

**Implementation approach:**
1. Start with the OSS quickstart cloned to `services/scheduler/` in the repo
2. Build behind a feature flag (`FEATURE_AUTOSCHEDULE=true` env var)
3. Present solver output as "suggested schedule" in the roster UI — one-click accept or manual override per shift
4. Do not auto-write to the shifts table without supervisor confirmation
