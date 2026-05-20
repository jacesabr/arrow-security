import type { PluginListenerHandle } from '@capacitor/core'

export type ActivityType =
  | 'still'
  | 'walking'
  | 'running'
  | 'vehicle'
  | 'bicycle'
  | 'unknown'

export interface ActivityTransitionEvent {
  /** Mapped activity label. */
  activity: ActivityType
  /** Confidence 0..100. iOS maps `.low|.medium|.high` to 25/50/75. */
  confidence: number
  /** Unix ms when the transition was observed. */
  timestamp: number
}

export interface CurrentActivity {
  activity: ActivityType
  confidence: number
  /** Unix ms when the value was last updated. */
  timestamp: number
}

export interface ActivityRecognitionPlugin {
  /**
   * Subscribe to activity transitions. On Android this uses
   * `ActivityRecognitionClient.requestActivityTransitionUpdates`;
   * on iOS it uses `CMMotionActivityManager.startActivityUpdates`.
   *
   * Requests runtime permission (Android `ACTIVITY_RECOGNITION`,
   * iOS `NSMotionUsageDescription`) on first call.
   */
  start(): Promise<{ ok: boolean }>

  /** Stop subscription and release the background sensor task. */
  stop(): Promise<{ ok: boolean }>

  /** Synchronously returns the most-recent activity observed by the plugin. */
  getCurrent(): Promise<CurrentActivity>

  /**
   * Listen for activity transitions. Returns a `PluginListenerHandle` whose
   * `remove()` method unbinds the listener.
   */
  addListener(
    eventName: 'activityTransition',
    listenerFunc: (event: ActivityTransitionEvent) => void,
  ): Promise<PluginListenerHandle>

  /** Remove all `activityTransition` listeners registered on this plugin instance. */
  removeAllListeners(): Promise<void>
}
