package com.partyspeaker

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

class DriveAudioModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val requestAuthorizeTrackCode = 9940
    private val requestAuthorizeFolderCode = 9941
    private val driveFileScope = Scope("https://www.googleapis.com/auth/drive.file")
    private val folderMimeType = "application/vnd.google-apps.folder"

    private var pickTrackPromise: Promise? = null
    private var pickFolderPromise: Promise? = null

    private val supportedExtensions = listOf(
        ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus"
    )

    private val supportedPickerMimeTypes = listOf(
        "audio/mpeg",
        "audio/mp4",
        "audio/aac",
        "audio/wav",
        "audio/x-wav",
        "audio/flac",
        "audio/ogg",
        "audio/opus",
        "application/ogg"
    ).joinToString(",")

    private val activityEventListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity,
                requestCode: Int,
                resultCode: Int,
                data: Intent?
            ) {
                when (requestCode) {
                    requestAuthorizeTrackCode -> handleAuthorizationActivityResult(
                        activity,
                        resultCode,
                        data,
                        false
                    )
                    requestAuthorizeFolderCode -> handleAuthorizationActivityResult(
                        activity,
                        resultCode,
                        data,
                        true
                    )
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
        if (pickTrackPromise != null || pickFolderPromise != null) {
            promise.reject("DRIVE_PICK_BUSY", "A Google Drive picker is already open")
            return
        }
        pickTrackPromise = promise
        startGooglePicker(false)
    }

    @ReactMethod
    fun pickFolder(promise: Promise) {
        if (pickTrackPromise != null || pickFolderPromise != null) {
            promise.reject("DRIVE_PICK_BUSY", "A Google Drive picker is already open")
            return
        }
        pickFolderPromise = promise
        startGooglePicker(true)
    }

    private fun startGooglePicker(forFolder: Boolean) {
        val activity = reactContext.currentActivity
        val promise = if (forFolder) pickFolderPromise else pickTrackPromise
        if (activity == null || promise == null) {
            rejectPendingPicker(forFolder, "NO_ACTIVITY", "No active Android activity was found")
            return
        }

        val builder = AuthorizationRequest.builder()
            .setRequestedScopes(listOf(driveFileScope))
            .setOptOutIncludingGrantedScopes(true)
            .setPrompt(AuthorizationRequest.Prompt.CONSENT)
            .addResourceParameter(
                AuthorizationRequest.ResourceParameter.PICKER_OAUTH_TRIGGER,
                "true"
            )
            .addResourceParameter(
                AuthorizationRequest.ResourceParameter.PICKER_ALLOW_MULTIPLE,
                "false"
            )

        if (forFolder) {
            builder
                .addResourceParameter(
                    AuthorizationRequest.ResourceParameter.PICKER_ALLOW_FOLDER_SELECTION,
                    "true"
                )
                .addResourceParameter(
                    AuthorizationRequest.ResourceParameter.PICKER_MIMETYPES,
                    folderMimeType
                )
        } else {
            builder.addResourceParameter(
                AuthorizationRequest.ResourceParameter.PICKER_MIMETYPES,
                supportedPickerMimeTypes
            )
        }

        val request = builder.build()
        val authorizationClient = Identity.getAuthorizationClient(activity)

        authorizationClient.authorize(request)
            .addOnSuccessListener { authorizationResult ->
                if (authorizationResult.hasResolution()) {
                    val pendingIntent = authorizationResult.pendingIntent
                    if (pendingIntent == null) {
                        rejectPendingPicker(
                            forFolder,
                            "DRIVE_AUTH_ERROR",
                            "Google Drive authorization could not be opened"
                        )
                        return@addOnSuccessListener
                    }

                    try {
                        activity.startIntentSenderForResult(
                            pendingIntent.intentSender,
                            if (forFolder) requestAuthorizeFolderCode else requestAuthorizeTrackCode,
                            null,
                            0,
                            0,
                            0
                        )
                    } catch (error: Exception) {
                        rejectPendingPicker(forFolder, "DRIVE_AUTH_ERROR", error.toString())
                    }
                } else {
                    processPickerAuthorizationResult(authorizationResult, forFolder)
                }
            }
            .addOnFailureListener { error ->
                rejectPendingPicker(
                    forFolder,
                    "DRIVE_AUTH_ERROR",
                    "Could not authorize Google Drive: ${error.message ?: error}"
                )
            }
    }

    private fun handleAuthorizationActivityResult(
        activity: Activity,
        resultCode: Int,
        data: Intent?,
        forFolder: Boolean
    ) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            rejectPendingPicker(
                forFolder,
                if (forFolder) "DRIVE_FOLDER_CANCELLED" else "DRIVE_PICK_CANCELLED",
                if (forFolder) "Google Drive folder picking was cancelled" else "Google Drive track picking was cancelled"
            )
            return
        }

        try {
            val result = Identity.getAuthorizationClient(activity)
                .getAuthorizationResultFromIntent(data)
            processPickerAuthorizationResult(result, forFolder)
        } catch (error: Exception) {
            rejectPendingPicker(
                forFolder,
                "DRIVE_AUTH_RESULT_ERROR",
                "Could not read Google Drive authorization result: ${error.message ?: error}"
            )
        }
    }

    private fun processPickerAuthorizationResult(
        authorizationResult: AuthorizationResult,
        forFolder: Boolean
    ) {
        val promise = if (forFolder) pickFolderPromise else pickTrackPromise
        if (promise == null) return

        val accessToken = authorizationResult.accessToken
        val pickedIds = authorizationResult.tokenResponseParams
            ?.getString("picked_file_ids")
            ?.split(',')
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?: emptyList()

        if (accessToken.isNullOrBlank()) {
            rejectPendingPicker(
                forFolder,
                "DRIVE_TOKEN_MISSING",
                "Google Drive did not return an access token"
            )
            return
        }

        if (pickedIds.isEmpty()) {
            rejectPendingPicker(
                forFolder,
                if (forFolder) "DRIVE_FOLDER_CANCELLED" else "DRIVE_PICK_CANCELLED",
                if (forFolder) "No Google Drive folder was selected" else "No Google Drive track was selected"
            )
            return
        }

        if (forFolder) {
            importDriveFolders(accessToken, pickedIds, promise)
            pickFolderPromise = null
        } else {
            importDriveTrack(accessToken, pickedIds.first(), promise)
            pickTrackPromise = null
        }
    }

    private fun importDriveTrack(accessToken: String, fileId: String, promise: Promise) {
        thread(name = "PartySpeakerDriveTrack") {
            try {
                val metadata = getDriveFileMetadata(accessToken, fileId)
                val name = metadata.optString("name", "Drive audio")
                val mimeType = metadata.optString("mimeType", "")

                if (!isSupportedAudio(mimeType, name)) {
                    throw IllegalArgumentException("Unsupported audio file: $name")
                }

                val cachedUri = downloadDriveFile(accessToken, fileId, name)
                val result = Arguments.createMap()
                result.putString("uri", cachedUri)
                result.putString("name", name)
                result.putString("source", "google-drive")
                result.putString("driveFileId", fileId)
                promise.resolve(result)
            } catch (error: Exception) {
                promise.reject("DRIVE_PICK_ERROR", error)
            }
        }
    }

    private fun importDriveFolders(
        accessToken: String,
        folderIds: List<String>,
        promise: Promise
    ) {
        thread(name = "PartySpeakerDriveFolder") {
            try {
                val files = mutableListOf<DriveFile>()
                val visitedFolders = mutableSetOf<String>()
                folderIds.forEach { folderId ->
                    collectDriveAudioFiles(accessToken, folderId, files, visitedFolders)
                }

                val result = Arguments.createArray()
                files.forEach { driveFile ->
                    try {
                        val cachedUri = downloadDriveFile(
                            accessToken,
                            driveFile.id,
                            driveFile.name
                        )
                        val item = Arguments.createMap()
                        item.putString("uri", cachedUri)
                        item.putString("name", driveFile.name)
                        item.putString("source", "google-drive")
                        item.putString("driveFileId", driveFile.id)
                        result.pushMap(item)
                    } catch (_: Exception) {
                        // Match local folder behaviour: one unreadable file should not abort the folder.
                    }
                }

                promise.resolve(result)
            } catch (error: Exception) {
                promise.reject("DRIVE_FOLDER_ERROR", error)
            }
        }
    }

    private data class DriveFile(
        val id: String,
        val name: String,
        val mimeType: String
    )

    private fun collectDriveAudioFiles(
        accessToken: String,
        folderId: String,
        output: MutableList<DriveFile>,
        visitedFolders: MutableSet<String>
    ) {
        if (!visitedFolders.add(folderId)) return

        var pageToken: String? = null
        do {
            val query = "'$folderId' in parents and trashed = false"
            val url = buildString {
                append("https://www.googleapis.com/drive/v3/files")
                append("?q=")
                append(URLEncoder.encode(query, "UTF-8"))
                append("&fields=")
                append(URLEncoder.encode("nextPageToken,files(id,name,mimeType)", "UTF-8"))
                append("&pageSize=1000")
                append("&supportsAllDrives=true")
                append("&includeItemsFromAllDrives=true")
                if (!pageToken.isNullOrBlank()) {
                    append("&pageToken=")
                    append(URLEncoder.encode(pageToken, "UTF-8"))
                }
            }

            val json = requestJson(accessToken, url)
            val files = json.optJSONArray("files")
            if (files != null) {
                for (index in 0 until files.length()) {
                    val item = files.getJSONObject(index)
                    val id = item.optString("id")
                    val name = item.optString("name", "Drive audio")
                    val mimeType = item.optString("mimeType", "")
                    if (id.isBlank()) continue

                    if (mimeType == folderMimeType) {
                        collectDriveAudioFiles(accessToken, id, output, visitedFolders)
                    } else if (isSupportedAudio(mimeType, name)) {
                        output.add(DriveFile(id, name, mimeType))
                    }
                }
            }

            pageToken = json.optString("nextPageToken").takeIf { it.isNotBlank() }
        } while (pageToken != null)
    }

    private fun getDriveFileMetadata(accessToken: String, fileId: String): JSONObject {
        val encodedId = URLEncoder.encode(fileId, "UTF-8")
        val url = "https://www.googleapis.com/drive/v3/files/$encodedId" +
            "?fields=id,name,mimeType,size&supportsAllDrives=true"
        return requestJson(accessToken, url)
    }

    private fun requestJson(accessToken: String, urlString: String): JSONObject {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 20000
            connection.readTimeout = 60000
            connection.setRequestProperty("Authorization", "Bearer $accessToken")
            connection.setRequestProperty("Accept", "application/json")

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                throw IllegalStateException("Google Drive API error $status: ${body.take(300)}")
            }
            return JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }

    private fun downloadDriveFile(
        accessToken: String,
        fileId: String,
        displayName: String
    ): String {
        val safeName = displayName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val outputFile = File(
            driveCacheDir(),
            "${System.currentTimeMillis()}_${(0..999999).random()}_$safeName"
        )
        val encodedId = URLEncoder.encode(fileId, "UTF-8")
        val connection = URL(
            "https://www.googleapis.com/drive/v3/files/$encodedId?alt=media&supportsAllDrives=true"
        ).openConnection() as HttpURLConnection

        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 20000
            connection.readTimeout = 120000
            connection.setRequestProperty("Authorization", "Bearer $accessToken")

            val status = connection.responseCode
            if (status !in 200..299) {
                val body = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                throw IllegalStateException("Google Drive download error $status: ${body.take(300)}")
            }

            connection.inputStream.use { source ->
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
        } catch (error: Exception) {
            try { outputFile.delete() } catch (_: Exception) {}
            throw error
        } finally {
            connection.disconnect()
        }

        if (!outputFile.exists() || outputFile.length() <= 0L) {
            try { outputFile.delete() } catch (_: Exception) {}
            throw IllegalStateException("Google Drive file downloaded as an empty temporary file")
        }

        return Uri.fromFile(outputFile).toString()
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

    private fun rejectPendingPicker(
        forFolder: Boolean,
        code: String,
        message: String
    ) {
        if (forFolder) {
            pickFolderPromise?.reject(code, message)
            pickFolderPromise = null
        } else {
            pickTrackPromise?.reject(code, message)
            pickTrackPromise = null
        }
    }

    private fun isSupportedAudio(mime: String, name: String): Boolean {
        if (mime.startsWith("audio/")) return true
        val lower = name.lowercase()
        return supportedExtensions.any { lower.endsWith(it) }
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
