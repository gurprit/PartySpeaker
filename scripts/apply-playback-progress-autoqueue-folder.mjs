import fs from 'node:fs';

const appFile = 'App.tsx';
const panelFile = 'src/components/host/PlaylistPanel.tsx';
const nativeFile = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';

let app = fs.readFileSync(appFile, 'utf8');
let panel = fs.readFileSync(panelFile, 'utf8');
let native = fs.readFileSync(nativeFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

// ---------- App playback position ----------
app = replaceOnce(
  app,
  'numeric playback position state',
  `  const [playbackPositionText, setPlaybackPositionText] = useState('0:00');\n  const [nowPlayingText, setNowPlayingText] = useState('Nothing playing');`,
  `  const [playbackPositionText, setPlaybackPositionText] = useState('0:00');\n  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);\n  const [nowPlayingText, setNowPlayingText] = useState('Nothing playing');`,
);

app = replaceOnce(
  app,
  'update numeric playback position',
  `      const positionMs = hostNow - startedAtHostMs;\n      setPlaybackPositionText(formatMs(positionMs));`,
  `      const positionMs = Math.max(0, hostNow - startedAtHostMs);\n      setPlaybackPositionMs(positionMs);\n      setPlaybackPositionText(formatMs(positionMs));`,
);

app = replaceOnce(
  app,
  'reset numeric playback position',
  `    setPlaybackPositionText('0:00');\n    setNowPlayingText('Nothing playing');`,
  `    setPlaybackPositionMs(0);\n    setPlaybackPositionText('0:00');\n    setNowPlayingText('Nothing playing');`,
);

// ---------- Folder import ----------
app = replaceOnce(
  app,
  'add folder function',
  `  const removeSelectedTrack = () => {`,
  `  const addFolder = async () => {\n    try {\n      const picked = await PartyAudio.pickAudioFolder();\n      const items = Array.isArray(picked) ? picked : [];\n      if (items.length === 0) {\n        Alert.alert('No music found', 'No supported audio files were found in that folder.');\n        return;\n      }\n\n      addLog(\`Importing ${'${'}items.length} track(s) from folder\`);\n      const imported: Track[] = [];\n\n      for (const item of items) {\n        const name = String(item?.name || 'Selected audio');\n        const uri = String(item?.uri || '');\n        if (!uri) continue;\n\n        try {\n          const metadata = await MetadataService.getMetadata(name, uri);\n          const track: Track = {\n            id: \`${'${'}Date.now()}-${'${'}Math.random()}\`,\n            name,\n            uri,\n            metadata,\n          };\n          await PartyAudio.registerTrackForTransfer(track.id, track.uri);\n          imported.push(track);\n        } catch (error) {\n          addLog(\`Skipped ${'${'}name}: ${'${'}String(error)}\`);\n        }\n      }\n\n      if (imported.length === 0) return;\n\n      const nextPlaylist = [...playlistRef.current, ...imported];\n      playlistRef.current = nextPlaylist;\n      setPlaylist(nextPlaylist);\n      imported.forEach(track => setTrackProgress(track.id, 0));\n      syncPlaylistSnapshotToNodes(nextPlaylist, selectedTrackIdRef.current);\n      setTimeout(() => preloadPlaylistToNodes(imported), 250);\n      setStatus(\`Added ${'${'}imported.length} track(s) from folder\`);\n      addLog(\`Folder import complete: ${'${'}imported.length} track(s)\`);\n    } catch (error) {\n      addLog(\`Folder import cancelled/error: ${'${'}String(error)}\`);\n    }\n  };\n\n  const removeSelectedTrack = () => {`,
);

// ---------- Auto advance ----------
app = replaceOnce(
  app,
  'auto advance ref',
  `  const transferAckRef = useRef<Record<string, number>>({});`,
  `  const transferAckRef = useRef<Record<string, number>>({});\n  const autoAdvancedTrackRef = useRef<string | null>(null);`,
);

app = replaceOnce(
  app,
  'auto advance effect',
  `  const isTrackCachedOnAllNodes = (trackId: string) => {`,
  `  useEffect(() => {\n    if (mode !== 'host' || playbackState !== 'playing' || !nowPlayingTrackId) return;\n\n    const currentIndex = playlistRef.current.findIndex(track => track.id === nowPlayingTrackId);\n    if (currentIndex < 0) return;\n\n    const current = playlistRef.current[currentIndex];\n    const durationMs = Number(current.metadata?.durationMs || 0);\n    if (!durationMs || playbackPositionMs < durationMs - 350) return;\n    if (autoAdvancedTrackRef.current === current.id) return;\n\n    autoAdvancedTrackRef.current = current.id;\n    const nextTrack = playlistRef.current[currentIndex + 1];\n\n    if (!nextTrack) {\n      nowPlayingRef.current = null;\n      setNowPlayingTrackId(null);\n      setPlaybackState('idle');\n      stopPlaybackUiClock();\n      setStatus('Playlist finished');\n      return;\n    }\n\n    selectedTrackIdRef.current = nextTrack.id;\n    setSelectedTrackId(nextTrack.id);\n    syncPlaylistSnapshotToNodes(playlistRef.current, nextTrack.id);\n    setTimeout(() => playSelectedTrackOnAllSpeakers(nextTrack), 120);\n  }, [mode, playbackState, nowPlayingTrackId, playbackPositionMs]);\n\n  useEffect(() => {\n    if (nowPlayingTrackId) autoAdvancedTrackRef.current = null;\n  }, [nowPlayingTrackId]);\n\n  const isTrackCachedOnAllNodes = (trackId: string) => {`,
);

// Pass new UI props.
app = replaceOnce(
  app,
  'playlist props playback position and folder',
  `      playbackPositionText={playbackPositionText}\n      transferProgressText={transferProgressText}`, 
  `      playbackPositionText={playbackPositionText}\n      playbackPositionMs={playbackPositionMs}\n      transferProgressText={transferProgressText}`,
);

app = replaceOnce(
  app,
  'playlist folder callback',
  `      addTrack={addTrack}\n      removeSelectedTrack={removeSelectedTrack}`, 
  `      addTrack={addTrack}\n      addFolder={addFolder}\n      removeSelectedTrack={removeSelectedTrack}`,
);

// ---------- PlaylistPanel progress bar, duration and folder button ----------
panel = replaceOnce(
  panel,
  'panel playback position prop',
  `  playbackPositionText: string;\n  transferProgressText: string;`,
  `  playbackPositionText: string;\n  playbackPositionMs: number;\n  transferProgressText: string;`,
);

panel = replaceOnce(
  panel,
  'panel folder prop',
  `  addTrack: () => void;\n  removeSelectedTrack: () => void;`,
  `  addTrack: () => void;\n  addFolder: () => void;\n  removeSelectedTrack: () => void;`,
);

panel = replaceOnce(
  panel,
  'panel destructure playback position',
  `  playbackPositionText,\n  transferProgressText,`,
  `  playbackPositionText,\n  playbackPositionMs,\n  transferProgressText,`,
);

panel = replaceOnce(
  panel,
  'panel destructure folder',
  `  addTrack,\n  removeSelectedTrack,`,
  `  addTrack,\n  addFolder,\n  removeSelectedTrack,`,
);

panel = replaceOnce(
  panel,
  'playback progress values',
  `  const selectedTransfer = selectedTrack\n    ? trackTransferStatus[selectedTrack.id] || 0\n    : 0;`,
  `  const selectedTransfer = selectedTrack\n    ? trackTransferStatus[selectedTrack.id] || 0\n    : 0;\n  const nowPlayingDurationMs = Number(nowPlayingTrack?.metadata?.durationMs || nowPlayingMetadata.durationMs || 0);\n  const playbackProgressPercent = nowPlayingDurationMs > 0\n    ? Math.max(0, Math.min(100, (playbackPositionMs / nowPlayingDurationMs) * 100))\n    : 0;\n\n  const formatDuration = (ms: number) => {\n    if (!ms || ms < 0) return '--:--';\n    const totalSeconds = Math.floor(ms / 1000);\n    const minutes = Math.floor(totalSeconds / 60);\n    const seconds = totalSeconds % 60;\n    return \`${'${'}minutes}:${'${'}String(seconds).padStart(2, '0')}\`;\n  };`,
);

panel = replaceOnce(
  panel,
  'real playback progress bar',
  `                  width: \`${'${'}Math.max(4, Math.min(100, transferProgress || selectedTransfer))}%\`,`,
  `                  width: \`${'${'}playbackProgressPercent}%\`,`,
);

panel = replaceOnce(
  panel,
  'duration text',
  `          <Text style={localStyles.timeText}>--:--</Text>`,
  `          <Text style={localStyles.timeText}>{formatDuration(nowPlayingDurationMs)}</Text>`,
);

panel = replaceOnce(
  panel,
  'folder button',
  `        <PartyButton\n          title="＋ Add"\n          onPress={addTrack}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />`,
  `        <PartyButton\n          title="＋ Add"\n          onPress={addTrack}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n\n        <PartyButton\n          title="▣ Folder"\n          onPress={addFolder}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />`,
);

// ---------- Native Android folder picker ----------
native = replaceOnce(
  native,
  'documents contract import',
  `import android.provider.OpenableColumns`,
  `import android.provider.OpenableColumns\nimport android.provider.DocumentsContract`,
);

native = replaceOnce(
  native,
  'folder request and promise',
  `    private val requestPickAudioCode = 9922\n\n    private var pickAudioPromise: Promise? = null`,
  `    private val requestPickAudioCode = 9922\n    private val requestPickAudioFolderCode = 9923\n\n    private var pickAudioPromise: Promise? = null\n    private var pickAudioFolderPromise: Promise? = null`,
);

native = replaceOnce(
  native,
  'folder activity result',
  `                when (requestCode) {\n                    requestPickAudioCode -> handlePickAudioResult(resultCode, data)\n                }`,
  `                when (requestCode) {\n                    requestPickAudioCode -> handlePickAudioResult(resultCode, data)\n                    requestPickAudioFolderCode -> handlePickAudioFolderResult(resultCode, data)\n                }`,
);

native = replaceOnce(
  native,
  'folder result helpers',
  `    private fun getDisplayName(uri: Uri): String? {`,
  `    private fun handlePickAudioFolderResult(resultCode: Int, data: Intent?) {\n        if (resultCode != Activity.RESULT_OK || data?.data == null) {\n            pickAudioFolderPromise?.reject("PICK_FOLDER_CANCELLED", "Folder picking was cancelled")\n            pickAudioFolderPromise = null\n            return\n        }\n\n        try {\n            val treeUri = data.data!!\n            try {\n                reactContext.contentResolver.takePersistableUriPermission(\n                    treeUri,\n                    Intent.FLAG_GRANT_READ_URI_PERMISSION\n                )\n            } catch (_: Exception) {}\n\n            val result = Arguments.createArray()\n            val rootId = DocumentsContract.getTreeDocumentId(treeUri)\n            collectAudioDocuments(treeUri, rootId, result)\n            pickAudioFolderPromise?.resolve(result)\n            pickAudioFolderPromise = null\n        } catch (error: Exception) {\n            pickAudioFolderPromise?.reject("PICK_FOLDER_ERROR", error)\n            pickAudioFolderPromise = null\n        }\n    }\n\n    private fun collectAudioDocuments(\n        treeUri: Uri,\n        parentDocumentId: String,\n        result: com.facebook.react.bridge.WritableArray\n    ) {\n        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId)\n        val projection = arrayOf(\n            DocumentsContract.Document.COLUMN_DOCUMENT_ID,\n            DocumentsContract.Document.COLUMN_DISPLAY_NAME,\n            DocumentsContract.Document.COLUMN_MIME_TYPE\n        )\n\n        reactContext.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->\n            val idIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)\n            val nameIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)\n            val mimeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)\n\n            while (cursor.moveToNext()) {\n                val documentId = cursor.getString(idIndex)\n                val name = cursor.getString(nameIndex) ?: "Audio file"\n                val mime = cursor.getString(mimeIndex) ?: ""\n\n                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {\n                    collectAudioDocuments(treeUri, documentId, result)\n                    continue\n                }\n\n                val lower = name.lowercase()\n                val supportedExtension = listOf(\n                    ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus"\n                ).any { lower.endsWith(it) }\n\n                if (mime.startsWith("audio/") || supportedExtension) {\n                    val uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)\n                    val item = Arguments.createMap()\n                    item.putString("uri", uri.toString())\n                    item.putString("name", name)\n                    result.pushMap(item)\n                }\n            }\n        }\n    }\n\n    private fun getDisplayName(uri: Uri): String? {`,
);

native = replaceOnce(
  native,
  'folder picker method',
  `    @ReactMethod\n    fun playAudioUri(uriString: String, promise: Promise) {`,
  `    @ReactMethod\n    fun pickAudioFolder(promise: Promise) {\n        val activity = reactContext.currentActivity\n        if (activity == null) {\n            promise.reject("NO_ACTIVITY", "No active Android activity was found")\n            return\n        }\n\n        pickAudioFolderPromise = promise\n        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {\n            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)\n            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)\n        }\n        activity.startActivityForResult(intent, requestPickAudioFolderCode)\n    }\n\n    @ReactMethod\n    fun playAudioUri(uriString: String, promise: Promise) {`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(panelFile, panel);
fs.writeFileSync(nativeFile, native);
console.log('PartySpeaker playback progress + auto queue + folder import patch applied.');
