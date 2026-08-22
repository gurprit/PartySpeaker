package com.partyspeaker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.media.ToneGenerator
import android.net.Uri
import android.os.Handler
import android.util.Base64
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import android.os.Looper
import android.provider.OpenableColumns
import android.provider.DocumentsContract
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

class PartyAudioModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val requestPickAudioCode = 9922
    private val requestPickAudioFolderCode = 9923

    private var pickAudioPromise: Promise? = null
    private var pickAudioFolderPromise: Promise? = null
    private var currentPlayer: MediaPlayer? = null
    private var currentExoPlayer: ExoPlayer? = null
    private var standbyExoPlayer: ExoPlayer? = null
    private var playbackLevelRunning = false
    private var playbackLevelHandler: Handler? = null
    private val transferTracks = ConcurrentHashMap<String, String>()
    @Volatile private var transferServerSocket: ServerSocket? = null
    @Volatile private var transferServerRunning = false

    private val activityEventListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity,
                requestCode: Int,
                resultCode: Int,
                data: Intent?
            ) {
                when (requestCode) {
                    requestPickAudioCode -> handlePickAudioResult(resultCode, data)
                    requestPickAudioFolderCode -> handlePickAudioFolderResult(resultCode, data)
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

    private fun handlePickAudioFolderResult(resultCode: Int, data: Intent?) {
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            pickAudioFolderPromise?.reject("PICK_FOLDER_CANCELLED", "Folder picking was cancelled")
            pickAudioFolderPromise = null
            return
        }

        try {
            val treeUri = data.data!!
            try {
                reactContext.contentResolver.takePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: Exception) {}

            val result = Arguments.createArray()
            val rootId = DocumentsContract.getTreeDocumentId(treeUri)
            collectAudioDocuments(treeUri, rootId, result)
            pickAudioFolderPromise?.resolve(result)
            pickAudioFolderPromise = null
        } catch (error: Exception) {
            pickAudioFolderPromise?.reject("PICK_FOLDER_ERROR", error)
            pickAudioFolderPromise = null
        }
    }

    private fun collectAudioDocuments(
        treeUri: Uri,
        parentDocumentId: String,
        result: com.facebook.react.bridge.WritableArray
    ) {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )

        reactContext.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
            val idIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)

            while (cursor.moveToNext()) {
                val documentId = cursor.getString(idIndex)
                val name = cursor.getString(nameIndex) ?: "Audio file"
                val mime = cursor.getString(mimeIndex) ?: ""

                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    collectAudioDocuments(treeUri, documentId, result)
                    continue
                }

                val lower = name.lowercase()
                val supportedExtension = listOf(
                    ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus"
                ).any { lower.endsWith(it) }

                if (mime.startsWith("audio/") || supportedExtension) {
                    val uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
                    val item = Arguments.createMap()
                    item.putString("uri", uri.toString())
                    item.putString("name", name)
                    result.pushMap(item)
                }
            }
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
    fun pickAudioFolder(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        pickAudioFolderPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        activity.startActivityForResult(intent, requestPickAudioFolderCode)
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
    fun prepareCachedTrackAt(
        trackId: String,
        fileName: String,
        localTargetTimeMs: Double,
        promise: Promise
    ) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                prepareCachedTrackAt(trackId, fileName, localTargetTimeMs, promise)
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

            val player = ExoPlayer.Builder(reactContext)
                .setLooper(Looper.getMainLooper())
                .build()
            currentExoPlayer = player
            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))

            var startScheduled = false
            var promiseSettled = false

            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY && !startScheduled) {
                        startScheduled = true
                        val remainingMs = (localTargetTimeMs - System.currentTimeMillis())
                            .toLong()
                            .coerceAtLeast(0L)

                        Handler(Looper.getMainLooper()).postDelayed({
                            if (currentExoPlayer === player) {
                                player.play()
                                startPlaybackLevelEvents()
                                if (!promiseSettled) {
                                    promiseSettled = true
                                    promise.resolve(true)
                                }
                            } else if (!promiseSettled) {
                                promiseSettled = true
                                promise.reject("PREWARM_CANCELLED", "Prepared player was replaced before start")
                            }
                        }, remainingMs)
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
            promise.reject("PREPARE_CACHED_TRACK_ERROR", error)
        }
    }

    @ReactMethod
    fun prepareAudioUriAt(
        uriString: String,
        localTargetTimeMs: Double,
        promise: Promise
    ) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                prepareAudioUriAt(uriString, localTargetTimeMs, promise)
            }
            return
        }

        try {
            stopCurrentPlayer()

            val player = ExoPlayer.Builder(reactContext)
                .setLooper(Looper.getMainLooper())
                .build()
            currentExoPlayer = player

            val uri = Uri.parse(uriString)
            player.setMediaItem(MediaItem.fromUri(uri))

            var startScheduled = false
            var promiseSettled = false

            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY && !startScheduled) {
                        startScheduled = true
                        val remainingMs = (localTargetTimeMs - System.currentTimeMillis())
                            .toLong()
                            .coerceAtLeast(0L)

                        Handler(Looper.getMainLooper()).postDelayed({
                            if (currentExoPlayer === player) {
                                player.play()
                                startPlaybackLevelEvents()
                                if (!promiseSettled) {
                                    promiseSettled = true
                                    promise.resolve(true)
                                }
                            } else if (!promiseSettled) {
                                promiseSettled = true
                                promise.reject(
                                    "HOST_PREWARM_CANCELLED",
                                    "Prepared host player was replaced before start"
                                )
                            }
                        }, remainingMs)
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
            promise.reject("PREPARE_AUDIO_URI_ERROR", error)
        }
    }

    @ReactMethod
    fun primeStandbyCachedTrack(trackId: String, fileName: String, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post { primeStandbyCachedTrack(trackId, fileName, promise) }
            return
        }
        try {
            try { standbyExoPlayer?.release() } catch (_: Exception) {}
            standbyExoPlayer = null

            val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")
            val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val file = File(File(reactContext.filesDir, "party_tracks"), "${safeTrackId}_${safeFileName}")
            if (!file.exists()) {
                promise.reject("STANDBY_TRACK_MISSING", "Cached standby track not found")
                return
            }

            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()
            standbyExoPlayer = player
            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))
            var settled = false
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && !settled && standbyExoPlayer === player) {
                        settled = true
                        promise.resolve(true)
                    }
                }
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    if (!settled) {
                        settled = true
                        promise.reject("STANDBY_PRIME_ERROR", error.message, error)
                    }
                }
            })
            Handler(Looper.getMainLooper()).postDelayed({
                if (!settled && standbyExoPlayer === player) {
                    settled = true
                    promise.reject("STANDBY_PRIME_TIMEOUT", "Standby player did not become ready within 15000ms")
                }
            }, 15000L)
            player.prepare()
        } catch (error: Exception) {
            promise.reject("STANDBY_PRIME_CACHED_ERROR", error)
        }
    }

    @ReactMethod
    fun primeStandbyAudioUri(uriString: String, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post { primeStandbyAudioUri(uriString, promise) }
            return
        }
        try {
            try { standbyExoPlayer?.release() } catch (_: Exception) {}
            standbyExoPlayer = null
            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()
            standbyExoPlayer = player
            player.setMediaItem(MediaItem.fromUri(Uri.parse(uriString)))
            var settled = false
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && !settled && standbyExoPlayer === player) {
                        settled = true
                        promise.resolve(true)
                    }
                }
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    if (!settled) {
                        settled = true
                        promise.reject("STANDBY_URI_PRIME_ERROR", error.message, error)
                    }
                }
            })
            player.prepare()
        } catch (error: Exception) {
            promise.reject("STANDBY_PRIME_URI_ERROR", error)
        }
    }

    @ReactMethod
    fun startStandbyTrackAt(localTargetTimeMs: Double, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post { startStandbyTrackAt(localTargetTimeMs, promise) }
            return
        }
        val standby = standbyExoPlayer
        if (standby == null) {
            promise.reject("NO_STANDBY_PLAYER", "No prepared standby player is available")
            return
        }
        val remainingMs = (localTargetTimeMs - System.currentTimeMillis()).toLong().coerceAtLeast(0L)
        Handler(Looper.getMainLooper()).postDelayed({
            if (standbyExoPlayer === standby) {
                stopPlaybackLevelEvents()
                try { currentExoPlayer?.stop() } catch (_: Exception) {}
                try { currentExoPlayer?.release() } catch (_: Exception) {}
                currentExoPlayer = standby
                standbyExoPlayer = null
                standby.play()
                startPlaybackLevelEvents()
            }
        }, remainingMs)
        promise.resolve(true)
    }

    @ReactMethod
    fun primeCachedTrack(trackId: String, fileName: String, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post { primeCachedTrack(trackId, fileName, promise) }
            return
        }
        try {
            stopCurrentPlayer()
            val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")
            val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val file = File(File(reactContext.filesDir, "party_tracks"), "${safeTrackId}_${safeFileName}")
            if (!file.exists()) {
                promise.reject("CACHED_TRACK_MISSING", "Cached track not found")
                return
            }
            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()
            currentExoPlayer = player
            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))
            var settled = false
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && !settled) {
                        settled = true
                        promise.resolve(true)
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    if (!settled) {
                        settled = true
                        promise.reject("PRIME_CACHED_TRACK_PLAYER_ERROR", error.message, error)
                    }
                }
            })

            Handler(Looper.getMainLooper()).postDelayed({
                if (!settled && currentExoPlayer === player) {
                    settled = true
                    promise.reject("PRIME_CACHED_TRACK_TIMEOUT", "Player did not become ready within 15000ms")
                }
            }, 15000L)

            player.prepare()
        } catch (error: Exception) {
            promise.reject("PRIME_CACHED_TRACK_ERROR", error)
        }
    }

    @ReactMethod
    fun primeAudioUri(uriString: String, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post { primeAudioUri(uriString, promise) }
            return
        }
        try {
            stopCurrentPlayer()
            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()
            currentExoPlayer = player
            player.setMediaItem(MediaItem.fromUri(Uri.parse(uriString)))
            var settled = false
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && !settled) {
                        settled = true
                        promise.resolve(true)
                    }
                }
            })
            player.prepare()
        } catch (error: Exception) {
            promise.reject("PRIME_AUDIO_URI_ERROR", error)
        }
    }

    @ReactMethod
    fun startPrimedTrackAt(localTargetTimeMs: Double, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post { startPrimedTrackAt(localTargetTimeMs, promise) }
            return
        }
        try {
            val player = currentExoPlayer
            if (player == null) {
                promise.reject("NO_PRIMED_PLAYER", "No prepared player is available")
                return
            }
            val remainingMs = (localTargetTimeMs - System.currentTimeMillis()).toLong().coerceAtLeast(0L)
            Handler(Looper.getMainLooper()).postDelayed({
                if (currentExoPlayer === player) {
                    player.play()
                    startPlaybackLevelEvents()
                }
            }, remainingMs)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("START_PRIMED_TRACK_ERROR", error)
        }
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

    private fun emitPlaybackBars(bars: com.facebook.react.bridge.WritableArray) {
        val event = Arguments.createMap()
        event.putArray("bars", bars)

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PartyPlaybackVisuals", event)
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
    fun getCurrentPlaybackPosition(promise: Promise) {
        try {
            val player = currentExoPlayer
            if (player == null) {
                promise.resolve(-1.0)
                return
            }
            promise.resolve(player.currentPosition.toDouble())
        } catch (error: Exception) {
            promise.reject("GET_PLAYBACK_POSITION_ERROR", error)
        }
    }

    @ReactMethod
    fun seekCurrentPlayback(positionMs: Double, promise: Promise) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            Handler(Looper.getMainLooper()).post {
                seekCurrentPlayback(positionMs, promise)
            }
            return
        }

        try {
            val player = currentExoPlayer
            if (player == null) {
                promise.reject("NO_ACTIVE_PLAYER", "No cached track is currently playing")
                return
            }
            player.seekTo(positionMs.toLong().coerceAtLeast(0L))
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("SEEK_PLAYBACK_ERROR", error)
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


    private fun emitTrackDownloadProgress(trackId: String, percent: Int) {
        val payload = Arguments.createMap()
        payload.putString("trackId", trackId)
        payload.putInt("percent", percent.coerceIn(1, 99))
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("TrackDownloadProgress", payload)
    }

    @ReactMethod
    fun registerTrackForTransfer(trackId: String, uriString: String, promise: Promise) {
        transferTracks[trackId] = uriString
        promise.resolve(true)
    }

    @ReactMethod
    fun startTrackTransferServer(port: Int, promise: Promise) {
        if (transferServerRunning && transferServerSocket != null) {
            promise.resolve(true)
            return
        }

        try {
            val server = ServerSocket(port)
            transferServerSocket = server
            transferServerRunning = true

            thread(name = "PartySpeakerTransferServer", isDaemon = true) {
                while (transferServerRunning) {
                    try {
                        val socket = server.accept()
                        thread(name = "PartySpeakerTransferClient", isDaemon = true) {
                            serveTrack(socket)
                        }
                    } catch (_: Exception) {
                        if (transferServerRunning) {
                            // Keep the loop alive for transient socket errors.
                        }
                    }
                }
            }

            promise.resolve(true)
        } catch (error: Exception) {
            transferServerRunning = false
            transferServerSocket = null
            promise.reject("TRACK_SERVER_ERROR", error)
        }
    }

    private fun serveTrack(socket: Socket) {
        socket.use { client ->
            try {
                client.tcpNoDelay = true
                val input = DataInputStream(client.getInputStream())
                val output = DataOutputStream(client.getOutputStream())
                val trackId = input.readUTF()
                val uriString = transferTracks[trackId]

                if (uriString == null) {
                    output.writeInt(0)
                    output.writeUTF("Track is not registered on host")
                    output.flush()
                    return
                }

                val uri = Uri.parse(uriString)
                val stream = reactContext.contentResolver.openInputStream(uri)
                if (stream == null) {
                    output.writeInt(0)
                    output.writeUTF("Could not open track on host")
                    output.flush()
                    return
                }

                output.writeInt(1)
                val contentLength = try {
                    reactContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
                        descriptor.length
                    } ?: -1L
                } catch (_: Exception) {
                    -1L
                }
                output.writeLong(contentLength)
                val buffer = ByteArray(64 * 1024)
                stream.use { source ->
                    while (true) {
                        val count = source.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                    }
                }
                output.flush()
            } catch (_: Exception) {
                // The client will surface download failures through its promise.
            }
        }
    }

    @ReactMethod
    fun downloadTrackFromHost(
        host: String,
        port: Int,
        trackId: String,
        fileName: String,
        promise: Promise
    ) {
        thread(name = "PartySpeakerTrackDownload") {
            var tempFile: File? = null
            try {
                val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")
                val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val tracksDir = File(reactContext.filesDir, "party_tracks")
                if (!tracksDir.exists()) tracksDir.mkdirs()

                val outputFile = File(tracksDir, "${safeTrackId}_${safeFileName}")
                tempFile = File(tracksDir, "${safeTrackId}_${safeFileName}.part")
                if (tempFile.exists()) tempFile.delete()

                Socket(host, port).use { socket ->
                    socket.tcpNoDelay = true
                    socket.soTimeout = 60000
                    val output = DataOutputStream(socket.getOutputStream())
                    val input = DataInputStream(socket.getInputStream())

                    output.writeUTF(trackId)
                    output.flush()

                    val status = input.readInt()
                    if (status != 1) {
                        val message = try { input.readUTF() } catch (_: Exception) { "Host rejected track download" }
                        throw IllegalStateException(message)
                    }

                    val totalBytes = input.readLong()
                    var downloadedBytes = 0L
                    var lastProgress = 0

                    FileOutputStream(tempFile).use { fileOutput ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            fileOutput.write(buffer, 0, count)
                            downloadedBytes += count

                            if (totalBytes > 0L) {
                                val progress = ((downloadedBytes * 100L) / totalBytes)
                                    .toInt()
                                    .coerceIn(1, 99)
                                if (progress >= lastProgress + 2 || progress >= 99) {
                                    lastProgress = progress
                                    emitTrackDownloadProgress(trackId, progress)
                                }
                            }
                        }
                        fileOutput.flush()
                    }
                }

                if (tempFile.length() <= 0L) {
                    throw IllegalStateException("Downloaded track is empty")
                }

                if (outputFile.exists()) outputFile.delete()
                if (!tempFile.renameTo(outputFile)) {
                    tempFile.copyTo(outputFile, overwrite = true)
                    tempFile.delete()
                }

                promise.resolve(outputFile.absolutePath)
            } catch (error: Exception) {
                try { tempFile?.delete() } catch (_: Exception) {}
                promise.reject("TRACK_DOWNLOAD_ERROR", error)
            }
        }
    }

    @ReactMethod
    fun stopTrackTransferServer(promise: Promise) {
        transferServerRunning = false
        try { transferServerSocket?.close() } catch (_: Exception) {}
        transferServerSocket = null
        promise.resolve(true)
    }

    override fun invalidate() {
        super.invalidate()
        transferServerRunning = false
        try { transferServerSocket?.close() } catch (_: Exception) {}
        transferServerSocket = null
        stopCurrentPlayer()
    }
}
