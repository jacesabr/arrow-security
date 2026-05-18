import { Network } from '@capacitor/network'
import { useAuthStore } from '../store/auth'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'
const QUEUE_KEY = 'secureops_offline_queue'

export interface QueuedOperation {
  id: string
  endpoint: string
  method: string
  payload: unknown
  enqueuedAt: string
  attemptCount: number
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function loadQueue(): QueuedOperation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedOperation[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function enqueue(endpoint: string, method: string, payload: unknown): string {
  const op: QueuedOperation = {
    id: generateId(),
    endpoint,
    method,
    payload,
    enqueuedAt: new Date().toISOString(),
    attemptCount: 0,
  }
  const queue = loadQueue()
  queue.push(op)
  saveQueue(queue)
  return op.id
}

export function getQueuedCount(): number {
  return loadQueue().length
}

async function executeOperation(op: QueuedOperation): Promise<boolean> {
  const token = useAuthStore.getState().token
  try {
    const res = await fetch(`${BASE_URL}${op.endpoint}`, {
      method: op.method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: op.payload ? JSON.stringify(op.payload) : undefined,
    })
    return res.ok || res.status === 409
  } catch {
    return false
  }
}

let draining = false

export async function drainQueue(): Promise<{ sent: number; failed: number }> {
  if (draining) return { sent: 0, failed: 0 }
  draining = true

  let sent = 0
  let failed = 0

  try {
    const queue = loadQueue()
    const remaining: QueuedOperation[] = []

    for (const op of queue) {
      op.attemptCount++
      const ok = await executeOperation(op)
      if (ok) {
        sent++
      } else if (op.attemptCount >= 5) {
        failed++
      } else {
        remaining.push(op)
      }
    }

    saveQueue(remaining)
  } finally {
    draining = false
  }

  return { sent, failed }
}

let networkListenerSetup = false

export function setupNetworkListener(onDrained?: (result: { sent: number; failed: number }) => void): void {
  if (networkListenerSetup) return
  networkListenerSetup = true

  Network.addListener('networkStatusChange', async (status) => {
    if (status.connected && getQueuedCount() > 0) {
      const result = await drainQueue()
      onDrained?.(result)
    }
  })

  Network.getStatus().then(async (status) => {
    if (status.connected && getQueuedCount() > 0) {
      const result = await drainQueue()
      onDrained?.(result)
    }
  }).catch(() => null)
}
