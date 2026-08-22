import fs from 'node:fs';

const appFile = 'App.tsx';
const nativeFile = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';
let app = fs.readFileSync(appFile, 'utf8');
let native = fs.readFileSync(nativeFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

// ---------------- Native dual-player standby support ----------------
native = replaceOnce(
  native,
  'standby player field',
  '    private var currentExoPlayer: ExoPlayer? = null\n',
  '    private var currentExoPlayer: ExoPlayer? = null\n    private var standbyExoPlayer: ExoPlayer? = null\n',
);

const primeAnchor = `    @ReactMethod\n    fun primeCachedTrack(trackId: String, fileName: String, promise: Promise) {`;
const standbyMethods = `    @ReactMethod\n    fun primeStandbyCachedTrack(trackId: String, fileName: String, promise: Promise) {\n        if (Looper.myLooper() != Looper.getMainLooper()) {\n            Handler(Looper.getMainLooper()).post { primeStandbyCachedTrack(trackId, fileName, promise) }\n            return\n        }\n        try {\n            try { standbyExoPlayer?.release() } catch (_: Exception) {}\n            standbyExoPlayer = null\n\n            val safeTrackId = trackId.replace(Regex(\"[^A-Za-z0-9_-]\"), \"_\")\n            val safeFileName = fileName.replace(Regex(\"[^A-Za-z0-9._-]\"), \"_\")\n            val file = File(File(reactContext.filesDir, \"party_tracks\"), \"\${safeTrackId}_\${safeFileName}\")\n            if (!file.exists()) {\n                promise.reject(\"STANDBY_TRACK_MISSING\", \"Cached standby track not found\")\n                return\n            }\n\n            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()\n            standbyExoPlayer = player\n            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))\n            var settled = false\n            player.addListener(object : Player.Listener {\n                override fun onPlaybackStateChanged(state: Int) {\n                    if (state == Player.STATE_READY && !settled && standbyExoPlayer === player) {\n                        settled = true\n                        promise.resolve(true)\n                    }\n                }\n                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {\n                    if (!settled) {\n                        settled = true\n                        promise.reject(\"STANDBY_PRIME_ERROR\", error.message, error)\n                    }\n                }\n            })\n            Handler(Looper.getMainLooper()).postDelayed({\n                if (!settled && standbyExoPlayer === player) {\n                    settled = true\n                    promise.reject(\"STANDBY_PRIME_TIMEOUT\", \"Standby player did not become ready within 15000ms\")\n                }\n            }, 15000L)\n            player.prepare()\n        } catch (error: Exception) {\n            promise.reject(\"STANDBY_PRIME_CACHED_ERROR\", error)\n        }\n    }\n\n    @ReactMethod\n    fun primeStandbyAudioUri(uriString: String, promise: Promise) {\n        if (Looper.myLooper() != Looper.getMainLooper()) {\n            Handler(Looper.getMainLooper()).post { primeStandbyAudioUri(uriString, promise) }\n            return\n        }\n        try {\n            try { standbyExoPlayer?.release() } catch (_: Exception) {}\n            standbyExoPlayer = null\n            val player = ExoPlayer.Builder(reactContext).setLooper(Looper.getMainLooper()).build()\n            standbyExoPlayer = player\n            player.setMediaItem(MediaItem.fromUri(Uri.parse(uriString)))\n            var settled = false\n            player.addListener(object : Player.Listener {\n                override fun onPlaybackStateChanged(state: Int) {\n                    if (state == Player.STATE_READY && !settled && standbyExoPlayer === player) {\n                        settled = true\n                        promise.resolve(true)\n                    }\n                }\n                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {\n                    if (!settled) {\n                        settled = true\n                        promise.reject(\"STANDBY_URI_PRIME_ERROR\", error.message, error)\n                    }\n                }\n            })\n            player.prepare()\n        } catch (error: Exception) {\n            promise.reject(\"STANDBY_PRIME_URI_ERROR\", error)\n        }\n    }\n\n    @ReactMethod\n    fun startStandbyTrackAt(localTargetTimeMs: Double, promise: Promise) {\n        if (Looper.myLooper() != Looper.getMainLooper()) {\n            Handler(Looper.getMainLooper()).post { startStandbyTrackAt(localTargetTimeMs, promise) }\n            return\n        }\n        val standby = standbyExoPlayer\n        if (standby == null) {\n            promise.reject(\"NO_STANDBY_PLAYER\", \"No prepared standby player is available\")\n            return\n        }\n        val remainingMs = (localTargetTimeMs - System.currentTimeMillis()).toLong().coerceAtLeast(0L)\n        Handler(Looper.getMainLooper()).postDelayed({\n            if (standbyExoPlayer === standby) {\n                stopPlaybackLevelEvents()\n                try { currentExoPlayer?.stop() } catch (_: Exception) {}\n                try { currentExoPlayer?.release() } catch (_: Exception) {}\n                currentExoPlayer = standby\n                standbyExoPlayer = null\n                standby.play()\n                startPlaybackLevelEvents()\n            }\n        }, remainingMs)\n        promise.resolve(true)\n    }\n\n`;
native = native.replace(primeAnchor, standbyMethods + primeAnchor);
if (!native.includes('fun primeStandbyCachedTrack')) throw new Error('Patch failed: native standby methods');

// ---------------- JS host/node standby state ----------------
app = replaceOnce(
  app,
  'standby refs',
  `  const strictPreparedNodesRef = useRef<Set<string>>(new Set());\n`,
  `  const strictPreparedNodesRef = useRef<Set<string>>(new Set());\n  const standbyTrackIdRef = useRef<string | null>(null);\n  const standbyPreparedNodesRef = useRef<Set<string>>(new Set());\n  const standbyHostReadyRef = useRef(false);\n`,
);

// Host handles standby ACKs.
app = replaceOnce(
  app,
  'host standby ack',
  `          if (message.startsWith('TRACK_PRIMED|')) {`,
  `          if (message.startsWith('NEXT_TRACK_PREWARMED|')) {\n            const [, trackId] = message.split('|');\n            if (trackId && standbyTrackIdRef.current === trackId) {\n              const key = socket.remoteAddress || 'unknown';\n              standbyPreparedNodesRef.current.add(key);\n              addLog(\`Next track prewarmed: ${'${'}key} (${ '${'}standbyPreparedNodesRef.current.size}/${'${'}clientsRef.current.filter(isSocketUsable).length})\`);\n            }\n            return;\n          }\n\n          if (message.startsWith('TRACK_PRIMED|')) {`,
);

// Node prewarms without disturbing current playback.
app = replaceOnce(
  app,
  'node prewarm handler',
  `      if (message.startsWith('PREPARE_TRACK|')) {`,
  `      if (message.startsWith('PREWARM_NEXT_TRACK|')) {\n        try {\n          const payload = JSON.parse(message.replace('PREWARM_NEXT_TRACK|', ''));\n          if (!payload.id || !payload.name) return;\n          await PartyAudio.primeStandbyCachedTrack(payload.id, payload.name);\n          writeSocket(clientRef.current || client, \`NEXT_TRACK_PREWARMED|${'${'}payload.id}\`);\n          addLog(\`Standby track ready: ${'${'}payload.name}\`);\n        } catch (error) {\n          addLog(\`Standby prewarm skipped: ${'${'}String(error)}\`);\n        }\n        return;\n      }\n\n      if (message.startsWith('START_STANDBY_AT|')) {\n        try {\n          const payload = JSON.parse(message.replace('START_STANDBY_AT|', ''));\n          if (!payload.id || !payload.name || !payload.targetTimeMs) return;\n          const localTargetTimeMs = Date.now() + Math.max(0, payload.targetTimeMs - getNodeHostNowMs()) + getPlaybackDelayCompensationMs();\n          nowPlayingRef.current = {trackId: payload.id, trackName: payload.name, startedAtHostMs: payload.targetTimeMs};\n          setNowPlayingTrackId(payload.id);\n          startPlaybackUiClock(payload.name, payload.targetTimeMs);\n          await PartyAudio.startStandbyTrackAt(localTargetTimeMs);\n          currentlyPlayingTrackRef.current = payload.id;\n          startNodeDriftMonitor();\n          setStatus(\`Playing: ${'${'}payload.name}\`);\n        } catch (error) {\n          addLog(\`Standby start error: ${'${'}String(error)}\`);\n        }\n        return;\n      }\n\n      if (message.startsWith('PREPARE_TRACK|')) {`,
);

// Helper: warm the next playlist item while current track is playing.
app = replaceOnce(
  app,
  'insert prewarm helper',
  `  const playSelectedTrackOnAllSpeakers = async (trackOverride?: Track) => {`,
  `  const prewarmFollowingTrack = async (currentTrackId: string) => {\n    const currentIndex = playlistRef.current.findIndex(track => track.id === currentTrackId);\n    const nextTrack = currentIndex >= 0 ? playlistRef.current[currentIndex + 1] : null;\n    if (!nextTrack || !isTrackCachedOnAllNodes(nextTrack.id)) {\n      standbyTrackIdRef.current = null;\n      standbyPreparedNodesRef.current = new Set();\n      standbyHostReadyRef.current = false;\n      return;\n    }\n\n    standbyTrackIdRef.current = nextTrack.id;\n    standbyPreparedNodesRef.current = new Set();\n    standbyHostReadyRef.current = false;\n    const liveSockets = clientsRef.current.filter(isSocketUsable);\n    const payload = {id: nextTrack.id, name: nextTrack.name};\n    liveSockets.forEach(socket => writeSocket(socket, \`PREWARM_NEXT_TRACK|${'${'}JSON.stringify(payload)}\`));\n\n    try {\n      await PartyAudio.primeStandbyAudioUri(nextTrack.uri);\n      if (standbyTrackIdRef.current === nextTrack.id) {\n        standbyHostReadyRef.current = true;\n        addLog(\`Host standby ready: ${'${'}nextTrack.name}\`);\n      }\n    } catch (error) {\n      addLog(\`Host standby prewarm skipped: ${'${'}String(error)}\`);\n    }\n  };\n\n  const playSelectedTrackOnAllSpeakers = async (trackOverride?: Track) => {`,
);

// Fast path at beginning of play after cache check but before normal prepare barrier.
app = replaceOnce(
  app,
  'standby fast path',
  `    // Stop the previous track heartbeat before priming a replacement. Otherwise\n`,
  `    const liveSocketsForStandby = clientsRef.current.filter(isSocketUsable);\n    const standbyReadyEverywhere =\n      standbyTrackIdRef.current === selected.id &&\n      standbyHostReadyRef.current &&\n      liveSocketsForStandby.length > 0 &&\n      liveSocketsForStandby.every(socket =>\n        standbyPreparedNodesRef.current.has(socket.remoteAddress || 'unknown'),\n      );\n\n    if (standbyReadyEverywhere) {\n      if (nowPlayingBroadcastTimerRef.current) {\n        clearInterval(nowPlayingBroadcastTimerRef.current);\n        nowPlayingBroadcastTimerRef.current = null;\n      }\n      await calibrateNodeClocksBeforePlayback();\n      const targetTimeMs = Date.now() + 850;\n      const payload = {id: selected.id, name: selected.name, targetTimeMs};\n      nowPlayingRef.current = {trackId: selected.id, trackName: selected.name, startedAtHostMs: targetTimeMs};\n      setNowPlayingTrackId(selected.id);\n      setCurrentTrackName(selected.name);\n      if (selected.metadata) setCurrentTrackMetadata(selected.metadata);\n      liveSocketsForStandby.forEach(socket => writeSocket(socket, \`START_STANDBY_AT|${'${'}JSON.stringify(payload)}\`));\n      await PartyAudio.startStandbyTrackAt(targetTimeMs);\n      standbyTrackIdRef.current = null;\n      standbyPreparedNodesRef.current = new Set();\n      standbyHostReadyRef.current = false;\n      nowPlayingBroadcastTimerRef.current = setInterval(broadcastNowPlaying, 3000);\n      startPlaybackUiClock(selected.name, targetTimeMs);\n      setPlaybackState('playing');\n      setStatus('Next track prewarmed • synchronized start scheduled');\n      addLog(\`Fast standby start: ${'${'}selected.name}\`);\n      setTimeout(() => prewarmFollowingTrack(selected.id), 1200);\n      return;\n    }\n\n    // Stop the previous track heartbeat before priming a replacement. Otherwise\n`,
);

// After normal strict start, begin warming the next item.
app = replaceOnce(
  app,
  'prewarm after strict start',
  `    setStatus('All speakers ready • synchronized start scheduled');\n  };`,
  `    setStatus('All speakers ready • synchronized start scheduled');\n    setTimeout(() => prewarmFollowingTrack(selected.id), 1200);\n  };`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(nativeFile, native);
console.log('PartySpeaker standby next-track prewarm v1 patch applied.');
