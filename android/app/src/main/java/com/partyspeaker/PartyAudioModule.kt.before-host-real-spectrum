package com.partyspeaker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaPlayer
import android.media.ToneGenerator
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.util.Base64
import java.io.File
import java.io.FileOutputStream
import java.net.NetworkInterface
import android.os.Looper
import android.provider.OpenableColumns
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.sqrt

class PartyAudioModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val requestMediaProjectionCode = 9911
    private val requestPickAudioCode = 9922

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private var captureRunning = false
    private var capturePromise: Promise? = null
    private var pickAudioPromise: Promise? = null
    private var currentPlayer: MediaPlayer? = null
    private var currentExoPlayer: ExoPlayer? = null
    private var playbackVisualizerEnabled = false
    private var playbackLevelRunning = false
    private var playbackLevelHandler: Handler? = null

    private val activityEventListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity,
                requestCode: Int,
                resultCode: Int,
                data: Intent?
            ) {
                when (requestCode) {
                    requestMediaProjectionCode -> handleMediaProjectionResult(resultCode, data)
                    requestPickAudioCode -> handlePickAudioResult(resultCode, data)
                }
            }
        }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = "PartyAudio"

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun handleMediaProjectionResult(resultCode: Int, data: Intent?) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            capturePromise?.reject(
                "CAPTURE_PERMISSION_DENIED",
                "Audio capture permission was denied"
            )
            capturePromise = null
            emitCaptureStatus("Permission denied")
            return
        }

        try {
            val manager = mediaProjectionManager
            if (manager == null) {
                capturePromise?.reject(
                    "CAPTURE_MANAGER_MISSING",
                    "MediaProjectionManager was not available"
                )
                capturePromise = null
                return
            }

            mediaProjection = manager.getMediaProjection(resultCode, data)
            startAudioPlaybackCapture()
            capturePromise?.resolve(true)
            capturePromise = null
        } catch (error: Exception) {
            capturePromise?.reject("CAPTURE_START_ERROR", error)
            capturePromise = null
            emitCaptureStatus("Capture start error: ${error.message}")
        }
    }

    private fun handlePickAudioResult(resultCode: Int, data: Intent?) {
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            pickAudioPromise?.reject("PICK_CANCELLED", "Audio picking was cancelled")
            pickAudioPromise = null
            return
        }

        try {
            val uri = data.data!!

            try {
                reactContext.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: Exception) {}

            val name = getDisplayName(uri) ?: "Selected audio"

            val result = Arguments.createMap()
            result.putString("uri", uri.toString())
            result.putString("name", name)

            pickAudioPromise?.resolve(result)
            pickAudioPromise = null
        } catch (error: Exception) {
            pickAudioPromise?.reject("PICK_AUDIO_ERROR", error)
            pickAudioPromise = null
        }
    }

    private fun getDisplayName(uri: Uri): String? {
        var cursor: Cursor? = null

        return try {
            cursor = reactContext.contentResolver.query(uri, null, null, null, null)
            if (cursor != null && cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) cursor.getString(nameIndex) else null
            } else {
                null
            }
        } catch (_: Exception) {
            null
        } finally {
            cursor?.close()
        }
    }


    @ReactMethod
    fun getLocalIpAddress(promise: Promise) {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()

            for (networkInterface in interfaces) {
                val addresses = networkInterface.inetAddresses

                for (address in addresses) {
                    val hostAddress = address.hostAddress ?: continue

                    if (!address.isLoopbackAddress &&
                        hostAddress.contains(".") &&
                        !hostAddress.startsWith("169.254")
                    ) {
                        promise.resolve(hostAddress)
                        return
                    }
                }
            }

            promise.resolve("Unknown")
        } catch (error: Exception) {
            promise.reject("GET_IP_ERROR", error)
        }
    }

    @ReactMethod
    fun pickAudioFile(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        pickAudioPromise = promise

        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "audio/*"
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }

        activity.startActivityForResult(intent, requestPickAudioCode)
    }

    @ReactMethod
    fun playAudioUri(uriString: String, promise: Promise) {
        try {
            stopCurrentPlayer()

            val uri = Uri.parse(uriString)
            val player = MediaPlayer()

            currentPlayer = player

            player.setAudioStreamType(AudioManager.STREAM_MUSIC)
            player.setDataSource(reactContext, uri)

            player.setOnPreparedListener {
                it.start()
                promise.resolve(true)
            }

            player.setOnCompletionListener {
                it.release()
                if (currentPlayer === it) {
                    currentPlayer = null
                }
            }

            player.setOnErrorListener { mediaPlayer, _, _ ->
                mediaPlayer.release()
                if (currentPlayer === mediaPlayer) {
                    currentPlayer = null
                }
                true
            }

            player.prepareAsync()
        } catch (error: Exception) {
            promise.reject("PLAY_AUDIO_URI_ERROR", error)
        }
    }

    @ReactMethod
    fun stopAudioUri(promise: Promise) {
        try {
            stopCurrentPlayer()
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("STOP_AUDIO_URI_ERROR", error)
        }
    }

    @ReactMethod
    fun readAudioUriAsBase64(uriString: String, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val inputStream = reactContext.contentResolver.openInputStream(uri)

            if (inputStream == null) {
                promise.reject("READ_AUDIO_ERROR", "Could not open audio file")
                return
            }

            val bytes = inputStream.use { it.readBytes() }
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            promise.resolve(base64)
        } catch (error: Exception) {
            promise.reject("READ_AUDIO_ERROR", error)
        }
    }

    @ReactMethod
    fun saveBase64Track(trackId: String, fileName: String, base64: String, promise: Promise) {
        try {
            val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")
            val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val tracksDir = File(reactContext.filesDir, "party_tracks")

            if (!tracksDir.exists()) {
                tracksDir.mkdirs()
            }

            val outputFile = File(tracksDir, "${safeTrackId}_${safeFileName}")
            val bytes = Base64.decode(base64, Base64.NO_WRAP)

            FileOutputStream(outputFile).use { output ->
                output.write(bytes)
            }

            promise.resolve(outputFile.absolutePath)
        } catch (error: Exception) {
            promise.reject("SAVE_TRACK_ERROR", error)
        }
    }

    @ReactMethod
    fun playCachedTrack(trackId: String, fileName: String, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                playCachedTrack(trackId, fileName, promise)
            }
            return
        }

        try {
            stopCurrentPlayer()

            val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")
            val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val tracksDir = File(reactContext.filesDir, "party_tracks")
            val file = File(tracksDir, "${safeTrackId}_${safeFileName}")

            if (!file.exists()) {
                promise.reject("CACHED_TRACK_MISSING", "Cached track not found")
                return
            }

            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()
            currentExoPlayer = player

            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))

            player.addListener(object : Player.Listener {
                override fun onAudioSessionIdChanged(audioSessionId: Int) {
                    startRealPlaybackVisualizer(audioSessionId)
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY) {
                        player.play()
                        startPlaybackLevelEvents()
                        promise.resolve(true)
                    }

                    if (playbackState == Player.STATE_ENDED) {
                        player.release()
                        if (currentExoPlayer === player) {
                            currentExoPlayer = null
                        }
                    }
                }
            })

            player.prepare()
        } catch (error: Exception) {
            promise.reject("PLAY_CACHED_TRACK_ERROR", error)
        }
    }

    @ReactMethod
    fun setPlaybackVisualizerEnabled(enabled: Boolean, promise: Promise) {
        playbackVisualizerEnabled = enabled

        if (!enabled) {
            stopRealPlaybackVisualizer()
        }

        promise.resolve(true)
    }

    private fun startRealPlaybackVisualizer(audioSessionId: Int) {
        // Disabled for now. Android Visualizer caused crashes on real speaker nodes.
    }

    private fun stopRealPlaybackVisualizer() {
        // Disabled for now.
    }

    private fun startPlaybackLevelEvents() {
        if (playbackLevelRunning) {
            return
        }

        playbackLevelRunning = true

        val runnable = object : Runnable {
            override fun run() {
                val player = currentExoPlayer

                if (!playbackLevelRunning || player == null) {
                    playbackLevelRunning = false
                    return
                }

                val position = player.currentPosition.coerceAtLeast(0L)

                // Temporary deterministic level based on playback position.
                // Next step: replace with true FFT/audio processor data.
                val level = ((kotlin.math.sin(position / 130.0) + 1.0) / 2.0)
                    .coerceIn(0.0, 1.0)

                emitPlaybackLevel(level)

                playbackLevelHandler?.postDelayed(this, 50)
            }
        }

        playbackLevelHandler = Handler(Looper.getMainLooper())
        playbackLevelHandler?.post(runnable)
    }

    private fun stopPlaybackLevelEvents() {
        playbackLevelRunning = false
        playbackLevelHandler?.removeCallbacksAndMessages(null)
        playbackLevelHandler = null
    }

    private fun emitPlaybackLevel(level: Double) {
        val event = Arguments.createMap()
        event.putDouble("level", level)

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PartyPlaybackLevel", event)
    }

    private fun stopCurrentPlayer() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                stopCurrentPlayer()
            }
            return
        }

        stopPlaybackLevelEvents()
        stopRealPlaybackVisualizer()

        try {
            currentPlayer?.stop()
        } catch (_: Exception) {}

        try {
            currentPlayer?.release()
        } catch (_: Exception) {}

        currentPlayer = null

        try {
            currentExoPlayer?.stop()
        } catch (_: Exception) {}

        try {
            currentExoPlayer?.release()
        } catch (_: Exception) {}

        currentExoPlayer = null
    }


    @ReactMethod
    fun playCachedTrackFrom(trackId: String, fileName: String, positionMs: Double, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                playCachedTrackFrom(trackId, fileName, positionMs, promise)
            }
            return
        }

        try {
            stopCurrentPlayer()

            val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")
            val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val tracksDir = File(reactContext.filesDir, "party_tracks")
            val file = File(tracksDir, "${safeTrackId}_${safeFileName}")

            if (!file.exists()) {
                promise.reject("CACHED_TRACK_MISSING", "Cached track not found")
                return
            }

            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()
            currentExoPlayer = player

            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))

            var resolved = false

            player.addListener(object : Player.Listener {
                override fun onAudioSessionIdChanged(audioSessionId: Int) {
                    startRealPlaybackVisualizer(audioSessionId)
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY && !resolved) {
                        resolved = true
                        player.seekTo(positionMs.toLong().coerceAtLeast(0L))
                        player.play()
                        startPlaybackLevelEvents()
                        promise.resolve(true)
                    }

                    if (playbackState == Player.STATE_ENDED) {
                        player.release()
                        if (currentExoPlayer === player) {
                            currentExoPlayer = null
                        }
                    }
                }
            })

            player.prepare()
        } catch (error: Exception) {
            promise.reject("PLAY_CACHED_TRACK_FROM_ERROR", error)
        }
    }

    @ReactMethod
    fun playBeep(promise: Promise) {
        try {
            val toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
            toneGenerator.startTone(ToneGenerator.TONE_PROP_BEEP, 300)

            Handler(Looper.getMainLooper()).postDelayed({
                toneGenerator.release()
            }, 500)

            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("BEEP_ERROR", error)
        }
    }

    @ReactMethod
    fun playTestTone(promise: Promise) {
        try {
            thread {
                val sampleRate = 44100
                val durationSeconds = 2
                val frequency = 440.0
                val sampleCount = sampleRate * durationSeconds
                val audioData = ShortArray(sampleCount)

                for (i in 0 until sampleCount) {
                    val angle = 2.0 * PI * i * frequency / sampleRate
                    audioData[i] = (sin(angle) * Short.MAX_VALUE * 0.45).toInt().toShort()
                }

                val audioTrack = AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    audioData.size * 2,
                    AudioTrack.MODE_STATIC
                )

                audioTrack.write(audioData, 0, audioData.size)
                audioTrack.play()

                Thread.sleep((durationSeconds * 1000L) + 200)

                audioTrack.stop()
                audioTrack.release()
            }

            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("TEST_TONE_ERROR", error)
        }
    }

    @ReactMethod
    fun playPartyClip(promise: Promise) {
        try {
            val player = MediaPlayer.create(reactContext, R.raw.party_clip)

            player.setOnCompletionListener {
                it.release()
            }

            player.setOnErrorListener { mediaPlayer, _, _ ->
                mediaPlayer.release()
                true
            }

            player.start()
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("PARTY_CLIP_ERROR", error)
        }
    }

    @ReactMethod
    fun startAudioCaptureTest(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject(
                "CAPTURE_NOT_SUPPORTED",
                "Audio playback capture requires Android 10 or newer"
            )
            return
        }

        if (captureRunning) {
            promise.resolve(true)
            return
        }

        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        capturePromise = promise

        val serviceIntent = Intent(reactContext, PartyCaptureService::class.java)
        ContextCompat.startForegroundService(reactContext, serviceIntent)

        mediaProjectionManager =
            reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        val captureIntent = mediaProjectionManager!!.createScreenCaptureIntent()
        activity.startActivityForResult(captureIntent, requestMediaProjectionCode)
    }

    @ReactMethod
    fun stopAudioCaptureTest(promise: Promise) {
        try {
            stopCaptureInternal()
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("CAPTURE_STOP_ERROR", error)
        }
    }

    private fun startAudioPlaybackCapture() {
        val projection = mediaProjection
            ?: throw IllegalStateException("MediaProjection is missing")

        val sampleRate = 44100
        val channelMask = AudioFormat.CHANNEL_IN_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT

        val audioFormat = AudioFormat.Builder()
            .setSampleRate(sampleRate)
            .setChannelMask(channelMask)
            .setEncoding(encoding)
            .build()

        val captureConfig = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()

        val minBufferSize = AudioRecord.getMinBufferSize(
            sampleRate,
            channelMask,
            encoding
        )

        val bufferSize = maxOf(minBufferSize, 4096)

        val recorder = AudioRecord.Builder()
            .setAudioFormat(audioFormat)
            .setAudioPlaybackCaptureConfig(captureConfig)
            .setBufferSizeInBytes(bufferSize)
            .build()

        audioRecord = recorder
        captureRunning = true

        recorder.startRecording()
        emitCaptureStatus("Capture running")

        thread(start = true) {
            val buffer = ShortArray(2048)
            var lastEmitTime = 0L

            while (captureRunning) {
                val readCount = recorder.read(buffer, 0, buffer.size)

                if (readCount > 0) {
                    var sum = 0.0

                    for (i in 0 until readCount) {
                        val sample = buffer[i].toDouble()
                        sum += sample * sample
                    }

                    val rms = sqrt(sum / readCount)
                    val level = (rms / Short.MAX_VALUE).coerceIn(0.0, 1.0)

                    val now = System.currentTimeMillis()
                    if (now - lastEmitTime > 120) {
                        lastEmitTime = now
                        emitCaptureLevel(level)
                    }
                }
            }
        }
    }

    private fun stopCaptureInternal() {
        captureRunning = false

        try {
            audioRecord?.stop()
        } catch (_: Exception) {}

        try {
            audioRecord?.release()
        } catch (_: Exception) {}

        audioRecord = null

        try {
            mediaProjection?.stop()
        } catch (_: Exception) {}

        mediaProjection = null

        try {
            reactContext.stopService(Intent(reactContext, PartyCaptureService::class.java))
        } catch (_: Exception) {}

        emitCaptureLevel(0.0)
        emitCaptureStatus("Capture stopped")
    }

    private fun emitCaptureLevel(level: Double) {
        val params = Arguments.createMap()
        params.putDouble("level", level)

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("partyAudioCaptureLevel", params)
    }

    private fun emitCaptureStatus(status: String) {
        val params = Arguments.createMap()
        params.putString("status", status)

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("partyAudioCaptureStatus", params)
    }

    override fun invalidate() {
        super.invalidate()
        stopCurrentPlayer()
        stopCaptureInternal()
    }
}
