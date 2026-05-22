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
   * Whether the app is on the OS's "ignore battery optimisations" whitelist.
   * Apps NOT on the whitelist may have their foreground service killed during
   * Doze / standby. iOS reports `supported: false` (no equivalent concept).
   */
  batteryOptimizationStatus(): Promise<{ whitelisted: boolean; supported: boolean }>

  /**
   * Open the system prompt asking the user to whitelist the app from battery
   * optimisation. No-op if already granted or unsupported. The promise
   * resolves as soon as the system dialog is shown; the user's choice
   * happens out-of-process. Call `batteryOptimizationStatus()` afterwards
   * (e.g. on app resume) to see whether they granted it.
   */
  requestIgnoreBatteryOptimizations(): Promise<{ ok: boolean; alreadyGranted?: boolean; note?: string; error?: string }>

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
