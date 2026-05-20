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
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionEvent
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

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

    private var transitionsPendingIntent: PendingIntent? = null
    private var receiver: BroadcastReceiver? = null

    @Volatile private var currentActivity: String = "unknown"
    @Volatile private var currentConfidence: Int = 0
    @Volatile private var currentTimestamp: Long = 0

    // The transition types we subscribe to. Bicycle is included for completeness;
    // the server classifier handles whether or not it's mapped to walking/driving.
    private val transitionTypes = listOf(
        DetectedActivity.STILL,
        DetectedActivity.WALKING,
        DetectedActivity.RUNNING,
        DetectedActivity.IN_VEHICLE,
        DetectedActivity.ON_BICYCLE,
    )

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
                    if (!ActivityTransitionResult.hasResult(intent)) return
                    val result = ActivityTransitionResult.extractResult(intent) ?: return
                    for (event in result.transitionEvents) {
                        if (event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
                            handleEnter(event)
                        }
                    }
                }
            }
            val filter = IntentFilter(TRANSITIONS_ACTION)
            // RECEIVER_NOT_EXPORTED is required on Android 13+ for runtime registration
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                ctx.registerReceiver(receiver, filter)
            }
        }

        if (transitionsPendingIntent == null) {
            val intent = Intent(TRANSITIONS_ACTION).setPackage(ctx.packageName)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE
            } else {
                0
            }
            transitionsPendingIntent = PendingIntent.getBroadcast(
                ctx, 0, intent, flags or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        val transitions = mutableListOf<ActivityTransition>()
        for (type in transitionTypes) {
            transitions.add(
                ActivityTransition.Builder()
                    .setActivityType(type)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                    .build()
            )
            transitions.add(
                ActivityTransition.Builder()
                    .setActivityType(type)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                    .build()
            )
        }
        val request = ActivityTransitionRequest(transitions)

        val client = ActivityRecognition.getClient(ctx)
        try {
            client.requestActivityTransitionUpdates(request, transitionsPendingIntent!!)
                .addOnSuccessListener {
                    val ret = JSObject()
                    ret.put("ok", true)
                    call.resolve(ret)
                }
                .addOnFailureListener { e ->
                    call.reject("Failed to register activity transitions: ${e.message}", e)
                }
        } catch (se: SecurityException) {
            call.reject("Missing ACTIVITY_RECOGNITION permission", se)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val ctx: Context = context
        val pi = transitionsPendingIntent
        if (pi != null) {
            try {
                ActivityRecognition.getClient(ctx)
                    .removeActivityTransitionUpdates(pi)
            } catch (_: Throwable) { /* best effort */ }
            pi.cancel()
            transitionsPendingIntent = null
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

    private fun handleEnter(event: ActivityTransitionEvent) {
        val label = mapType(event.activityType)
        // The Transition API does not report a per-event confidence — once a
        // transition fires it has crossed Google's internal threshold (~75/100).
        // We report 75 to give downstream consumers a usable signal.
        val confidence = 75
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
        private const val TRANSITIONS_ACTION =
            "com.secureops.capacitor.activityrecognition.TRANSITIONS"
    }
}
