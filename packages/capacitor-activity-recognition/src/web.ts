import { WebPlugin } from '@capacitor/core'
import type {
  ActivityRecognitionPlugin,
  CurrentActivity,
} from './definitions'

/**
 * Web shim — no browser API exposes activity classification, so we always
 * return `unknown` with confidence 0. The mobile classifier treats this as
 * "no tiebreaker available" and falls back to GPS-speed-only classification.
 */
export class ActivityRecognitionWeb
  extends WebPlugin
  implements ActivityRecognitionPlugin
{
  async start(): Promise<{ ok: boolean }> {
    return { ok: false }
  }

  async stop(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  async getCurrent(): Promise<CurrentActivity> {
    return { activity: 'unknown', confidence: 0, timestamp: Date.now() }
  }
}
