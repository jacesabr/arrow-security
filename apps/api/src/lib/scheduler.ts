const SCHEDULER_URL = process.env.SCHEDULER_URL ?? 'http://localhost:8080'

export interface Guard { id: string; site_ids: string[]; max_hours_per_week?: number }
export interface Shift { id: string; site_id: string; day: number; start_hour: number; duration_hours: number }
export interface ScheduleRequest { guards: Guard[]; shifts: Shift[]; max_solve_seconds?: number }
export interface Assignment { shift_id: string; guard_id: string }
export interface ScheduleResponse { status: string; assignments: Assignment[]; solve_ms: number; gaps: string[] }

export async function solveSchedule(req: ScheduleRequest): Promise<ScheduleResponse> {
  const res = await fetch(`${SCHEDULER_URL}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Scheduler error: ${res.status}`)
  return res.json() as Promise<ScheduleResponse>
}
