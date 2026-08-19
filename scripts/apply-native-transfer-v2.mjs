import fs from 'node:fs';

const appPath = 'App.tsx';
const nativePath = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';
let app = fs.readFileSync(appPath, 'utf8');
let native = fs.readFileSync(nativePath, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

const replaceRegex = (source, label, regex, replacement) => {
  if (!regex.test(source)) throw new Error(`Patch failed: ${label}`);
  return source.replace(regex, replacement);
};

// ---------- Android native binary transfer ----------

native = replaceOnce(
  native,
  'native imports',
  'import java.io.File\nimport java.io.FileOutputStream\nimport java.net.NetworkInterface',
  'import java.io.DataInputStream\nimport java.io.DataOutputStream\nimport java.io.File\nimport java.io.FileOutputStream\nimport java.net.NetworkInterface\nimport java.net.ServerSocket\nimport java.net.Socket\nimport java.util.concurrent.ConcurrentHashMap',
);

native = replaceOnce(
  native,
  'native fields',
  '    private var playbackLevelHandler: Handler? = null',
  `    private var playbackLevelHandler: Handler? = null\n    private val transferTracks = ConcurrentHashMap<String, String>()\n    @Volatile private var transferServerSocket: ServerSocket? = null\n    @Volatile private var transferServerRunning = false`,
);

const nativeMethods = `
    @ReactMethod
    fun registerTrackForTransfer(trackId: String, uriString: String, promise: Promise) {
        transferTracks[trackId] = uriString
        promise.resolve(true)
    }

    @ReactMethod
    fun startTrackTransferServer(port: Int, promise: Promise) {
        if (transferServerRunning && transferServerSocket != null) {
            promise.resolve(true)
            return
        }

        try {
            val server = ServerSocket(port)
            transferServerSocket = server
            transferServerRunning = true

            thread(name = "PartySpeakerTransferServer", isDaemon = true) {
                while (transferServerRunning) {
                    try {
                        val socket = server.accept()
                        thread(name = "PartySpeakerTransferClient", isDaemon = true) {
                            serveTrack(socket)
                        }
                    } catch (_: Exception) {
                        if (transferServerRunning) {
                            // Keep the loop alive for transient socket errors.
                        }
                    }
                }
            }

            promise.resolve(true)
        } catch (error: Exception) {
            transferServerRunning = false
            transferServerSocket = null
            promise.reject("TRACK_SERVER_ERROR", error)
        }
    }

    private fun serveTrack(socket: Socket) {
        socket.use { client ->
            try {
                client.tcpNoDelay = true
                val input = DataInputStream(client.getInputStream())
                val output = DataOutputStream(client.getOutputStream())
                val trackId = input.readUTF()
                val uriString = transferTracks[trackId]

                if (uriString == null) {
                    output.writeInt(0)
                    output.writeUTF("Track is not registered on host")
                    output.flush()
                    return
                }

                val uri = Uri.parse(uriString)
                val stream = reactContext.contentResolver.openInputStream(uri)
                if (stream == null) {
                    output.writeInt(0)
                    output.writeUTF("Could not open track on host")
                    output.flush()
                    return
                }

                output.writeInt(1)
                val buffer = ByteArray(64 * 1024)
                stream.use { source ->
                    while (true) {
                        val count = source.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                    }
                }
                output.flush()
            } catch (_: Exception) {
                // The client will surface download failures through its promise.
            }
        }
    }

    @ReactMethod
    fun downloadTrackFromHost(
        host: String,
        port: Int,
        trackId: String,
        fileName: String,
        promise: Promise
    ) {
        thread(name = "PartySpeakerTrackDownload") {
            var tempFile: File? = null
            try {
                val safeTrackId = trackId.replace(Regex("[^A-Za-z0-9_-]"), "_")
                val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val tracksDir = File(reactContext.filesDir, "party_tracks")
                if (!tracksDir.exists()) tracksDir.mkdirs()

                val outputFile = File(tracksDir, "${safeTrackId}_${safeFileName}")
                tempFile = File(tracksDir, "${safeTrackId}_${safeFileName}.part")
                if (tempFile.exists()) tempFile.delete()

                Socket(host, port).use { socket ->
                    socket.tcpNoDelay = true
                    socket.soTimeout = 60000
                    val output = DataOutputStream(socket.getOutputStream())
                    val input = DataInputStream(socket.getInputStream())

                    output.writeUTF(trackId)
                    output.flush()

                    val status = input.readInt()
                    if (status != 1) {
                        val message = try { input.readUTF() } catch (_: Exception) { "Host rejected track download" }
                        throw IllegalStateException(message)
                    }

                    FileOutputStream(tempFile).use { fileOutput ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            fileOutput.write(buffer, 0, count)
                        }
                        fileOutput.flush()
                    }
                }

                if (tempFile.length() <= 0L) {
                    throw IllegalStateException("Downloaded track is empty")
                }

                if (outputFile.exists()) outputFile.delete()
                if (!tempFile.renameTo(outputFile)) {
                    tempFile.copyTo(outputFile, overwrite = true)
                    tempFile.delete()
                }

                promise.resolve(outputFile.absolutePath)
            } catch (error: Exception) {
                try { tempFile?.delete() } catch (_: Exception) {}
                promise.reject("TRACK_DOWNLOAD_ERROR", error)
            }
        }
    }

    @ReactMethod
    fun stopTrackTransferServer(promise: Promise) {
        transferServerRunning = false
        try { transferServerSocket?.close() } catch (_: Exception) {}
        transferServerSocket = null
        promise.resolve(true)
    }
`;

native = replaceOnce(
  native,
  'insert native transfer methods',
  '    override fun invalidate() {',
  `${nativeMethods}\n    override fun invalidate() {`,
);

native = replaceOnce(
  native,
  'native invalidate',
  `    override fun invalidate() {\n        super.invalidate()\n        stopCurrentPlayer()\n    }`,
  `    override fun invalidate() {\n        super.invalidate()\n        transferServerRunning = false\n        try { transferServerSocket?.close() } catch (_: Exception) {}\n        transferServerSocket = null\n        stopCurrentPlayer()\n    }`,
);

// ---------- React Native control plane ----------

if (!app.includes("import MetadataService from './src/services/MetadataService';")) {
  app = app.replace(
    "import {TrackMetadata} from './src/types/TrackMetadata';",
    "import {TrackMetadata} from './src/types/TrackMetadata';\nimport MetadataService from './src/services/MetadataService';",
  );
}

app = replaceOnce(
  app,
  'track metadata field',
  `type Track = {\n  id: string;\n  name: string;\n  uri: string;\n};`,
  `type Track = {\n  id: string;\n  name: string;\n  uri: string;\n  metadata?: TrackMetadata;\n};`,
);

// Remove the JS transfer server/connection plumbing if the previous dual-channel patch is present.
app = app.replace(/\n  const startTransferServer = \(\) => \{[\s\S]*?\n  \};\n\n(?=  const startHostServer)/, '\n');
app = app.replace(/\n    const transferClient = TcpSocket\.createConnection\([\s\S]*?transferClientRef\.current = null;\n    \}\);\n\n(?=    client\.on\('data')/, '\n');

// Host starts the native binary server instead of a JS data socket.
app = app.replace('    startTransferServer();', '    await PartyAudio.startTrackTransferServer(TRANSFER_PORT);');
if (!app.includes('await PartyAudio.startTrackTransferServer(TRANSFER_PORT);')) {
  app = replaceOnce(
    app,
    'start native server',
    '    await refreshHostAddress();\n\n    if (serverRef.current)',
    '    await refreshHostAddress();\n    await PartyAudio.startTrackTransferServer(TRANSFER_PORT);\n\n    if (serverRef.current)',
  );
}

// Remove old transfer socket shutdown blocks and stop the native server.
app = app.replace(/\n    transferClientsRef\.current\.forEach\(socket => socket\.destroy\(\)\);[\s\S]*?transferServerRef\.current = null;\n    \}/, '');
app = app.replace(/\n    if \(transferClientRef\.current\) \{[\s\S]*?transferClientRef\.current = null;\n    \}\n/, '\n');

if (!app.includes('PartyAudio.stopTrackTransferServer')) {
  app = replaceOnce(
    app,
    'stop native server',
    `    if (serverRef.current) {\n      serverRef.current.close();\n      serverRef.current = null;\n    }`,
    `    if (serverRef.current) {\n      serverRef.current.close();\n      serverRef.current = null;\n    }\n\n    PartyAudio.stopTrackTransferServer().catch(() => {});`,
  );
}

// Replace addTrack so metadata is extracted before any transfer begins.
app = replaceRegex(
  app,
  'addTrack v2',
  /  const addTrack = async \(\) => \{[\s\S]*?\n  \};\n\n(?=  const removeSelectedTrack)/,
  `  const addTrack = async () => {\n    try {\n      const result = await PartyAudio.pickAudioFile();\n      const trackName = result.name || 'Selected audio';\n      const metadata = await MetadataService.getMetadata(trackName, result.uri);\n\n      const track: Track = {\n        id: \`${'${'}Date.now()}-${'${'}Math.random()}\`,\n        name: trackName,\n        uri: result.uri,\n        metadata,\n      };\n\n      await PartyAudio.registerTrackForTransfer(track.id, track.uri);\n\n      const nextPlaylist = [...playlist, track];\n      setPlaylist(nextPlaylist);\n      setSelectedTrackId(track.id);\n      setCurrentTrackName(track.name);\n      setCurrentTrackMetadata(metadata);\n      setPlaybackState('idle');\n      setTrackProgress(track.id, 0);\n      setTransferProgress(0);\n      setTransferProgressText(\`Waiting for speakers: ${'${'}track.name}\`);\n      addLog(\`Added track + metadata: ${'${'}track.name}\`);\n\n      // Metadata/playlist goes out first on the tiny control channel.\n      syncPlaylistSnapshotToNodes(nextPlaylist, track.id);\n\n      // Give the control message a moment to render, then ask nodes to download\n      // the binary file natively. No Base64 crosses the JS bridge.\n      setTimeout(() => transferSelectedTrackToNodes(track), 150);\n    } catch (error) {\n      addLog(\`Add track cancelled/error: ${'${'}String(error)}\`);\n    }\n  };\n\n`,
);

// Transfer now means "tell nodes to fetch", never push bytes through JS.
const transferStart = app.indexOf('  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {');
const transferEnd = app.indexOf('\n  const syncPlaylistSnapshotToNodes =', transferStart);
if (transferStart < 0 || transferEnd < 0) throw new Error('Patch failed: transfer function bounds');
const nativeTransferFn = `  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {\n    const selected = trackOverride || getSelectedTrack();\n    if (!selected || clientsRef.current.length === 0) return;\n\n    const missingSockets = clientsRef.current.filter(socket => {\n      const key = socket.remoteAddress || 'unknown';\n      return !cachedTracksRef.current[key]?.includes(selected.id);\n    });\n\n    if (missingSockets.length === 0) {\n      setTransferProgress(100);\n      setTrackProgress(selected.id, 100);\n      setTransferProgressText(\`Ready: ${'${'}selected.name}\`);\n      setStatus(\`Ready on all speakers: ${'${'}selected.name}\`);\n      return;\n    }\n\n    await PartyAudio.registerTrackForTransfer(selected.id, selected.uri);\n    const payload = {id: selected.id, name: selected.name};\n    missingSockets.forEach(socket => {\n      writeSocket(socket, \`DOWNLOAD_TRACK|${'${'}JSON.stringify(payload)}\`);\n    });\n\n    setTransferProgress(1);\n    setTrackProgress(selected.id, 1);\n    setTransferProgressText(\`Downloading on ${'${'}missingSockets.length} speaker(s): ${'${'}selected.name}\`);\n    setStatus(\`Waiting for ${'${'}missingSockets.length} speaker download(s)\`);\n    addLog(\`Native download requested: ${'${'}selected.name}\`);\n  };\n`;
app = app.slice(0, transferStart) + nativeTransferFn + app.slice(transferEnd);

// Playlist packets now include metadata and nodes apply it immediately.
app = app.replace(
  /tracks: tracksSnapshot\.map\(track => \(\{\n        id: track\.id,\n        name: track\.name,\n      \}\)\)/g,
  `tracks: tracksSnapshot.map(track => ({\n        id: track.id,\n        name: track.name,\n        metadata: track.metadata,\n      }))`,
);
app = app.replace(
  /tracks: playlist\.map\(track => \(\{\n        id: track\.id,\n        name: track\.name,\n      \}\)\)/g,
  `tracks: playlist.map(track => ({\n        id: track.id,\n        name: track.name,\n        metadata: track.metadata,\n      }))`,
);

app = app.replace(
  `          const syncedTracks: Track[] = (payload.tracks || []).map((track: any) => ({\n            id: track.id,\n            name: track.name,\n            uri: '',\n          }));`,
  `          const syncedTracks: Track[] = (payload.tracks || []).map((track: any) => ({\n            id: track.id,\n            name: track.name,\n            uri: '',\n            metadata: track.metadata,\n          }));`,
);

app = app.replace(
  `          const selected = syncedTracks.find(track => track.id === payload.selectedTrackId);\n          setCurrentTrackName(selected ? selected.name : 'None');`,
  `          const selected = syncedTracks.find(track => track.id === payload.selectedTrackId);\n          setCurrentTrackName(selected ? selected.name : 'None');\n          if (selected?.metadata) {\n            setCurrentTrackMetadata(selected.metadata);\n          }`,
);

// Node handles binary download request on control channel.
const downloadHandler = `\n      if (message.startsWith('DOWNLOAD_TRACK|')) {\n        try {\n          const payload = JSON.parse(message.replace('DOWNLOAD_TRACK|', ''));\n          if (!payload.id || !payload.name) return;\n\n          setStatus(\`Downloading: ${'${'}payload.name}\`);\n          setTrackProgress(payload.id, 1);\n          addLog(\`Native download started: ${'${'}payload.name}\`);\n\n          await PartyAudio.downloadTrackFromHost(\n            ipToUse,\n            TRANSFER_PORT,\n            payload.id,\n            payload.name,\n          );\n\n          setTrackProgress(payload.id, 100);\n          setStatus(\`Track cached: ${'${'}payload.name}\`);\n          addLog(\`Native download complete: ${'${'}payload.name}\`);\n          writeSocket(client, \`TRACK_RECEIVED|${'${'}payload.id}|${'${'}payload.name}\`);\n        } catch (error) {\n          setStatus('Track download failed');\n          addLog(\`Native download error: ${'${'}String(error)}\`);\n          try {\n            const payload = JSON.parse(message.replace('DOWNLOAD_TRACK|', ''));\n            writeSocket(client, \`TRACK_DOWNLOAD_FAILED|${'${'}payload.id}|${'${'}String(error)}\`);\n          } catch {}\n        }\n        return;\n      }\n`;

if (!app.includes("message.startsWith('DOWNLOAD_TRACK|')")) {
  app = replaceOnce(
    app,
    'insert download handler',
    `      if (message.startsWith('SYNC_TIME|')) {`,
    `${downloadHandler}\n      if (message.startsWith('SYNC_TIME|')) {`,
  );
}

// Host surfaces node download failures rather than waiting silently.
if (!app.includes("message.startsWith('TRACK_DOWNLOAD_FAILED|')")) {
  app = replaceOnce(
    app,
    'host failed download handler',
    `          if (message.startsWith('PLAY_TRACK_SCHEDULED|')) {`,
    `          if (message.startsWith('TRACK_DOWNLOAD_FAILED|')) {\n            const [, trackId, detail] = message.split('|');\n            addLog(\`Speaker download failed for ${'${'}trackId}: ${'${'}detail || 'unknown error'}\`);\n            setStatus('A speaker failed to download the track');\n          }\n\n          if (message.startsWith('PLAY_TRACK_SCHEDULED|')) {`,
  );
}

// Pressing Play never starts/restarts a transfer. It only plays when all nodes confirmed.
app = app.replace(
  `    try {\n      if (!isTrackCachedOnAllNodes(selected.id)) {\n        addLog(\`Selected track not cached everywhere. Transferring first: ${'${'}selected.name}\`);\n        await transferSelectedTrackToNodes(selected);\n        await waitForTrackCachedOnAllNodes(selected);\n      }\n    } catch (error) {\n      addLog(\`Cannot play yet: ${'${'}String(error)}\`);\n      Alert.alert('Track not ready', String(error));\n      return;\n    }`,
  `    if (!isTrackCachedOnAllNodes(selected.id)) {\n      const readyCount = clientsRef.current.filter(socket => {\n        const key = socket.remoteAddress || 'unknown';\n        return cachedTracksRef.current[key]?.includes(selected.id);\n      }).length;\n      const message = \`Still downloading to speakers (${ '${'}readyCount}/${'${'}clientsRef.current.length} ready)\`;\n      addLog(message);\n      setStatus(message);\n      Alert.alert('Track still downloading', message);\n      return;\n    }`,
);

// Metadata effect remains as a fallback, but playlist metadata is the primary instant path.

fs.writeFileSync(appPath, app);
fs.writeFileSync(nativePath, native);
console.log('PartySpeaker native binary transfer v2 applied.');
