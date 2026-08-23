package com.partyspeaker

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.widget.Toast
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File
import java.io.FileOutputStream
import kotlin.concurrent.thread

/**
 * Stable Google Drive folder selection built on Android's document-tree browser.
 * Folder import now returns lightweight document references immediately. Individual
 * files are materialised into PartySpeaker's temporary cache only when playback or
 * node transfer actually needs them.
 */
class DriveFolderPicker(
    private val reactContext: ReactApplicationContext
) {
    private val requestCode = 9950
    private var pendingPromise: Promise? = null

    private data class PendingAudioDocument(val uri: Uri, val name: String)

    private val supportedExtensions = listOf(
        ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus"
    )

    private val activityEventListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity,
                resultCodeRequest: Int,
                resultCode: Int,
                data: Intent?
            ) {
                if (resultCodeRequest != requestCode) return
                handleResult(resultCode, data)
            }
        }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    fun pickFolder(promise: Promise) {
        if (pendingPromise != null) {
            promise.reject("DRIVE_FOLDER_BUSY", "A folder picker is already open")
            return
        }

        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active Android activity was found")
            return
        }

        cleanupStaleCache()
        pendingPromise = promise

        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            putExtra(Intent.EXTRA_TITLE, "Choose a Google Drive music folder")
        }
        activity.startActivityForResult(intent, requestCode)
    }

    private fun handleResult(resultCode: Int, data: Intent?) {
        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise.reject("DRIVE_FOLDER_CANCELLED", "Google Drive folder picking was cancelled")
            return
        }

        val treeUri = data.data!!
        try {
            reactContext.contentResolver.takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        } catch (_: Exception) {}

        showProgress("Scanning music folder…")
        thread(name = "PartySpeakerDriveFolderScan") {
            try {
                val rootId = DocumentsContract.getTreeDocumentId(treeUri)
                val documents = mutableListOf<PendingAudioDocument>()
                collectAudioDocuments(treeUri, rootId, documents)

                val result = Arguments.createArray()
                documents.forEach { document ->
                    val item = Arguments.createMap()
                    item.putString("uri", document.uri.toString())
                    item.putString("name", document.name)
                    item.putString("source", "google-drive-folder")
                    result.pushMap(item)
                }

                showProgress(
                    if (documents.isEmpty()) "No supported audio found"
                    else "Found ${documents.size} track(s) • ready to browse"
                )
                promise.resolve(result)
            } catch (error: Exception) {
                promise.reject("DRIVE_FOLDER_ERROR", error)
            }
        }
    }

    fun cacheDocument(uriString: String, displayName: String, promise: Promise) {
        thread(name = "PartySpeakerDriveOnDemand") {
            try {
                val cachedUri = copyToTemporaryCache(Uri.parse(uriString), displayName)
                promise.resolve(cachedUri)
            } catch (error: Exception) {
                promise.reject("DRIVE_CACHE_ERROR", error)
            }
        }
    }

    private fun collectAudioDocuments(
        treeUri: Uri,
        parentDocumentId: String,
        result: MutableList<PendingAudioDocument>
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
                if (!isSupportedAudio(mime, name)) continue

                result.add(
                    PendingAudioDocument(
                        DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId),
                        name
                    )
                )
            }
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

        try {
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
                throw IllegalStateException("Google Drive file downloaded as an empty temporary file")
            }
            return Uri.fromFile(outputFile).toString()
        } catch (error: Exception) {
            try { outputFile.delete() } catch (_: Exception) {}
            throw error
        }
    }

    private fun showProgress(message: String) {
        val activity = reactContext.currentActivity ?: return
        activity.runOnUiThread {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        }
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

    private fun driveCacheDir(): File {
        val dir = File(reactContext.cacheDir, "party_drive")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }
}
