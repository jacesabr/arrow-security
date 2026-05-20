# @secureops/capacitor-activity-recognition

Capacitor 6 plugin that wraps:
- **Android**: `ActivityRecognitionClient.requestActivityTransitionUpdates` (Google Play Services Location, free, sensor-fused, low battery)
- **iOS**: `CMMotionActivityManager.startActivityUpdates` (CoreMotion, free, sensor-fused)

Emits `walking | running | vehicle | bicycle | still` transitions and exposes
both an event listener and a `getCurrent()` snapshot. Used by Arrow Security's
mobile app as a tiebreaker for the server-side GPS-speed shift classifier
when speed alone is ambiguous (≈ 1.5–12 km/h).

## API

```ts
import { ActivityRecognition } from '@secureops/capacitor-activity-recognition'

await ActivityRecognition.start()           // prompts permission on first call

const listener = await ActivityRecognition.addListener('activityTransition', (e) => {
  // e.activity, e.confidence (0..100), e.timestamp (unix ms)
})

const current = await ActivityRecognition.getCurrent()

// teardown
await listener.remove()
await ActivityRecognition.stop()
```

## Required app-level configuration

### Android

The plugin's own `AndroidManifest.xml` declares:
```xml
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="com.google.android.gms.permission.ACTIVITY_RECOGNITION" />
```
These are merged into the app manifest by Capacitor at build time. The
runtime permission is prompted on first `start()` call (API 29+).

### iOS

Add to `apps/mobile/ios/App/App/Info.plist`:
```xml
<key>NSMotionUsageDescription</key>
<string>Arrow Security uses motion data during your shift to record walking and driving time accurately.</string>
```

## Build

```sh
cd packages/capacitor-activity-recognition
pnpm build
```

## Notes

- Android transitions are emitted only on `ENTER`. We report `confidence: 75`
  because the Transition API does not surface per-event confidence — once a
  transition fires it has crossed Google's internal threshold (~75/100).
- iOS confidence is reported as 25 / 50 / 75 (mapped from `low / medium / high`).
- The web shim returns `{ activity: 'unknown', confidence: 0 }` — the
  Arrow Security classifier treats this as "no tiebreaker available" and
  falls back to GPS-speed-only classification.
