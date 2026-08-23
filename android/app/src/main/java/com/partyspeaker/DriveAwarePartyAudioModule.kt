package com.partyspeaker

import android.app.AlertDialog
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Keeps PartySpeaker's existing audio/playback/transfer implementation intact and
 * intercepts only the two import entry points so the host can choose Device or
 * Google Drive. Drive selections are materialised into DriveAudioModule's cache
 * before the existing PartyAudio pipeline ever sees the URI.
 */
class DriveAwarePartyAudioModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val partyAudio = PartyAudioModule(reactContext)
    private val driveAudio = DriveAudioModule(reactContext)

    override fun getName(): String = "PartyAudio"

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun getLocalIpAddress(promise: Promise) = partyAudio.getLocalIpAddress(promise)

    @ReactMethod
    fun pickAudioFile(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        activity.runOnUiThread {
            AlertDialog.Builder(activity)
                .setTitle("Add track")
                .setMessage("Choose where to get the track from")
                .setPositiveButton("Device") { _, _ ->
                    partyAudio.pickAudioFile(promise)
                }
                .setNeutralButton("Google Drive") { _, _ ->
                    driveAudio.pickTrack(promise)
                }
                .setNegativeButton("Cancel") { _, _ ->
                    promise.reject("PICK_CANCELLED", "Audio picking was cancelled")
                }
                .setOnCancelListener {
                    promise.reject("PICK_CANCELLED", "Audio picking was cancelled")
                }
                .show()
        }
    }

    @ReactMethod
    fun pickAudioFolder(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        activity.runOnUiThread {
            AlertDialog.Builder(activity)
                .setTitle("Add folder")
                .setMessage("Choose where to get the folder from")
                .setPositiveButton("Device") { _, _ ->
                    partyAudio.pickAudioFolder(promise)
                }
                .setNeutralButton("Google Drive") { _, _ ->
                    driveAudio.pickFolder(promise)
                }
                .setNegativeButton("Cancel") { _, _ ->
                    promise.reject("PICK_FOLDER_CANCELLED", "Folder picking was cancelled")
                }
                .setOnCancelListener {
                    promise.reject("PICK_FOLDER_CANCELLED", "Folder picking was cancelled")
                }
                .show()
        }
    }

    @ReactMethod
    fun playAudioUri(uriString: String, promise: Promise) =
        partyAudio.playAudioUri(uriString, promise)

    @ReactMethod
    fun stopAudioUri(promise: Promise) = partyAudio.stopAudioUri(promise)

    @ReactMethod
    fun readAudioUriAsBase64(uriString: String, promise: Promise) =
        partyAudio.readAudioUriAsBase64(uriString, promise)

    @ReactMethod
    fun saveBase64Track(trackId: String, fileName: String, base64: String, promise: Promise) =
        partyAudio.saveBase64Track(trackId, fileName, base64, promise)

    @ReactMethod
    fun playCachedTrack(trackId: String, fileName: String, promise: Promise) =
        partyAudio.playCachedTrack(trackId, fileName, promise)

    @ReactMethod
    fun prepareCachedTrackAt(
        trackId: String,
        fileName: String,
        localTargetTimeMs: Double,
        promise: Promise
    ) = partyAudio.prepareCachedTrackAt(trackId, fileName, localTargetTimeMs, promise)

    @ReactMethod
    fun prepareAudioUriAt(uriString: String, localTargetTimeMs: Double, promise: Promise) =
        partyAudio.prepareAudioUriAt(uriString, localTargetTimeMs, promise)

    @ReactMethod
    fun primeStandbyCachedTrack(trackId: String, fileName: String, promise: Promise) =
        partyAudio.primeStandbyCachedTrack(trackId, fileName, promise)

    @ReactMethod
    fun primeStandbyAudioUri(uriString: String, promise: Promise) =
        partyAudio.primeStandbyAudioUri(uriString, promise)

    @ReactMethod
    fun startStandbyTrackAt(localTargetTimeMs: Double, promise: Promise) =
        partyAudio.startStandbyTrackAt(localTargetTimeMs, promise)

    @ReactMethod
    fun primeCachedTrack(trackId: String, fileName: String, promise: Promise) =
        partyAudio.primeCachedTrack(trackId, fileName, promise)

    @ReactMethod
    fun primeAudioUri(uriString: String, promise: Promise) =
        partyAudio.primeAudioUri(uriString, promise)

    @ReactMethod
    fun startPrimedTrackAt(localTargetTimeMs: Double, promise: Promise) =
        partyAudio.startPrimedTrackAt(localTargetTimeMs, promise)

    @ReactMethod
    fun playCachedTrackFrom(trackId: String, fileName: String, positionMs: Double, promise: Promise) =
        partyAudio.playCachedTrackFrom(trackId, fileName, positionMs, promise)

    @ReactMethod
    fun getCurrentPlaybackPosition(promise: Promise) =
        partyAudio.getCurrentPlaybackPosition(promise)

    @ReactMethod
    fun seekCurrentPlayback(positionMs: Double, promise: Promise) =
        partyAudio.seekCurrentPlayback(positionMs, promise)

    @ReactMethod
    fun playBeep(promise: Promise) = partyAudio.playBeep(promise)

    @ReactMethod
    fun playTestTone(promise: Promise) = partyAudio.playTestTone(promise)

    @ReactMethod
    fun playPartyClip(promise: Promise) = partyAudio.playPartyClip(promise)

    @ReactMethod
    fun registerTrackForTransfer(trackId: String, uriString: String, promise: Promise) =
        partyAudio.registerTrackForTransfer(trackId, uriString, promise)

    @ReactMethod
    fun startTrackTransferServer(port: Int, promise: Promise) =
        partyAudio.startTrackTransferServer(port, promise)

    @ReactMethod
    fun downloadTrackFromHost(
        host: String,
        port: Int,
        trackId: String,
        fileName: String,
        promise: Promise
    ) = partyAudio.downloadTrackFromHost(host, port, trackId, fileName, promise)

    @ReactMethod
    fun stopTrackTransferServer(promise: Promise) = partyAudio.stopTrackTransferServer(promise)

    override fun invalidate() {
        partyAudio.invalidate()
        try {
            File(reactContext.cacheDir, "party_drive").deleteRecursively()
        } catch (_: Exception) {}
        super.invalidate()
    }
}
