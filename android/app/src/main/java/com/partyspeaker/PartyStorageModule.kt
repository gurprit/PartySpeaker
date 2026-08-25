package com.partyspeaker

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import kotlin.concurrent.thread

/**
 * Reports and clears only PartySpeaker-owned disposable audio files.
 *
 * - filesDir/party_tracks: tracks downloaded to speaker nodes
 * - cacheDir/party_drive: temporary Google Drive materialisations
 *
 * No preferences, app settings, metadata or unrelated Android cache files are touched.
 */
class PartyStorageModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PartyStorage"

    @ReactMethod
    fun getTemporaryStorageInfo(promise: Promise) {
        thread(name = "PartySpeakerStorageInfo") {
            try {
                val speakerDir = File(reactContext.filesDir, "party_tracks")
                val driveDir = File(reactContext.cacheDir, "party_drive")

                val speakerStats = directoryStats(speakerDir)
                val driveStats = directoryStats(driveDir)

                val result = Arguments.createMap()
                result.putDouble("speakerCacheBytes", speakerStats.first.toDouble())
                result.putInt("speakerCacheFiles", speakerStats.second)
                result.putDouble("driveCacheBytes", driveStats.first.toDouble())
                result.putInt("driveCacheFiles", driveStats.second)
                result.putDouble(
                    "totalBytes",
                    (speakerStats.first + driveStats.first).toDouble()
                )
                result.putInt("totalFiles", speakerStats.second + driveStats.second)
                promise.resolve(result)
            } catch (error: Exception) {
                promise.reject("STORAGE_INFO_ERROR", error)
            }
        }
    }

    @ReactMethod
    fun purgeTemporaryFiles(promise: Promise) {
        thread(name = "PartySpeakerStoragePurge") {
            try {
                val speakerDir = File(reactContext.filesDir, "party_tracks")
                val driveDir = File(reactContext.cacheDir, "party_drive")

                val beforeSpeaker = directoryStats(speakerDir)
                val beforeDrive = directoryStats(driveDir)
                val beforeBytes = beforeSpeaker.first + beforeDrive.first
                val beforeFiles = beforeSpeaker.second + beforeDrive.second

                deleteDirectoryContents(speakerDir)
                deleteDirectoryContents(driveDir)

                // Recreate the directories so existing playback/download code can
                // immediately use them again without any special recovery path.
                if (!speakerDir.exists()) speakerDir.mkdirs()
                if (!driveDir.exists()) driveDir.mkdirs()

                val afterSpeaker = directoryStats(speakerDir)
                val afterDrive = directoryStats(driveDir)
                val afterBytes = afterSpeaker.first + afterDrive.first

                val result = Arguments.createMap()
                result.putDouble("freedBytes", (beforeBytes - afterBytes).coerceAtLeast(0L).toDouble())
                result.putInt("deletedFiles", beforeFiles - afterSpeaker.second - afterDrive.second)
                result.putDouble("remainingBytes", afterBytes.toDouble())
                promise.resolve(result)
            } catch (error: Exception) {
                promise.reject("STORAGE_PURGE_ERROR", error)
            }
        }
    }

    private fun directoryStats(directory: File): Pair<Long, Int> {
        if (!directory.exists()) return 0L to 0

        var bytes = 0L
        var files = 0
        directory.walkTopDown().forEach { item ->
            if (item.isFile) {
                bytes += item.length().coerceAtLeast(0L)
                files += 1
            }
        }
        return bytes to files
    }

    private fun deleteDirectoryContents(directory: File) {
        if (!directory.exists()) return
        directory.listFiles()?.forEach { item ->
            try {
                if (item.isDirectory) item.deleteRecursively() else item.delete()
            } catch (_: Exception) {
                // Continue clearing other disposable files. A file held open by
                // Android may survive this pass and will be reflected in the
                // remaining-byte count returned to the UI.
            }
        }
    }
}
