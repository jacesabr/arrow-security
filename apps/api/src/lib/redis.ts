import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

function makeClient(name: string): Redis {
  let warned = false

  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: false,
    maxRetriesPerRequest: 0,
    // Exponential backoff — 1s, 2s, 4s … capped at 30s. After 10 attempts (~2 min) stop.
    retryStrategy: (times: number) => {
      if (times > 10) return null
      return Math.min(1000 * 2 ** (times - 1), 30000)
    },
  })

  client.on('error', (err: Error) => {
    if (!warned) {
      console.warn(`[redis:${name}] unavailable — SSE pub/sub disabled: ${err.message}`)
      warned = true
    }
  })

  return client
}

/** Singleton publisher — shared across all requests */
export const redisPublisher: Redis = makeClient('publisher')

/**
 * Creates a fresh ioredis client for use as a subscriber.
 * ioredis enters "subscriber mode" once subscribe() is called, so each SSE
 * connection must own its own instance.
 */
export function createSubscriber(): Redis {
  return makeClient('subscriber')
}
