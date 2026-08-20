import fs from 'node:fs';

const appFile = 'App.tsx';
const nativeFile = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';

let app = fs.readFileSync(appFile, 'utf8');
let native = fs.readFileSync(nativeFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

// ---------- JS: real download progress + node artwork ----------
app = replaceOnce(
  app,
  'react native imports',
  `  AppState,\n  NativeModules,`,
  `  AppState,\n  Image,\n  NativeEventEmitter,\n  NativeModules,`,
);

app = replaceOnce(
  app,
  'per-node progress ref',
  `  const activeTransferIdsRef = useRef<Set<string>>(new Set());`,
  `  const activeTransferIdsRef = useRef<Set<string>>(new Set());\n  const trackNodeProgressRef = useRef<Record<string, Record<string, number>>>({});`,
);

app = replaceOnce(
  app,
  'native progress listener anchor',
  `  useEffect(() => {\n    const subscription = AppState.addEventListener('change', nextState => {`,
  `  useEffect(() => {\n    const emitter = new NativeEventEmitter(PartyAudio);\n    const subscription = emitter.addListener('TrackDownloadProgress', (event: any) => {\n      const trackId = String(event?.trackId || '');\n      const percent = Math.max(1, Math.min(99, Math.round(Number(event?.percent) || 1)));\n      if (!trackId) return;\n\n      setTrackProgress(trackId, percent);\n\n      if (mode === 'node' && isSocketUsable(clientRef.current)) {\n        writeSocket(clientRef.current, \`TRACK_DOWNLOAD_PROGRESS|${'${'}trackId}|${'${'}percent}\`);\n      }\n    });\n\n    return () => subscription.remove();\n  }, [mode]);\n\n  useEffect(() => {\n    const subscription = AppState.addEventListener('change', nextState => {`,
);

app = replaceOnce(
  app,
  'host progress handler',
  `          if (message.startsWith('TRACK_RECEIVED|')) {`,
  `          if (message.startsWith('TRACK_DOWNLOAD_PROGRESS|')) {\n            const [, trackId, rawPercent] = message.split('|');\n            const percent = Math.max(1, Math.min(99, Math.round(Number(rawPercent) || 1)));\n            const key = socket.remoteAddress || 'unknown';\n\n            if (!trackNodeProgressRef.current[trackId]) {\n              trackNodeProgressRef.current[trackId] = {};\n            }\n            trackNodeProgressRef.current[trackId][key] = percent;\n\n            const liveSockets = clientsRef.current.filter(isSocketUsable);\n            const progressValues = liveSockets.map(clientSocket => {\n              const clientKey = clientSocket.remoteAddress || 'unknown';\n              return cachedTracksRef.current[clientKey]?.includes(trackId)\n                ? 100\n                : trackNodeProgressRef.current[trackId]?.[clientKey] || 0;\n            });\n            const overallProgress = progressValues.length > 0\n              ? Math.max(1, Math.min(99, Math.min(...progressValues)))\n              : percent;\n\n            setTrackProgress(trackId, overallProgress);\n            if (selectedTrackIdRef.current === trackId) {\n              setTransferProgress(overallProgress);\n              setTransferProgressText(\`Uploading to speakers: ${'${'}overallProgress}%\`);\n            }\n            return;\n          }\n\n          if (message.startsWith('TRACK_RECEIVED|')) {`,
);

app = replaceOnce(
  app,
  'fresh calibration each play',
  `  const calibrateNodeClocksBeforePlayback = async () => {\n    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
  `  const calibrateNodeClocksBeforePlayback = async () => {\n    // Never reuse an old "best" sample. Wi-Fi scheduling and device clocks can\n    // shift while the picker/background cycle is happening. Every Play gets a\n    // fresh calibration window.\n    bestClockSampleRef.current = null;\n    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
);

app = replaceOnce(
  app,
  'node playlist progress var',
  `                {playlist.map((track, index) => {\n                  const selected = selectedTrackId === track.id;`,
  `                {playlist.map((track, index) => {\n                  const selected = selectedTrackId === track.id;\n                  const progress = trackTransferStatus[track.id] || 0;`,
);

app = replaceOnce(
  app,
  'node artwork placeholder',
  `                      <View style={{\n                        width: 56,\n                        height: 56,\n                        borderRadius: 16,\n                        backgroundColor: selected ? 'rgba(0,0,0,0.12)' : partyTheme.cardStrong,\n                        justifyContent: 'center',\n                        alignItems: 'center',\n                      }}>\n                        <Text style={{\n                          color: selected ? partyTheme.black : partyTheme.white,\n                          fontSize: 24,\n                          fontWeight: '900',\n                        }}>\n                          {track.name.trim()[0]?.toUpperCase() || '♪'}\n                        </Text>\n                      </View>`,
  `                      <View style={{\n                        width: 56,\n                        height: 56,\n                        borderRadius: 16,\n                        overflow: 'hidden',\n                        backgroundColor: selected ? 'rgba(0,0,0,0.12)' : partyTheme.cardStrong,\n                        justifyContent: 'center',\n                        alignItems: 'center',\n                      }}>\n                        {track.metadata?.artworkUri ? (\n                          <Image\n                            source={{uri: track.metadata.artworkUri}}\n                            style={{width: '100%', height: '100%'}}\n                            resizeMode="cover"\n                          />\n                        ) : (\n                          <Text style={{\n                            color: selected ? partyTheme.black : partyTheme.white,\n                            fontSize: 24,\n                            fontWeight: '900',\n                          }}>\n                            {track.name.trim()[0]?.toUpperCase() || '♪'}\n                          </Text>\n                        )}\n                      </View>`,
);

app = replaceOnce(
  app,
  'node playlist transfer status',
  `                          Synced from host\n                        </Text>`,
  `                          {progress >= 100\n                            ? 'Cached locally'\n                            : progress > 0\n                              ? \`Downloading ${'${'}progress}%\`\n                              : 'Queued from host'}\n                        </Text>`,
);

// ---------- Native transfer protocol: send file length + emit progress ----------
native = replaceOnce(
  native,
  'native progress emitter helper',
  `    @ReactMethod\n    fun registerTrackForTransfer(trackId: String, uriString: String, promise: Promise) {`,
  `    private fun emitTrackDownloadProgress(trackId: String, percent: Int) {\n        val payload = Arguments.createMap()\n        payload.putString("trackId", trackId)\n        payload.putInt("percent", percent.coerceIn(1, 99))\n        reactContext\n            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)\n            .emit("TrackDownloadProgress", payload)\n    }\n\n    @ReactMethod\n    fun registerTrackForTransfer(trackId: String, uriString: String, promise: Promise) {`,
);

native = replaceOnce(
  native,
  'host sends content length',
  `                output.writeInt(1)\n                val buffer = ByteArray(64 * 1024)`,
  `                output.writeInt(1)\n                val contentLength = try {\n                    reactContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->\n                        descriptor.length\n                    } ?: -1L\n                } catch (_: Exception) {\n                    -1L\n                }\n                output.writeLong(contentLength)\n                val buffer = ByteArray(64 * 1024)`,
);

native = replaceOnce(
  native,
  'node reads progress',
  `                    val status = input.readInt()\n                    if (status != 1) {\n                        val message = try { input.readUTF() } catch (_: Exception) { "Host rejected track download" }\n                        throw IllegalStateException(message)\n                    }\n\n                    FileOutputStream(tempFile).use { fileOutput ->\n                        val buffer = ByteArray(64 * 1024)\n                        while (true) {\n                            val count = input.read(buffer)\n                            if (count < 0) break\n                            fileOutput.write(buffer, 0, count)\n                        }\n                        fileOutput.flush()\n                    }`,
  `                    val status = input.readInt()\n                    if (status != 1) {\n                        val message = try { input.readUTF() } catch (_: Exception) { "Host rejected track download" }\n                        throw IllegalStateException(message)\n                    }\n\n                    val totalBytes = input.readLong()\n                    var downloadedBytes = 0L\n                    var lastProgress = 0\n\n                    FileOutputStream(tempFile).use { fileOutput ->\n                        val buffer = ByteArray(64 * 1024)\n                        while (true) {\n                            val count = input.read(buffer)\n                            if (count < 0) break\n                            fileOutput.write(buffer, 0, count)\n                            downloadedBytes += count\n\n                            if (totalBytes > 0L) {\n                                val progress = ((downloadedBytes * 100L) / totalBytes)\n                                    .toInt()\n                                    .coerceIn(1, 99)\n                                if (progress >= lastProgress + 2 || progress >= 99) {\n                                    lastProgress = progress\n                                    emitTrackDownloadProgress(trackId, progress)\n                                }\n                            }\n                        }\n                        fileOutput.flush()\n                    }`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(nativeFile, native);
console.log('PartySpeaker transfer progress + node artwork + fresh sync patch applied.');
