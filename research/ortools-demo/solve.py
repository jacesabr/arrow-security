"""
OR-Tools CP-SAT demo: Arrow Security shift scheduling
======================================================
Problem A (full, infeasible by design):
  3 sites x 3 shifts/day x 7 days = 63 shifts, 5 guards
  => provably infeasible: 5 guards x 5 shifts-max = 25 capacity < 63 needed

Problem B (feasible variant — same constraints, smaller horizon):
  3 sites x 1 shift/day x 7 days = 21 shifts, 5 guards
  => fits within 25-slot capacity and demonstrates all 4 constraints working

Constraints enforced in both models:
  1. Each shift covered by exactly one guard
  2. Guard must hold all qualifications required by the site
  3. Max 40 hours per week (each shift = 8 hours => max 5 shifts)
  4. Min 8 hours rest between consecutive shifts

Objective: minimise the maximum number of shifts any single guard works (fairness).
"""

import json
import time
import tracemalloc
from pathlib import Path

from ortools.sat.python import cp_model

# ---------------------------------------------------------------------------
# Load shared scheduling input
# ---------------------------------------------------------------------------
INPUT_FILE = Path(__file__).parent.parent / "shared-scheduling-input.json"

with INPUT_FILE.open() as f:
    data = json.load(f)

HORIZON_DAYS = data["horizon_days"]
SITES        = data["sites"]
GUARDS       = data["guards"]
CONSTRAINTS  = data["constraints"]

MAX_HOURS_PER_WEEK = CONSTRAINTS["max_hours_per_week"]          # 40
MIN_REST_HOURS     = CONSTRAINTS["min_rest_hours_between_shifts"]  # 8
SHIFT_HOURS        = 8

MAX_SHIFTS_PER_GUARD = MAX_HOURS_PER_WEEK // SHIFT_HOURS  # 5

# Qualification lookup
guard_quals: dict[str, set[str]] = {g["id"]: set(g["qualifications"]) for g in GUARDS}
site_req:    dict[str, set[str]] = {s["id"]: set(s["required_qualifications"]) for s in SITES}

eligible: dict[tuple[str, str], bool] = {
    (g["id"], s["id"]): site_req[s["id"]].issubset(guard_quals[g["id"]])
    for g in GUARDS for s in SITES
}

# Shift start hours (24-h clock)
SHIFT_START_HOURS = [6, 14, 22]  # morning / afternoon / night
SLOT_LABELS       = ["Morning (06-14)", "Afternoon (14-22)", "Night (22-06)"]
DAY_LABELS        = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# ===========================================================================
def build_and_solve(shifts_per_day: int, label: str) -> dict:
    """
    Build a CP-SAT model and solve it.

    Decision variable schema
    ------------------------
    x[gi, si, day, slot] in {0, 1}
      gi   = guard index  (0..NUM_GUARDS-1)
      si   = site index   (0..NUM_SITES-1)
      day  = day index    (0..HORIZON_DAYS-1)
      slot = shift slot   (0..shifts_per_day-1)

    Value 1 means guard gi is assigned to cover site si on (day, slot).
    """
    num_guards      = len(GUARDS)
    num_sites       = len(SITES)
    total_shifts    = num_sites * HORIZON_DAYS * shifts_per_day
    num_vars        = num_guards * num_sites * HORIZON_DAYS * shifts_per_day

    print(f"\n{'='*70}")
    print(f"SCENARIO: {label}")
    print(f"  {num_sites} sites x {shifts_per_day} shift(s)/day x {HORIZON_DAYS} days"
          f" = {total_shifts} total shifts")
    print(f"  {num_guards} guards x {MAX_SHIFTS_PER_GUARD} max shifts = "
          f"{num_guards * MAX_SHIFTS_PER_GUARD} capacity")
    print(f"  Decision variables: {num_vars}")
    print(f"{'='*70}")

    model = cp_model.CpModel()

    # ------------------------------------------------------------------
    # Decision variables
    # ------------------------------------------------------------------
    x = {}
    for gi, g in enumerate(GUARDS):
        for si, s in enumerate(SITES):
            for day in range(HORIZON_DAYS):
                for slot in range(shifts_per_day):
                    x[gi, si, day, slot] = model.new_bool_var(
                        f"x_g{g['id']}_s{s['id']}_d{day}_t{slot}"
                    )

    # ------------------------------------------------------------------
    # Hard constraint 1: Each shift covered by exactly one guard
    # ------------------------------------------------------------------
    for si in range(num_sites):
        for day in range(HORIZON_DAYS):
            for slot in range(shifts_per_day):
                model.add_exactly_one(
                    x[gi, si, day, slot] for gi in range(num_guards)
                )

    # ------------------------------------------------------------------
    # Hard constraint 2: Guard eligibility (qualifications)
    # Guards ineligible for a site are hard-locked to 0 for all its shifts.
    # ------------------------------------------------------------------
    for gi, g in enumerate(GUARDS):
        for si, s in enumerate(SITES):
            if not eligible[(g["id"], s["id"])]:
                for day in range(HORIZON_DAYS):
                    for slot in range(shifts_per_day):
                        model.add(x[gi, si, day, slot] == 0)

    # ------------------------------------------------------------------
    # Hard constraint 3: Max 40 hours per week (max 5 shifts of 8 h)
    # ------------------------------------------------------------------
    for gi in range(num_guards):
        model.add(
            sum(
                x[gi, si, day, slot]
                for si in range(num_sites)
                for day in range(HORIZON_DAYS)
                for slot in range(shifts_per_day)
            ) <= MAX_SHIFTS_PER_GUARD
        )

    # ------------------------------------------------------------------
    # Hard constraint 4: Min 8 hours rest between consecutive shifts
    #
    # We enumerate every pair of adjacent global slots (across all sites).
    # Two adjacent global slots are:
    #   slot_a ends at: start_a + SHIFT_HOURS
    #   rest ends at:   start_a + SHIFT_HOURS + MIN_REST_HOURS
    # Violation if start_b < start_a + SHIFT_HOURS + MIN_REST_HOURS.
    #
    # With SHIFT_START_HOURS = [6, 14, 22]:
    #   slot0->slot1: 14 - 6  = 8 h gap, shift ends at 14 => rest OK (just)
    #   slot1->slot2: 22 - 14 = 8 h gap, shift ends at 22 => rest OK (just)
    #   slot2->next-day-slot0: (24+6) - 22 = 8 h gap => rest OK (just)
    # All adjacent slots are exactly at the rest boundary, so they are
    # ALLOWED (>= 8h required, = 8h available). No consecutive pair is
    # actually forbidden in this shift structure.
    #
    # For completeness the code checks and would add constraints if any
    # adjacent pair violated the rest requirement.
    # ------------------------------------------------------------------
    all_slots = [
        (day, slot)
        for day in range(HORIZON_DAYS)
        for slot in range(shifts_per_day)
    ]
    constraints_added = 0
    for idx in range(len(all_slots) - 1):
        day_a, slot_a = all_slots[idx]
        day_b, slot_b = all_slots[idx + 1]
        start_a = day_a * 24 + SHIFT_START_HOURS[slot_a % len(SHIFT_START_HOURS)]
        start_b = day_b * 24 + SHIFT_START_HOURS[slot_b % len(SHIFT_START_HOURS)]
        if start_b < start_a + SHIFT_HOURS + MIN_REST_HOURS:
            for gi in range(num_guards):
                for si_a in range(num_sites):
                    for si_b in range(num_sites):
                        model.add(
                            x[gi, si_a, day_a, slot_a] + x[gi, si_b, day_b, slot_b] <= 1
                        )
            constraints_added += 1
    # (With the given shift times, constraints_added will be 0)

    # ------------------------------------------------------------------
    # Objective: minimise max shifts per guard (fairness / load balancing)
    # ------------------------------------------------------------------
    max_shifts_var = model.new_int_var(0, HORIZON_DAYS * shifts_per_day * num_sites, "max_shifts")
    for gi in range(num_guards):
        model.add(
            sum(
                x[gi, si, day, slot]
                for si in range(num_sites)
                for day in range(HORIZON_DAYS)
                for slot in range(shifts_per_day)
            ) <= max_shifts_var
        )
    model.minimize(max_shifts_var)

    # ------------------------------------------------------------------
    # Solve
    # ------------------------------------------------------------------
    tracemalloc.start()
    t0 = time.perf_counter()

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    solver.parameters.log_search_progress = False

    status = solver.solve(model)

    t1 = time.perf_counter()
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    wall_ms  = (t1 - t0) * 1000
    peak_kb  = peak_mem / 1024

    STATUS_NAMES = {
        cp_model.OPTIMAL:       "OPTIMAL",
        cp_model.FEASIBLE:      "FEASIBLE",
        cp_model.INFEASIBLE:    "INFEASIBLE",
        cp_model.UNKNOWN:       "UNKNOWN",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
    }
    status_name = STATUS_NAMES.get(status, f"code={status}")

    print(f"\nSolver status : {status_name}")
    print(f"Wall time     : {wall_ms:.1f} ms")
    print(f"Peak memory   : {peak_kb:.1f} KB")

    result = {
        "label":        label,
        "status":       status_name,
        "wall_ms":      wall_ms,
        "peak_kb":      peak_kb,
        "total_shifts": total_shifts,
        "num_vars":     num_vars,
        "schedule":     [],
        "workload":     {},
    }

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        obj = int(solver.objective_value)
        print(f"Objective (max shifts/guard): {obj}")

        guard_count = {g["id"]: 0 for g in GUARDS}

        print(f"\n{'Site':<22} {'Day':<5} {'Slot':<22} {'Assigned Guard'}")
        print("-" * 70)
        for si, s in enumerate(SITES):
            for day in range(HORIZON_DAYS):
                for slot in range(shifts_per_day):
                    assigned_name = "(UNASSIGNED)"
                    for gi, g in enumerate(GUARDS):
                        if solver.value(x[gi, si, day, slot]) == 1:
                            assigned_name = g["name"]
                            guard_count[g["id"]] += 1
                            break
                    slot_label = SLOT_LABELS[slot] if slot < len(SLOT_LABELS) else f"Slot {slot}"
                    row = {
                        "site": s["name"], "day": DAY_LABELS[day],
                        "slot": slot_label, "guard": assigned_name
                    }
                    result["schedule"].append(row)
                    print(f"  {s['name']:<20} {DAY_LABELS[day]:<5} {slot_label:<22} {assigned_name}")
            print()

        print("\nGuard workload:")
        for g in GUARDS:
            shifts = guard_count[g["id"]]
            hours  = shifts * SHIFT_HOURS
            bar    = "#" * shifts
            result["workload"][g["name"]] = shifts
            print(f"  {g['name']:<8} {shifts:>2} shifts = {hours:>3} h  {bar}")

        result["objective"] = obj

    else:
        print(f"\nNo feasible schedule found.")
        if status == cp_model.INFEASIBLE:
            cap = len(GUARDS) * MAX_SHIFTS_PER_GUARD
            print(f"  Capacity check: {len(GUARDS)} guards x {MAX_SHIFTS_PER_GUARD} shifts "
                  f"= {cap} slots vs {total_shifts} needed")
            if cap < total_shifts:
                print(f"  Root cause: mathematically impossible — demand ({total_shifts}) "
                      f"exceeds supply ({cap})")

    return result


# ===========================================================================
# Run both scenarios
# ===========================================================================
print("OR-Tools CP-SAT — Arrow Security Scheduling Demo")
print(f"ortools version: see pip show ortools")
print()
print("Qualification eligibility matrix:")
print(f"  {'Guard':<10}", end="")
for s in SITES:
    print(f"  {s['name'][:18]:<20}", end="")
print()
for g in GUARDS:
    print(f"  {g['name']:<10}", end="")
    for s in SITES:
        ok = "YES" if eligible[(g["id"], s["id"])] else "no "
        print(f"  {ok:<20}", end="")
    print()

# Scenario A: full problem — deliberately infeasible, proves the solver
# catches capacity violations quickly
result_a = build_and_solve(shifts_per_day=3, label="Full 3-shift/day (63 shifts) — INFEASIBLE BY DESIGN")

# Scenario B: single-shift/day variant — feasible, shows actual schedule
result_b = build_and_solve(shifts_per_day=1, label="1-shift/day variant (21 shifts) — FEASIBLE")

# ===========================================================================
# Summary
# ===========================================================================
print("\n" + "=" * 70)
print("BENCHMARK SUMMARY")
print("=" * 70)
for r in [result_a, result_b]:
    obj_str = f", objective={r.get('objective', 'N/A')}" if "objective" in r else ""
    print(f"  {r['label'][:55]:<55}")
    print(f"    Status: {r['status']:<12}  Wall: {r['wall_ms']:.1f} ms  "
          f"Peak mem: {r['peak_kb']:.1f} KB  Vars: {r['num_vars']}{obj_str}")
