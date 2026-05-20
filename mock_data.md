# Mock Data Inventory

All seed data here was inserted on **2026-05-20** to exercise the dashboards
while we don't yet have real signups. Every row uses a `mock_` ID prefix so
it can be removed in one block. The bootstrap tenant row (`t_arrow_security`)
and the two pre-existing real-user admins (`john1`, `bob`) are NOT touched
by this file — only the mock_ prefixed rows are.

**Tenant:** `t_arrow_security` (Arrow Security, slug `acme`)
**Login password for all mock users:** `mock123`
**Hash format:** legacy SHA-256 (`sha256(password + PASSWORD_SALT)`). The
auth route accepts this and lazy-migrates to argon2 on first login.

---

## To wipe ALL mock data

Run this single transaction against Neon project `empty-hat-36729650`:

```sql
DELETE FROM shifts            WHERE id LIKE 'mock_%';
DELETE FROM supervisor_sites  WHERE supervisor_id LIKE 'mock_%' OR site_id LIKE 'mock_%';
DELETE FROM sites             WHERE id LIKE 'mock_%';
DELETE FROM clients           WHERE id LIKE 'mock_%';
DELETE FROM users             WHERE id LIKE 'mock_%';
```

Run in this order — children before parents — to satisfy the FK constraints.
You can also drop the dependent rows that point at mock users/sites first if
you've layered more data on top (attendance_records, patrols, incidents, etc.):

```sql
DELETE FROM attendance_records WHERE guard_id LIKE 'mock_%' OR shift_id LIKE 'mock_%';
DELETE FROM patrols            WHERE guard_id LIKE 'mock_%' OR shift_id LIKE 'mock_%';
DELETE FROM incidents          WHERE reported_by LIKE 'mock_%' OR site_id LIKE 'mock_%';
DELETE FROM guard_locations    WHERE guard_id LIKE 'mock_%';
DELETE FROM leave_requests     WHERE user_id LIKE 'mock_%';
-- then the block above
```

---

## Clients (4)

| ID | Name | Contact |
|----|------|---------|
| `mock_c_tcs` | Tata Consultancy Services | Ramesh Iyer · ramesh.iyer@tcs.example |
| `mock_c_reliance` | Reliance Industries | Manish Shah · security@reliance.example |
| `mock_c_icici` | ICICI Bank | Sunita Kapoor · s.kapoor@icicibank.example |
| `mock_c_tata_consumer` | Tata Consumer Products | Vikash Menon · v.menon@tataconsumer.example |

## Sites (6)

| ID | Name | Client | Lat/Lng | Geofence |
|----|------|--------|---------|----------|
| `mock_s_bkc` | TCS BKC Tower 1 | TCS | 19.0613, 72.8702 | 250m |
| `mock_s_whitefield` | TCS Whitefield Campus | TCS | 12.9698, 77.7500 | 300m |
| `mock_s_cp` | ICICI CP Branch | ICICI | 28.6334, 77.2197 | 150m |
| `mock_s_hinjewadi` | Reliance Hinjewadi DC | Reliance | 18.5912, 73.7387 | 400m |
| `mock_s_omr` | Tata Consumer OMR Plant | Tata Consumer | 12.9010, 80.2279 | 350m |
| `mock_s_hitec` | Reliance HITEC City Office | Reliance | 17.4452, 78.3777 | 200m |

## Users (15)

### Managers — `tenant_admin` (2)
| ID / username | Name |
|---|---|
| `mock_mgr_amit` | Amit Bhattacharya |
| `mock_mgr_neha` | Neha Krishnan |

### Supervisors (3)
| ID / username | Name | Covers |
|---|---|---|
| `mock_sup_anita`  | Anita Desai   | TCS BKC + Whitefield |
| `mock_sup_kiran`  | Kiran Rao     | ICICI CP + Reliance Hinjewadi |
| `mock_sup_devraj` | Devraj Pillai | Tata Consumer OMR + Reliance HITEC City |

### Guards (10)
| ID / username | Name | Face enrolled |
|---|---|---|
| `mock_g_arjun`   | Arjun Sharma     | ✓ |
| `mock_g_meera`   | Meera Patel      | ✓ |
| `mock_g_rahul`   | Rahul Mehta      | ✓ |
| `mock_g_sneha`   | Sneha Reddy      | ✗ |
| `mock_g_vikram`  | Vikram Singh     | ✓ |
| `mock_g_priya`   | Priya Nair       | ✓ |
| `mock_g_kunal`   | Kunal Joshi      | ✗ |
| `mock_g_aisha`   | Aisha Khan       | ✓ |
| `mock_g_sandeep` | Sandeep Verma    | ✓ |
| `mock_g_pooja`   | Pooja Iyengar    | ✗ |

## Supervisor → Site assignments (6 rows)

`mock_sup_anita`  → `mock_s_bkc`, `mock_s_whitefield`
`mock_sup_kiran`  → `mock_s_cp`, `mock_s_hinjewadi`
`mock_sup_devraj` → `mock_s_omr`, `mock_s_hitec`

## Shifts (21)

All times are `NOW() ± INTERVAL` so they stay realistic as the DB ages. The
mix is deliberately tuned to exercise every dashboard widget — especially
the new "missing from shift" insight (the 4 rows below where status is
scheduled/missed but the shift window is currently open).

### Completed past shifts (6) — status `completed`
| ID | Guard | Site | When (relative) |
|---|---|---|---|
| `mock_sh_c1` | Arjun  | BKC        | yesterday 8h shift |
| `mock_sh_c2` | Meera  | BKC        | yesterday 8h shift (next slot) |
| `mock_sh_c3` | Rahul  | Whitefield | yesterday 8h shift |
| `mock_sh_c4` | Sneha  | CP         | 2 days ago 8h shift |
| `mock_sh_c5` | Vikram | Hinjewadi  | 2 days ago 8h shift |
| `mock_sh_c6` | Priya  | OMR        | 3 days ago 8h shift |

### Missed past shifts (3) — status `missed`
| ID | Guard | Site | When | Notes |
|---|---|---|---|---|
| `mock_sh_m1` | Kunal  | HITEC | yesterday  | No show — phone unreachable |
| `mock_sh_m2` | Aisha  | BKC   | 2 days ago | Called in sick after shift started |
| `mock_sh_m3` | Pooja  | CP    | 3 days ago | No show, no contact |

### Currently active shifts (3) — status `active`
| ID | Guard | Site | Started | Ends |
|---|---|---|---|---|
| `mock_sh_a1` | Arjun  | BKC        | 3h ago | in 5h |
| `mock_sh_a2` | Rahul  | Whitefield | 2h ago | in 6h |
| `mock_sh_a3` | Vikram | Hinjewadi  | 4h ago | in 4h |

### Currently MISSING from shift (4) — exercises the new insight
Status is `scheduled` or `missed` but the shift window is open right now —
shows up under "Guards missing from shift" for supervisors + admins.

| ID | Guard | Site | Started | Ends | Status |
|---|---|---|---|---|---|
| `mock_sh_ms1` | Meera | BKC   | 2h ago | in 6h | scheduled |
| `mock_sh_ms2` | Sneha | CP    | 1h ago | in 7h | scheduled |
| `mock_sh_ms3` | Kunal | OMR   | 4h ago | in 4h | missed |
| `mock_sh_ms4` | Pooja | HITEC | 3h ago | in 5h | scheduled |

### Future scheduled shifts (5) — status `scheduled`
| ID | Guard | Site | When |
|---|---|---|---|
| `mock_sh_f1` | Arjun   | BKC        | tomorrow 8h shift |
| `mock_sh_f2` | Meera   | Whitefield | tomorrow 8h shift |
| `mock_sh_f3` | Aisha   | CP         | tomorrow 8h shift |
| `mock_sh_f4` | Sandeep | Hinjewadi  | day after tomorrow 8h shift |
| `mock_sh_f5` | Priya   | OMR        | day after tomorrow 8h shift |
