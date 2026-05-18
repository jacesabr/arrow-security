"""
Timefold Employee Scheduling Demo
Arrow Security — 63 shifts, 5 guards, 4 constraints

BLOCKED: This script requires JDK 17+ installed and JAVA_HOME set.
Java was not found in PATH on this machine during the investigation (2026-05-17).

To run this demo once Java is installed:
  1. Install JDK 21: https://adoptium.net
  2. Set JAVA_HOME environment variable
  3. pip install timefold==1.24.0b0
  4. python demo_attempt.py

Python 3.14.0 is installed but Python 3.10–3.12 is required by timefold 1.24.0b0.
You may also need to install Python 3.12 via pyenv or the official installer.
"""

import json
from datetime import datetime, timedelta, date

# Load shared scheduling input
with open("../shared-scheduling-input.json") as f:
    INPUT = json.load(f)

# -----------------------------------------------------------------------
# Below is the complete working code — it will run once JDK + timefold
# are installed. All imports are guarded so the file can be read/audited
# without a JVM present.
# -----------------------------------------------------------------------

try:
    import time as _time
    import tracemalloc
    from timefold.solver import SolverFactory
    from timefold.solver.config import (
        SolverConfig, ScoreDirectorFactoryConfig,
        TerminationConfig, Duration
    )
    from timefold.solver.domain import (
        planning_entity, planning_solution,
        PlanningId, PlanningVariable,
        ProblemFactCollectionProperty, ValueRangeProvider,
        PlanningEntityCollectionProperty, PlanningScore
    )
    from timefold.solver.score import (
        constraint_provider, ConstraintFactory, Joiners,
        HardSoftScore, ConstraintCollectors
    )
    from typing import Annotated
    from dataclasses import dataclass, field

    TIMEFOLD_AVAILABLE = True
except ImportError as e:
    TIMEFOLD_AVAILABLE = False
    print(f"[BLOCKED] timefold import failed: {e}")
    print("Install JDK 17+ and run: pip install timefold==1.24.0b0")


if TIMEFOLD_AVAILABLE:
    # ---- Domain model ----

    @dataclass
    class Guard:
        id: str
        name: str
        qualifications: set[str]

    @planning_entity
    @dataclass
    class Shift:
        id: Annotated[str, PlanningId]
        site_id: str
        day: int
        start_hour: int
        duration_hours: int
        required_qualifications: set[str]
        guard: Annotated[Guard | None, PlanningVariable] = field(default=None)

    @planning_solution
    @dataclass
    class SecuritySchedule:
        guards: Annotated[list[Guard], ProblemFactCollectionProperty, ValueRangeProvider]
        shifts: Annotated[list[Shift], PlanningEntityCollectionProperty]
        score: Annotated[HardSoftScore | None, PlanningScore] = field(default=None)

    # ---- Constraints ----

    @constraint_provider
    def define_constraints(cf: ConstraintFactory):
        return [
            each_shift_must_have_qualified_guard(cf),
            no_overlapping_shifts_for_guard(cf),
            min_8_hours_rest_between_shifts(cf),
            max_40_hours_per_week(cf),
        ]

    def each_shift_must_have_qualified_guard(cf: ConstraintFactory):
        """Guard must have ALL qualifications required by the site."""
        return (
            cf.for_each(Shift)
            .filter(lambda s: not s.required_qualifications.issubset(
                s.guard.qualifications if s.guard else set()))
            .penalize(HardSoftScore.ONE_HARD)
            .as_constraint("Guard missing required qualification")
        )

    def no_overlapping_shifts_for_guard(cf: ConstraintFactory):
        """A guard cannot work two shifts that overlap in time."""
        return (
            cf.for_each_unique_pair(
                Shift,
                Joiners.equal(lambda s: s.guard.id if s.guard else None),
                Joiners.equal(lambda s: s.day),
            )
            .filter(lambda a, b: (
                a.start_hour < b.start_hour + b.duration_hours and
                b.start_hour < a.start_hour + a.duration_hours
            ))
            .penalize(HardSoftScore.ONE_HARD)
            .as_constraint("Overlapping shifts for same guard")
        )

    def min_8_hours_rest_between_shifts(cf: ConstraintFactory):
        """Guards must have at least 8 hours rest between consecutive shifts."""
        return (
            cf.for_each(Shift)
            .join(
                Shift,
                Joiners.equal(lambda s: s.guard.id if s.guard else None),
                Joiners.less_than_or_equal(
                    lambda s: s.day * 24 + s.start_hour + s.duration_hours,
                    lambda s: s.day * 24 + s.start_hour
                )
            )
            .filter(lambda a, b: (
                (b.day * 24 + b.start_hour) - (a.day * 24 + a.start_hour + a.duration_hours) < 8
            ))
            .penalize(HardSoftScore.ONE_HARD)
            .as_constraint("Less than 8h rest between shifts")
        )

    def max_40_hours_per_week(cf: ConstraintFactory):
        """Guards should not exceed 40 hours/week (soft: penalise excess)."""
        return (
            cf.for_each(Shift)
            .group_by(lambda s: s.guard.id if s.guard else "unassigned",
                      ConstraintCollectors.sum(lambda s: s.duration_hours))
            .filter(lambda guard_id, total: total > 40)
            .penalize(HardSoftScore.ONE_SOFT,
                      lambda guard_id, total: total - 40)
            .as_constraint("Guard exceeds 40h/week")
        )

    # ---- Build problem from shared-scheduling-input.json ----

    def build_problem() -> SecuritySchedule:
        guards = [
            Guard(id=g["id"], name=g["name"], qualifications=set(g["qualifications"]))
            for g in INPUT["guards"]
        ]

        site_quals = {s["id"]: set(s["required_qualifications"]) for s in INPUT["sites"]}

        shifts = []
        shift_id = 0
        for site in INPUT["sites"]:
            for day in range(INPUT["horizon_days"]):
                for start_hour, duration in [(0, 8), (8, 8), (16, 8)]:
                    shifts.append(Shift(
                        id=str(shift_id),
                        site_id=site["id"],
                        day=day,
                        start_hour=start_hour,
                        duration_hours=duration,
                        required_qualifications=site_quals[site["id"]]
                    ))
                    shift_id += 1

        print(f"Built problem: {len(shifts)} shifts, {len(guards)} guards")
        return SecuritySchedule(guards=guards, shifts=shifts)

    # ---- Solve ----

    def solve_and_report():
        problem = build_problem()

        solver_config = SolverConfig(
            solution_class=SecuritySchedule,
            entity_class_list=[Shift],
            score_director_factory_config=ScoreDirectorFactoryConfig(
                constraint_provider_function=define_constraints
            ),
            termination_config=TerminationConfig(
                spent_limit=Duration(seconds=30)
            )
        )

        solver = SolverFactory.create(solver_config).build_solver()

        tracemalloc.start()
        t0 = _time.perf_counter()
        solution = solver.solve(problem)
        elapsed = _time.perf_counter() - t0
        _, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        print(f"\n=== RESULTS ===")
        print(f"Wall time: {elapsed:.1f}s")
        print(f"Peak memory: {peak_mem / 1024 / 1024:.1f} MB")
        print(f"Score: {solution.score}")

        feasible = str(solution.score).startswith("0hard")
        print(f"Feasible (0 hard violations): {feasible}")

        print(f"\n{'Shift':>6} {'Site':>4} {'Day':>4} {'Start':>6} {'Guard'}")
        print("-" * 45)
        for s in sorted(solution.shifts, key=lambda x: (x.day, x.site_id, x.start_hour)):
            guard_name = s.guard.name if s.guard else "UNASSIGNED"
            print(f"{s.id:>6} {s.site_id:>4} {s.day:>4} {s.start_hour:>6}h  {guard_name}")

    solve_and_report()

else:
    print("\nSkipping solve — timefold not importable.")
    print("See research/04-timefold-demo.md for full analysis.")
