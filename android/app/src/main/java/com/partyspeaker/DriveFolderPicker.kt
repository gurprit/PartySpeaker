package com.partyspeaker

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File
import java.io.FileOutputStream

/**
 * Folder-selection fallback for Google Drive.
 *
 * Google's new mobile Drive folder picker currently has awkward bottom-sheet
 * gesture behaviour on some Android devices. ACTION_OPEN_DOCUMENT_TREE uses
 * Android's mature document browser instead, while still allowing Google Drive
 * to act as the backing document provider. Selected audio is copied into the
 * same temporary party_drive cache used by DriveAudioModule before being handed
 * to PartySpeaker's existing playlist/transfer pipeline.
 */
class DriveFolderPicker(
    private val reactContext: ReactApplicationContext
) {
    private val requestCode = 9950
    private var pendingPromise: Promise? = null

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
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
            treeUri,
            parentDocumentId
        )
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )

        reactContext.contentResolver.query(
            childrenUri,
            projection,
            null,
            null,
            null
        )?.use { cursor ->
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

                val documentUri = DocumentsContract.buildDocumentUriUsingTree(
                    treeUri,
                    documentId
                )

                try {
                    val cachedUri = copyToTemporaryCache(documentUri, name)
                    val item = Arguments.createMap()
                    item.putString("uri", cachedUri)
                    item.putString("name", name)
                    item.putString("source", "google-drive")
                    result.pushMap(item)
                } catch (_: Exception) {
                    // Match the existing local folder behaviour: skip one bad file,
                    // don't abort the entire folder import.
                }
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

    private fun driveCacheDir(): File {
        val dir = File(reactContext.cacheDir, "party_drive")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }
}