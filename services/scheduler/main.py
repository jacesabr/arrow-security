from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from ortools.sat.python import cp_model
import time

app = FastAPI(title="Arrow Security Scheduler", version="1.0.0")


class Guard(BaseModel):
    id: str
    site_ids: list[str]          # sites this guard is qualified for
    max_hours_per_week: int = 48


class Shift(BaseModel):
    id: str
    site_id: str
    day: int                     # 0=Mon ... 6=Sun
    start_hour: int
    duration_hours: int


class ScheduleRequest(BaseModel):
    guards: list[Guard]
    shifts: list[Shift]
    max_solve_seconds: int = 5


class Assignment(BaseModel):
    shift_id: str
    guard_id: str


class ScheduleResponse(BaseModel):
    status: str                  # "optimal" | "feasible" | "infeasible" | "timeout"
    assignments: list[Assignment]
    solve_ms: int
    gaps: list[str]              # shift_ids with no assigned guard


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/solve", response_model=ScheduleResponse)
def solve(req: ScheduleRequest):
    if not req.guards or not req.shifts:
        raise HTTPException(status_code=400, detail="guards and shifts must be non-empty")

    model = cp_model.CpModel()
    g_idx = {g.id: i for i, g in enumerate(req.guards)}
    s_idx = {s.id: i for i, s in enumerate(req.shifts)}

    # x[g][s] = 1 if guard g is assigned to shift s
    x = {}
    for g in req.guards:
        for s in req.shifts:
            if s.site_id in g.site_ids:
                x[g.id, s.id] = model.new_bool_var(f"x_{g.id}_{s.id}")

    # Each shift gets at most one guard
    for s in req.shifts:
        model.add_at_most_one(
            x[g.id, s.id] for g in req.guards if (g.id, s.id) in x
        )

    # Each guard works at most max_hours_per_week
    for g in req.guards:
        model.add(
            sum(
                x[g.id, s.id] * s.duration_hours
                for s in req.shifts if (g.id, s.id) in x
            ) <= g.max_hours_per_week
        )

    # No guard works two overlapping shifts on the same day
    for g in req.guards:
        for day in range(7):
            day_shifts = [s for s in req.shifts if s.day == day and (g.id, s.id) in x]
            for i, s1 in enumerate(day_shifts):
                for s2 in day_shifts[i + 1:]:
                    # Overlap if intervals intersect
                    s1_end = s1.start_hour + s1.duration_hours
                    s2_end = s2.start_hour + s2.duration_hours
                    if s1.start_hour < s2_end and s2.start_hour < s1_end:
                        model.add(x[g.id, s1.id] + x[g.id, s2.id] <= 1)

    # Maximise coverage (sum of assigned shifts)
    model.maximize(sum(x.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = req.max_solve_seconds

    t0 = time.monotonic()
    status_code = solver.solve(model)
    solve_ms = int((time.monotonic() - t0) * 1000)

    status_map = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.UNKNOWN: "timeout",
    }
    status = status_map.get(status_code, "timeout")

    assignments: list[Assignment] = []
    gaps: list[str] = []

    if status in ("optimal", "feasible"):
        assigned_shifts: set[str] = set()
        for (gid, sid), var in x.items():
            if solver.value(var):
                assignments.append(Assignment(shift_id=sid, guard_id=gid))
                assigned_shifts.add(sid)
        gaps = [s.id for s in req.shifts if s.id not in assigned_shifts]
    else:
        gaps = [s.id for s in req.shifts]

    return ScheduleResponse(
        status=status,
        assignments=assignments,
        solve_ms=solve_ms,
        gaps=gaps,
    )
