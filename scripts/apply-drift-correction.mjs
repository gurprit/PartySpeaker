import fs from 'node:fs';

const appFile = 'App.tsx';
const nativeFile = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';

let app = fs.readFileSync(appFile, 'utf8');
let native = fs.readFileSync(nativeFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

native = replaceOnce(
  native,
  'native playback position methods',
  `    @ReactMethod\n    fun playBeep(promise: Promise) {`,
  `    @ReactMethod\n    fun getCurrentPlaybackPosition(promise: Promise) {\n        try {\n            val player = currentExoPlayer\n            if (player == null) {\n                promise.resolve(-1.0)\n                return\n            }\n            promise.resolve(player.currentPosition.toDouble())\n        } catch (error: Exception) {\n            promise.reject("GET_PLAYBACK_POSITION_ERROR", error)\n        }\n    }\n\n    @ReactMethod\n    fun seekCurrentPlayback(positionMs: Double, promise: Promise) {\n        if (Looper.myLooper() != Looper.getMainLooper()) {\n            Handler(Looper.getMainLooper()).post {\n                seekCurrentPlayback(positionMs, promise)\n            }\n            return\n        }\n\n        try {\n            val player = currentExoPlayer\n            if (player == null) {\n                promise.reject("NO_ACTIVE_PLAYER", "No cached track is currently playing")\n                return\n            }\n            player.seekTo(positionMs.toLong().coerceAtLeast(0L))\n            promise.resolve(true)\n        } catch (error: Exception) {\n            promise.reject("SEEK_PLAYBACK_ERROR", error)\n        }\n    }\n\n    @ReactMethod\n    fun playBeep(promise: Promise) {`,
);

app = replaceOnce(
  app,
  'drift constants',
  `const TRACK_CACHE_TIMEOUT_MS = 120000;`,
  `const TRACK_CACHE_TIMEOUT_MS = 120000;\nconst DRIFT_CHECK_INTERVAL_MS = 1500;\nconst DRIFT_HARD_RESYNC_MS = 350;\nconst DRIFT_LOG_THRESHOLD_MS = 150;`,
);

app = replaceOnce(
  app,
  'drift timer ref',
  `  const nodeReconnectTimerRef = useRef<any>(null);`,
  `  const nodeDriftTimerRef = useRef<any>(null);\n  const nodeReconnectTimerRef = useRef<any>(null);`,
);

app = replaceOnce(
  app,
  'start drift monitor helper anchor',
  `  const stopPlaybackUiClock = () => {`,
  `  const stopNodeDriftMonitor = () => {\n    if (nodeDriftTimerRef.current) {\n      clearInterval(nodeDriftTimerRef.current);\n      nodeDriftTimerRef.current = null;\n    }\n  };\n\n  const startNodeDriftMonitor = () => {\n    stopNodeDriftMonitor();\n\n    nodeDriftTimerRef.current = setInterval(async () => {\n      if (mode !== 'node' || appStateRef.current !== 'active') return;\n      if (!nowPlayingRef.current || !currentlyPlayingTrackRef.current) return;\n\n      try {\n        const actualPosition = Number(await PartyAudio.getCurrentPlaybackPosition());\n        if (!Number.isFinite(actualPosition) || actualPosition < 0) return;\n\n        const expectedPosition = Math.max(\n          0,\n          getNodeHostNowMs() - nowPlayingRef.current.startedAtHostMs + getPlaybackDelayCompensationMs(),\n        );\n        const driftMs = actualPosition - expectedPosition;\n\n        if (Math.abs(driftMs) >= DRIFT_LOG_THRESHOLD_MS) {\n          addLog(\`Playback drift: ${'${'}Math.round(driftMs)}ms\`);\n        }\n\n        if (Math.abs(driftMs) >= DRIFT_HARD_RESYNC_MS) {\n          await PartyAudio.seekCurrentPlayback(expectedPosition);\n          addLog(\`Playback resynced by ${'${'}Math.round(-driftMs)}ms\`);\n        }\n      } catch (error) {\n        addLog(\`Drift check skipped: ${'${'}String(error)}\`);\n      }\n    }, DRIFT_CHECK_INTERVAL_MS);\n  };\n\n  const stopPlaybackUiClock = () => {`,
);

app = replaceOnce(
  app,
  'stop drift with ui clock',
  `    currentlyPlayingTrackRef.current = null;\n    setPlaybackPositionText('0:00');`,
  `    stopNodeDriftMonitor();\n    currentlyPlayingTrackRef.current = null;\n    setPlaybackPositionText('0:00');`,
);

app = replaceOnce(
  app,
  'start drift after catchup',
  `      currentlyPlayingTrackRef.current = trackId;\n      addLog(\`Playing cached track from ${'${'}Math.round(safePosition)}ms: ${'${'}trackName}\`);`,
  `      currentlyPlayingTrackRef.current = trackId;\n      startNodeDriftMonitor();\n      addLog(\`Playing cached track from ${'${'}Math.round(safePosition)}ms: ${'${'}trackName}\`);`,
);

app = replaceOnce(
  app,
  'start drift after scheduled play',
  `      currentlyPlayingTrackRef.current = trackId;\n      setStatus(\`Playing cached track: ${'${'}trackName}\`);`,
  `      currentlyPlayingTrackRef.current = trackId;\n      startNodeDriftMonitor();\n      setStatus(\`Playing cached track: ${'${'}trackName}\`);`,
);

app = replaceOnce(
  app,
  'foreground immediate drift reset',
  `        currentlyPlayingTrackRef.current = null;\n\n        if (isSocketUsable(clientRef.current)) {`,
  `        stopNodeDriftMonitor();\n        currentlyPlayingTrackRef.current = null;\n\n        if (isSocketUsable(clientRef.current)) {`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(nativeFile, native);
console.log('PartySpeaker continuous drift correction patch applied.');
