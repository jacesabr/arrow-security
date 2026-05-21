package com.secureops.capacitor.activityrecognition

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

// Uses Google's requestActivityUpdates() (NOT requestActivityTransitionUpdates).
// The Transition API only fires on state CHANGES, so if the OS misses the
// "EXIT walking" event we stay stuck on a stale verdict indefinitely. The
// Updates API gives us a periodic ActivityRecognitionResult — a ranked list
// of detected activities with calibrated confidence (0-100) — and we forward
// whichever is most probable.
@CapacitorPlugin(
    name = "ActivityRecognition",
    permissions = [
        Permission(
            alias = "activity",
            strings = [Manifest.permission.ACTIVITY_RECOGNITION]
        )
    ]
)
class ActivityRecognitionPlugin : Plugin() {

    private var updatesPendingIntent: PendingIntent? = null
    private var receiver: BroadcastReceiver? = null

    @Volatile private var currentActivity: String = "unknown"
    @Volatile private var currentConfidence: Int = 0
    @Volatile private var currentTimestamp: Long = 0

    // 5 seconds between activity samples. The OS may coalesce/back off this
    // value to conserve battery — that's fine, we're checking GPS staleness
    // on the JS side as the safety net for "actually still" detection.
    private val intervalMillis: Long = 5_000L

    @PluginMethod
    fun start(call: PluginCall) {
        // Below API 29 the permission is install-time and Play Services grants it
        // automatically from the manifest entry.
        if (Build.VERSION.SDK_INT < 29) {
            startUpdates(call)
            return
        }
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            startUpdates(call)
        } else {
            requestPermissionForAlias("activity", call, "activityPermissionCallback")
        }
    }

    @PermissionCallback
    private fun activityPermissionCallback(call: PluginCall) {
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            startUpdates(call)
        } else {
            val ret = JSObject()
            ret.put("ok", false)
            call.resolve(ret)
        }
    }

    private fun startUpdates(call: PluginCall) {
        val ctx: Context = context

        if (receiver == null) {
            receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, intent: Intent) {
                    if (!ActivityRecognitionResult.hasResult(intent)) return
                    val result = ActivityRecognitionResult.extractResult(intent) ?: return
                    val most = result.mostProbableActivity ?: return
                    handleSample(most)
                }
            }
            val filter = IntentFilter(UPDATES_ACTION)
            // RECEIVER_NOT_EXPORTED is required on Android 13+ for runtime registration
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                ctx.registerReceiver(receiver, filter)
            }
        }

        if (updatesPendingIntent == null) {
            val intent = Intent(UPDATES_ACTION).setPackage(ctx.packageName)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE
            } else {
                0
            }
            updatesPendingIntent = PendingIntent.getBroadcast(
                ctx, 0, intent, flags or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        val client = ActivityRecognition.getClient(ctx)
        try {
            client.requestActivityUpdates(intervalMillis, updatesPendingIntent!!)
                .addOnSuccessListener {
                    val ret = JSObject()
                    ret.put("ok", true)
                    call.resolve(ret)
                }
                .addOnFailureListener { e ->
                    call.reject("Failed to register activity updates: ${e.message}", e)
                }
        } catch (se: SecurityException) {
            call.reject("Missing ACTIVITY_RECOGNITION permission", se)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val ctx: Context = context
        val pi = updatesPendingIntent
        if (pi != null) {
            try {
                ActivityRecognition.getClient(ctx)
                    .removeActivityUpdates(pi)
            } catch (_: Throwable) { /* best effort */ }
            pi.cancel()
            updatesPendingIntent = null
        }
        receiver?.let {
            try { ctx.unregisterReceiver(it) } catch (_: Throwable) { }
        }
        receiver = null
        val ret = JSObject()
        ret.put("ok", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun getCurrent(call: PluginCall) {
        val ret = JSObject()
        ret.put("activity", currentActivity)
        ret.put("confidence", currentConfidence)
        ret.put("timestamp", if (currentTimestamp > 0) currentTimestamp else System.currentTimeMillis())
        call.resolve(ret)
    }

    private fun handleSample(activity: DetectedActivity) {
        val label = mapType(activity.type)
        // mostProbableActivity comes with a calibrated confidence 0-100.
        // Unlike the Transition API (which we used to fudge to 75), this is
        // the real signal from Google's classifier and worth forwarding as-is.
        val confidence = activity.confidence
        val ts = System.currentTimeMillis()

        currentActivity = label
        currentConfidence = confidence
        currentTimestamp = ts

        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACTIVITY_RECOGNITION
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED &&
            Build.VERSION.SDK_INT >= 29
        ) {
            return
        }

        val data = JSObject()
        data.put("activity", label)
        data.put("confidence", confidence)
        data.put("timestamp", ts)
        // Event name is kept as "activityTransition" for backward compatibility
        // with existing JS listeners — the semantics are now "periodic sample"
        // but the payload shape is identical.
        notifyListeners("activityTransition", data)
    }

    private fun mapType(type: Int): String = when (type) {
        DetectedActivity.STILL -> "still"
        DetectedActivity.WALKING -> "walking"
        DetectedActivity.RUNNING -> "running"
        DetectedActivity.IN_VEHICLE -> "vehicle"
        DetectedActivity.ON_BICYCLE -> "bicycle"
        else -> "unknown"
    }

    companion object {
        private const val UPDATES_ACTION =
            "com.secureops.capacitor.activityrecognition.UPDATES"
    }
}
