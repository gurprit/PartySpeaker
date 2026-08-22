import fs from 'node:fs';

const appFile = 'App.tsx';
const nativeFile = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';
let app = fs.readFileSync(appFile, 'utf8');
let native = fs.readFileSync(nativeFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

app = replaceOnce(
  app,
  'scheduled playback prewarm',
  `    setTimeout(async () => {\n      try {\n        await PartyAudio.playCachedTrack(trackId, trackName);\n        currentlyPlayingTrackRef.current = trackId;\n        startNodeDriftMonitor();\n        addLog(\`Playing scheduled cached track: ${'${'}trackName}\`);\n        setStatus(\`Playing: ${'${'}trackName}\`);\n      } catch (error) {\n        addLog(\`Scheduled cached track error: ${'${'}String(error)}\`);\n        Alert.alert('Scheduled playback error', String(error));\n      }\n    }, delay);`,
  `    // Prepare/prime ExoPlayer immediately, while we still have several seconds\n    // before the shared target time. Starting preparation at the target itself\n    // makes first play depend on decoder/file-cache warmup and creates audible\n    // device-to-device skew. Native code waits until this local wall-clock target\n    // before actually starting the already-prepared player.\n    const localTargetTimeMs = Date.now() + delay;\n\n    PartyAudio.prepareCachedTrackAt(trackId, trackName, localTargetTimeMs)\n      .then(() => {\n        currentlyPlayingTrackRef.current = trackId;\n        startNodeDriftMonitor();\n        addLog(\`Playing prewarmed cached track: ${'${'}trackName}\`);\n        setStatus(\`Playing: ${'${'}trackName}\`);\n      })\n      .catch((error: unknown) => {\n        addLog(\`Prewarmed scheduled track error: ${'${'}String(error)}\`);\n        Alert.alert('Scheduled playback error', String(error));\n      });`,
);

native = replaceOnce(
  native,
  'native scheduled prewarm method',
  `\n\n    private fun startPlaybackLevelEvents() {`,
  `\n\n    @ReactMethod\n    fun prepareCachedTrackAt(\n        trackId: String,\n        fileName: String,\n        localTargetTimeMs: Double,\n        promise: Promise\n    ) {\n        if (Looper.myLooper() != Looper.getMainLooper()) {\n            Handler(Looper.getMainLooper()).post {\n                prepareCachedTrackAt(trackId, fileName, localTargetTimeMs, promise)\n            }\n            return\n        }\n\n        try {\n            stopCurrentPlayer()\n\n            val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")\n            val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")\n            val tracksDir = File(reactContext.filesDir, "party_tracks")\n            val file = File(tracksDir, "${'${'}safeTrackId}_${'${'}safeFileName}")\n\n            if (!file.exists()) {\n                promise.reject("CACHED_TRACK_MISSING", "Cached track not found")\n                return\n            }\n\n            val player = ExoPlayer.Builder(reactContext)\n                .setLooper(Looper.getMainLooper())\n                .build()\n            currentExoPlayer = player\n            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))\n\n            var startScheduled = false\n            var promiseSettled = false\n\n            player.addListener(object : Player.Listener {\n                override fun onPlaybackStateChanged(playbackState: Int) {\n                    if (playbackState == Player.STATE_READY && !startScheduled) {\n                        startScheduled = true\n                        val remainingMs = (localTargetTimeMs - System.currentTimeMillis())\n                            .toLong()\n                            .coerceAtLeast(0L)\n\n                        Handler(Looper.getMainLooper()).postDelayed({\n                            if (currentExoPlayer === player) {\n                                player.play()\n                                startPlaybackLevelEvents()\n                                if (!promiseSettled) {\n                                    promiseSettled = true\n                                    promise.resolve(true)\n                                }\n                            } else if (!promiseSettled) {\n                                promiseSettled = true\n                                promise.reject("PREWARM_CANCELLED", "Prepared player was replaced before start")\n                            }\n                        }, remainingMs)\n                    }\n\n                    if (playbackState == Player.STATE_ENDED) {\n                        player.release()\n                        if (currentExoPlayer === player) {\n                            currentExoPlayer = null\n                        }\n                    }\n                }\n            })\n\n            player.prepare()\n        } catch (error: Exception) {\n            promise.reject("PREPARE_CACHED_TRACK_ERROR", error)\n        }\n    }\n\n    private fun startPlaybackLevelEvents() {`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(nativeFile, native);
console.log('PartySpeaker first-play prewarm patch applied.');
