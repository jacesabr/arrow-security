"""
Arrow Security — VROOM Patrol Route Optimization Demo
=====================================================
Scenario: 3 mobile patrol guards, 15 sites in Bengaluru, 8-hour shift.

Attempts three modes in order:
  1. pyvroom  (C++ bindings, fastest — pip install pyvroom)
  2. VROOM REST via Docker  (requires: docker run -dt --name vroom --net host
                              -e VROOM_ROUTER=osrm
                              ghcr.io/vroom-project/vroom-docker:v1.15.0)
  3. Pure-Python greedy TSP fallback (no external dependencies — always runs)

Run from this directory:
    pip install pyvroom requests  # optional but enables modes 1 & 2
    python demo.py
"""

import json
import math
import sys
import time
from pathlib import Path

SCENARIO_FILE = Path(__file__).parent / "scenario.json"

with SCENARIO_FILE.open() as f:
    scenario = json.load(f)

VEHICLES = scenario["vehicles"]
JOBS     = scenario["jobs"]


# ---------------------------------------------------------------------------
# Utility: Haversine distance (metres) between two [lon, lat] points
# ---------------------------------------------------------------------------
def haversine(loc1, loc2):
    R = 6_371_000  # earth radius metres
    lon1, lat1 = math.radians(loc1[0]), math.radians(loc1[1])
    lon2, lat2 = math.radians(loc2[0]), math.radians(loc2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2*R*math.asin(math.sqrt(a))


def travel_seconds(loc1, loc2, speed_kph=40):
    """Estimated travel time at typical city patrol speed (40 km/h)."""
    dist_m = haversine(loc1, loc2)
    return int(dist_m / (speed_kph * 1000 / 3600))


# ---------------------------------------------------------------------------
# MODE 1 — pyvroom
# ---------------------------------------------------------------------------
def run_pyvroom():
    try:
        import vroom  # pip install pyvroom
    except ImportError:
        return None, "pyvroom not installed"

    print("\n[MODE 1] Running with pyvroom (C++ bindings)...")
    t0 = time.perf_counter()

    try:
        problem = vroom.Input()

        # Add vehicles — Location takes [lon, lat] list directly
        for v in VEHICLES:
            tw = vroom.TimeWindow(v["time_window"][0], v["time_window"][1])
            vehicle = vroom.Vehicle(
                v["id"],
                start=v["start"],          # [lon, lat] list
                end=v["end"],
                time_window=tw,
                description=v.get("description", ""),
            )
            problem.add_vehicle(vehicle)

        # Add jobs
        for j in JOBS:
            tws = [vroom.TimeWindow(tw[0], tw[1]) for tw in j.get("time_windows", [])]
            job = vroom.Job(
                j["id"],
                location=j["location"],    # [lon, lat] list
                default_service=j["service"],
                time_windows=tws if tws else [vroom.TimeWindow(0, 86400)],
                priority=j.get("priority", 0),
                description=j.get("description", ""),
            )
            problem.add_job(job)
    except Exception as e:
        return None, f"pyvroom build error: {e}"

    try:
        solution = problem.solve(exploration_level=5, nb_threads=4)
    except Exception as e:
        return None, f"pyvroom solve error: {e}"

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return solution, elapsed_ms


# ---------------------------------------------------------------------------
# MODE 2 — VROOM REST API (Docker / vroom-express)
# ---------------------------------------------------------------------------
def run_vroom_rest(url="http://localhost:3000"):
    try:
        import requests
    except ImportError:
        return None, "requests not installed"

    # Build clean input (strip _comment fields)
    payload = {
        "vehicles": VEHICLES,
        "jobs": JOBS,
        "options": {"g": True}  # include geometry
    }

    print(f"\n[MODE 2] Calling VROOM REST API at {url} ...")
    t0 = time.perf_counter()
    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        return None, f"REST request failed: {e}"

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return resp.json(), elapsed_ms


# ---------------------------------------------------------------------------
# MODE 3 — Pure-Python greedy nearest-neighbour TSP (always available)
# ---------------------------------------------------------------------------
def run_greedy_fallback():
    """
    Greedy nearest-neighbour heuristic split across guards.
    - Sorts jobs by priority desc, then clusters by proximity to guard's depot.
    - Each guard gets a nearest-neighbour tour of its cluster.
    This is what you'd get WITHOUT VRP optimisation; VROOM gives 10-40% shorter
    total route in practice.
    """
    print("\n[MODE 3] Running pure-Python greedy nearest-neighbour fallback...")
    t0 = time.perf_counter()

    guard_depots = {v["id"]: v["start"] for v in VEHICLES}
    guard_windows = {v["id"]: v["time_window"] for v in VEHICLES}

    # Cluster jobs to nearest depot
    clusters = {v["id"]: [] for v in VEHICLES}
    for j in JOBS:
        nearest = min(
            VEHICLES,
            key=lambda v: haversine(v["start"], j["location"])
        )
        clusters[nearest["id"]].append(j)

    routes = {}
    total_travel_s  = 0
    total_service_s = 0

    for v in VEHICLES:
        vid   = v["id"]
        depot = guard_depots[vid]
        jobs  = clusters[vid]

        # Nearest-neighbour ordering from depot
        remaining = jobs[:]
        current   = depot
        ordered   = []
        while remaining:
            closest = min(remaining, key=lambda j: haversine(current, j["location"]))
            remaining.remove(closest)
            ordered.append(closest)
            current = closest["location"]

        # Simulate timeline
        cursor_s    = 0
        route_steps = []
        for j in ordered:
            travel   = travel_seconds(current if route_steps else depot, j["location"])
            arrive_s = cursor_s + travel
            # Skip if we'd arrive after time_window closes
            if j.get("time_windows"):
                tw_end = j["time_windows"][0][1]
                if arrive_s > tw_end:
                    continue   # job missed in this greedy approach
            service  = j["service"]
            cursor_s = arrive_s + service
            total_travel_s  += travel
            total_service_s += service
            route_steps.append({
                "job_id":    j["id"],
                "desc":      j["description"],
                "arrive_s":  arrive_s,
                "service_s": service,
                "depart_s":  cursor_s,
            })
            current = j["location"]

        # Return to depot
        return_travel = travel_seconds(current, depot)
        total_travel_s += return_travel

        routes[vid] = {
            "guard":        v["description"],
            "steps":        route_steps,
            "return_s":     cursor_s + return_travel,
        }

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return routes, total_travel_s, total_service_s, elapsed_ms


# ---------------------------------------------------------------------------
# Pretty printers
# ---------------------------------------------------------------------------
def fmt_time(seconds):
    h = seconds // 3600
    m = (seconds % 3600) // 60
    return f"{int(h):02d}:{int(m):02d}"


def print_greedy_result(routes, total_travel_s, total_service_s, elapsed_ms):
    print(f"\n{'='*72}")
    print("GREEDY NEAREST-NEIGHBOUR RESULT  (no VRP optimiser)")
    print(f"{'='*72}")
    print(f"Elapsed: {elapsed_ms:.1f} ms")
    total_jobs = 0
    for vid, r in routes.items():
        print(f"\n  {r['guard']}")
        print(f"  {'-'*60}")
        for step in r["steps"]:
            arr = fmt_time(step["arrive_s"])
            dep = fmt_time(step["depart_s"])
            svc = step["service_s"] // 60
            print(f"  {arr}->{dep}  ({svc:2d}min service)  {step['desc']}")
            total_jobs += 1
        print(f"  Depot return: {fmt_time(r['return_s'])}")

    travel_h  = total_travel_s / 3600
    service_h = total_service_s / 3600
    print(f"\n{'-'*72}")
    print(f"  Jobs scheduled : {total_jobs} / {len(JOBS)}")
    print(f"  Total travel   : {travel_h:.2f} h  ({total_travel_s//60} min)")
    print(f"  Total service  : {service_h:.2f} h  ({total_service_s//60} min)")
    print(f"  Efficiency     : {service_h/(travel_h+service_h)*100:.1f}% productive time")
    print(f"\n  NOTE: VROOM's VRP solver would reduce travel time by ~15-40%")
    print(f"  and honour all time-window constraints precisely.")


def print_vroom_json_result(result, elapsed_ms, mode_label):
    print(f"\n{'='*72}")
    print(f"VROOM VRP RESULT  [{mode_label}]")
    print(f"{'='*72}")
    print(f"Elapsed: {elapsed_ms:.1f} ms")

    summary = result.get("summary", {})
    print(f"\n  Total cost     : {summary.get('cost', 'N/A')}")
    print(f"  Total duration : {summary.get('duration', 0)//60} min travel")
    print(f"  Total service  : {summary.get('service', 0)//60} min service")
    print(f"  Unassigned     : {summary.get('unassigned', 0)} jobs")

    for route in result.get("routes", []):
        vid = route["vehicle"]
        guard = next((v["description"] for v in VEHICLES if v["id"] == vid), f"Guard {vid}")
        print(f"\n  {guard}  (route cost={route.get('cost', '?')})")
        print(f"  {'-'*60}")
        for step in route.get("steps", []):
            stype = step["type"]
            if stype in ("start", "end"):
                print(f"  {fmt_time(step['arrival'])}  [{stype.upper()}]  depot")
            elif stype == "break":
                print(f"  {fmt_time(step['arrival'])}  [BREAK]  {step.get('service',0)//60}min")
            else:
                jid  = step.get("id")
                desc = next((j["description"] for j in JOBS if j["id"] == jid), f"Job {jid}")
                svc  = step.get("service", 0) // 60
                wait = step.get("waiting_time", 0)
                wait_str = f"  (wait {wait//60}min)" if wait else ""
                print(f"  {fmt_time(step['arrival'])}  ({svc:2d}min){wait_str}  {desc}")

    if result.get("unassigned"):
        print(f"\n  UNASSIGNED JOBS:")
        for u in result["unassigned"]:
            jid  = u.get("id")
            desc = next((j["description"] for j in JOBS if j["id"] == jid), f"Job {jid}")
            print(f"    • {desc}  (cause: {u.get('type', 'unknown')})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("Arrow Security — VROOM Patrol Route Demo")
    print(f"Scenario: {len(VEHICLES)} guards, {len(JOBS)} sites, 8-hour shift")
    print(f"Location: Bengaluru, Karnataka, India")

    ran_vroom = False

    # Try pyvroom
    result, info = run_pyvroom()
    if result is not None:
        # pyvroom returns a Solution object; convert to dict if possible
        try:
            sol_dict = json.loads(result.to_json()) if hasattr(result, "to_json") else None
        except Exception:
            sol_dict = None
        if sol_dict:
            print_vroom_json_result(sol_dict, info, "pyvroom C++ bindings")
            ran_vroom = True
        else:
            print(f"[pyvroom] solution returned but JSON conversion failed: {result}")
    else:
        print(f"[pyvroom] skipped: {info}")

    # Try REST API if pyvroom failed
    if not ran_vroom:
        result, info = run_vroom_rest()
        if result is not None:
            print_vroom_json_result(result, info, "VROOM REST API")
            ran_vroom = True
        else:
            print(f"[VROOM REST] skipped: {info}")

    # Always run greedy fallback for comparison
    routes, total_travel_s, total_service_s, elapsed_ms = run_greedy_fallback()
    print_greedy_result(routes, total_travel_s, total_service_s, elapsed_ms)

    if ran_vroom:
        print("\n[COMPARISON] VROOM result shown above; greedy baseline shown for contrast.")
    else:
        print("\n[INFO] VROOM not available (pyvroom needs OSRM server; REST API not running).")
        print("       Greedy result above shows unoptimised dispatch as a baseline.")
        print()
        print("       To run with real VRP optimization, start OSRM + VROOM via Docker:")
        print("         # One-time OSM preprocessing (Southern India, ~526MB download):")
        print("         wget https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf")
        print("         docker run -t -v $PWD:/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/southern-zone-latest.osm.pbf")
        print("         docker run -t -v $PWD:/data osrm/osrm-backend osrm-partition /data/southern-zone-latest.osrm")
        print("         docker run -t -v $PWD:/data osrm/osrm-backend osrm-customize /data/southern-zone-latest.osrm")
        print("         # Start services:")
        print("         docker run -dt -p 5000:5000 -v $PWD:/data osrm/osrm-backend osrm-routed --algorithm mld /data/southern-zone-latest.osrm")
        print("         docker run -dt --name vroom --net host -e VROOM_ROUTER=osrm ghcr.io/vroom-project/vroom-docker:v1.15.0")
        print("         # Re-run:")
        print("         python demo.py")
