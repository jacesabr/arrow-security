import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

function makeClient(name: string): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: false,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  })

  client.on('error', (err: Error) => {
    // Log but do not crash — degrade gracefully if Redis is unreachable
    console.warn(`[redis:${name}] connection error: ${err.message}`)
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
