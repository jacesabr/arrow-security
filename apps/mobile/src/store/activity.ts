import { create } from 'zustand'
import type { ActivityType, ActivityTransitionEvent } from '@secureops/capacitor-activity-recognition'

interface ActivityState {
  /** Last activity reported by the native plugin. `unknown` until the plugin
   *  has emitted at least one transition. */
  activity: ActivityType
  /** Confidence 0..100 of the last sample. */
  confidence: number
  /** Unix ms of the last sample. */
  timestamp: number
  /** Set by the listener that subscribes to the native `activityTransition` event. */
  setFromEvent: (e: ActivityTransitionEvent) => void
  /** Reset state when tracking stops. */
  clear: () => void
}

export const useActivityStore = create<ActivityState>((set) => ({
  activity: 'unknown',
  confidence: 0,
  timestamp: 0,
  setFromEvent: (e) =>
    set({ activity: e.activity, confidence: e.confidence, timestamp: e.timestamp }),
  clear: () =>
    set({ activity: 'unknown', confidence: 0, timestamp: 0 }),
}))
