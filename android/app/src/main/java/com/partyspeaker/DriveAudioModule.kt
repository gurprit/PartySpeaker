package com.partyspeaker

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

class DriveAudioModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val requestPickTrackCode = 9940
    private val requestPickFolderCode = 9941
    private var pickTrackPromise: Promise? = null
    private var pickFolderPromise: Promise? = null

    private val supportedExtensions = listOf(
        ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus"
    )

    private val activityEventListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity,
                requestCode: Int,
                resultCode: Int,
                data: Intent?
            ) {
                when (requestCode) {
                    requestPickTrackCode -> handleTrackResult(resultCode, data)
                    requestPickFolderCode -> handleFolderResult(resultCode, data)
                }
            }
        }

    init {
        reactContext.addActivityEventListener(activityEventListener)
        cleanupStaleCache()
    }

    override fun getName(): String = "DriveAudio"

    @ReactMethod
    fun pickTrack(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        pickTrackPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "audio/*"
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(Intent.EXTRA_TITLE, "Choose a track from Google Drive")
        }
        activity.startActivityForResult(intent, requestPickTrackCode)
    }

    @ReactMethod
    fun pickFolder(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        pickFolderPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(Intent.EXTRA_TITLE, "Choose a Google Drive music folder")
        }
        activity.startActivityForResult(intent, requestPickFolderCode)
    }

    @ReactMethod
    fun releaseTemporaryTrack(uriString: String, promise: Promise) {
        try {
            val file = temporaryFileForUri(uriString)
            if (file != null && file.exists()) file.delete()
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("DRIVE_CACHE_RELEASE_ERROR", error)
        }
    }

    @ReactMethod
    fun cleanupTemporaryTracks(promise: Promise) {
        try {
            driveCacheDir().listFiles()?.forEach { file ->
                try { file.delete() } catch (_: Exception) {}
            }
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("DRIVE_CACHE_CLEANUP_ERROR", error)
        }
    }

    private fun handleTrackResult(resultCode: Int, data: Intent?) {
        val promise = pickTrackPromise ?: return
        pickTrackPromise = null

        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise.reject("DRIVE_PICK_CANCELLED", "Google Drive track picking was cancelled")
            return
        }

        try {
            val sourceUri = data.data!!
            val name = getDisplayName(sourceUri) ?: "Drive audio"
            ensureSupportedAudio(sourceUri, name)
            val cachedUri = copyToTemporaryCache(sourceUri, name)

            val result = Arguments.createMap()
            result.putString("uri", cachedUri)
            result.putString("name", name)
            result.putString("source", "google-drive")
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("DRIVE_PICK_ERROR", error)
        }
    }

    private fun handleFolderResult(resultCode: Int, data: Intent?) {
        val promise = pickFolderPromise ?: return
        pickFolderPromise = null

        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise.reject("DRIVE_FOLDER_CANCELLED", "Google Drive folder picking was cancelled")
            return
        }

        try {
            val treeUri = data.data!!
            val rootId = DocumentsContract.getTreeDocumentId(treeUri)
            val result = Arguments.createArray()
            collectAudioDocuments(treeUri, rootId, result)
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("DRIVE_FOLDER_ERROR", error)
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
                val name = cursor.getString(nameIndex) ?: "Drive audio"
                val mime = cursor.getString(mimeIndex) ?: ""

                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    collectAudioDocuments(treeUri, documentId, result)
                    continue
                }

                val documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
                if (!isSupportedAudio(mime, name)) continue

                try {
                    val cachedUri = copyToTemporaryCache(documentUri, name)
                    val item = Arguments.createMap()
                    item.putString("uri", cachedUri)
                    item.putString("name", name)
                    item.putString("source", "google-drive")
                    result.pushMap(item)
                } catch (_: Exception) {
                    // Skip a single unreadable Drive file without failing the whole folder import.
                }
            }
        }
    }

    private fun ensureSupportedAudio(uri: Uri, name: String) {
        val mime = reactContext.contentResolver.getType(uri) ?: ""
        if (!isSupportedAudio(mime, name)) {
            throw IllegalArgumentException("Unsupported audio file: $name")
        }
    }

    private fun isSupportedAudio(mime: String, name: String): Boolean {
        if (mime.startsWith("audio/")) return true
        val lower = name.lowercase()
        return supportedExtensions.any { lower.endsWith(it) }
    }

    private fun copyToTemporaryCache(sourceUri: Uri, displayName: String): String {
        val safeName = displayName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val outputFile = File(
            driveCacheDir(),
            "${System.currentTimeMillis()}_${(0..999999).random()}_$safeName"
        )

        val input = reactContext.contentResolver.openInputStream(sourceUri)
            ?: throw IllegalStateException("Could not open Google Drive file")

        input.use { source ->
            FileOutputStream(outputFile).use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val count = source.read(buffer)
                    if (count < 0) break
                    output.write(buffer, 0, count)
                }
                output.flush()
            }
        }

        if (!outputFile.exists() || outputFile.length() <= 0L) {
            try { outputFile.delete() } catch (_: Exception) {}
            throw IllegalStateException("Google Drive file downloaded as an empty temporary file")
        }

        return Uri.fromFile(outputFile).toString()
    }

    private fun getDisplayName(uri: Uri): String? {
        return try {
            reactContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (!cursor.moveToFirst()) return@use null
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) cursor.getString(index) else null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun driveCacheDir(): File {
        val dir = File(reactContext.cacheDir, "party_drive")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun temporaryFileForUri(uriString: String): File? {
        val uri = Uri.parse(uriString)
        if (uri.scheme != "file") return null
        val file = File(uri.path ?: return null)
        val cacheRoot = driveCacheDir().canonicalPath
        val candidate = file.canonicalPath
        return if (candidate.startsWith(cacheRoot + File.separator)) file else null
    }

    private fun cleanupStaleCache() {
        val cutoff = System.currentTimeMillis() - (24L * 60L * 60L * 1000L)
        try {
            driveCacheDir().listFiles()?.forEach { file ->
                if (file.lastModified() < cutoff) {
                    try { file.delete() } catch (_: Exception) {}
                }
            }
        } catch (_: Exception) {}
    }
}
