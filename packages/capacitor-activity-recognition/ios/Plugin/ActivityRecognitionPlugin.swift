import Foundation
import Capacitor
import CoreMotion

@objc(ActivityRecognitionPlugin)
public class ActivityRecognitionPlugin: CAPPlugin {

    private let manager = CMMotionActivityManager()
    private var running = false

    private var currentActivity: String = "unknown"
    private var currentConfidence: Int = 0
    private var currentTimestamp: TimeInterval = 0

    @objc func start(_ call: CAPPluginCall) {
        guard CMMotionActivityManager.isActivityAvailable() else {
            call.resolve(["ok": false])
            return
        }
        if running {
            call.resolve(["ok": true])
            return
        }

        // iOS prompts for `NSMotionUsageDescription` lazily on first call below.
        manager.startActivityUpdates(to: OperationQueue.main) { [weak self] activity in
            guard let self = self, let a = activity else { return }
            self.handle(a)
        }
        running = true
        call.resolve(["ok": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        if running {
            manager.stopActivityUpdates()
            running = false
        }
        call.resolve(["ok": true])
    }

    @objc func getCurrent(_ call: CAPPluginCall) {
        call.resolve([
            "activity": currentActivity,
            "confidence": currentConfidence,
            "timestamp": Int((currentTimestamp == 0 ? Date().timeIntervalSince1970 : currentTimestamp) * 1000)
        ])
    }

    private func handle(_ a: CMMotionActivity) {
        let label = Self.mapLabel(a)
        let confidence = Self.mapConfidence(a.confidence)
        let ts = a.startDate.timeIntervalSince1970

        // CoreMotion can briefly emit `unknown` between transitions — ignore those
        // so the last meaningful label is what `getCurrent` returns.
        guard label != "unknown" else { return }

        currentActivity = label
        currentConfidence = confidence
        currentTimestamp = ts

        notifyListeners("activityTransition", data: [
            "activity": label,
            "confidence": confidence,
            "timestamp": Int(ts * 1000)
        ])
    }

    // CMMotionActivity flags are not mutually exclusive (e.g. walking & cycling
    // can both be true). Pick the strongest single label in this priority order:
    //   vehicle > cycling > running > walking > stationary
    private static func mapLabel(_ a: CMMotionActivity) -> String {
        if a.automotive { return "vehicle" }
        if a.cycling    { return "bicycle" }
        if a.running    { return "running" }
        if a.walking    { return "walking" }
        if a.stationary { return "still" }
        return "unknown"
    }

    private static func mapConfidence(_ c: CMMotionActivityConfidence) -> Int {
        switch c {
        case .low:    return 25
        case .medium: return 50
        case .high:   return 75
        @unknown default: return 0
        }
    }
}
