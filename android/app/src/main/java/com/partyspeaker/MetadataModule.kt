package com.partyspeaker

import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MetadataModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MetadataModule"

    @ReactMethod
    fun read(uriString: String, promise: Promise) {
        val retriever = MediaMetadataRetriever()

        try {
            val uri = Uri.parse(uriString)

            if (
                uriString.startsWith("content://") ||
                uriString.startsWith("file://")
            ) {
                retriever.setDataSource(reactContext, uri)
            } else {
                retriever.setDataSource(uriString)
            }

            val map = Arguments.createMap()

            map.putString(
                "title",
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)
            )

            map.putString(
                "artist",
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)
            )

            map.putString(
                "album",
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)
            )

            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            if (duration != null) {
                map.putDouble("durationMs", duration.toDoubleOrNull() ?: 0.0)
            }

            val artwork = retriever.embeddedPicture
            if (artwork != null) {
                val base64 = Base64.encodeToString(artwork, Base64.NO_WRAP)
                map.putString("artworkUri", "data:image/jpeg;base64,$base64")
            }

            promise.resolve(map)
        } catch (error: Exception) {
            promise.reject("METADATA_ERROR", error)
        } finally {
            try {
                retriever.release()
            } catch (_: Exception) {
            }
        }
    }
}
