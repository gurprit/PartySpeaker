import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'latest playlist refs',
  `  const activeTransferIdsRef = useRef<Set<string>>(new Set());`,
  `  const activeTransferIdsRef = useRef<Set<string>>(new Set());\n  const playlistRef = useRef<Track[]>([]);\n  const selectedTrackIdRef = useRef<string | null>(null);`,
);

replaceOnce(
  'keep latest playlist refs',
  `  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {`,
  `  useEffect(() => {\n    playlistRef.current = playlist;\n  }, [playlist]);\n\n  useEffect(() => {\n    selectedTrackIdRef.current = selectedTrackId;\n  }, [selectedTrackId]);\n\n  const getLatestSelectedTrack = () => {\n    const id = selectedTrackIdRef.current;\n    return id ? playlistRef.current.find(track => track.id === id) || null : null;\n  };\n\n  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {`,
);

replaceOnce(
  'synchronous add-track refs',
  `      const nextPlaylist = [...playlist, track];\n      setPlaylist(nextPlaylist);\n      setSelectedTrackId(track.id);`,
  `      const nextPlaylist = [...playlistRef.current, track];\n      playlistRef.current = nextPlaylist;\n      selectedTrackIdRef.current = track.id;\n      setPlaylist(nextPlaylist);\n      setSelectedTrackId(track.id);`,
);

replaceOnce(
  'cache-state latest selected',
  `              const selected = getSelectedTrack();\n              if (selected) {`,
  `              const selected = getLatestSelectedTrack();\n              if (selected) {`,
);

replaceOnce(
  'track received transactional progress',
  `            if (liveSockets.length > 0 && cachedCount === liveSockets.length) {\n              setTransferProgress(100);\n              setTrackProgress(trackId, 100);\n              setTransferProgressText(\`Ready: ${'${'}trackName}\`);\n              setStatus(\`Ready on all speakers: ${'${'}trackName}\`);\n            } else {\n              setTransferProgressText(\`Caching ${'${'}trackName}: ${'${'}cachedCount}/${'${'}liveSockets.length} active speakers ready\`);\n            }`,
  `            const isSelectedTrack = selectedTrackIdRef.current === trackId;\n\n            if (liveSockets.length > 0 && cachedCount === liveSockets.length) {\n              activeTransferIdsRef.current.delete(trackId);\n              setTrackProgress(trackId, 100);\n\n              if (isSelectedTrack) {\n                setTransferProgress(100);\n                setTransferProgressText(\`Ready: ${'${'}trackName}\`);\n                setStatus(\`Ready on all speakers: ${'${'}trackName}\`);\n              }\n            } else if (isSelectedTrack) {\n              setTransferProgressText(\`Caching ${'${'}trackName}: ${'${'}cachedCount}/${'${'}liveSockets.length} active speakers ready\`);\n            }`,
);

replaceOnce(
  'download failure clears transaction',
  `          if (message.startsWith('TRACK_DOWNLOAD_FAILED|')) {\n            const [, trackId, detail] = message.split('|');\n            addLog(\`Speaker download failed for ${'${'}trackId}: ${'${'}detail || 'unknown error'}\`);\n            setStatus('A speaker failed to download the track');\n          }`,
  `          if (message.startsWith('TRACK_DOWNLOAD_FAILED|')) {\n            const [, trackId, detail] = message.split('|');\n            activeTransferIdsRef.current.delete(trackId);\n            addLog(\`Speaker download failed for ${'${'}trackId}: ${'${'}detail || 'unknown error'}\`);\n            if (selectedTrackIdRef.current === trackId) {\n              setStatus('A speaker failed to download the track');\n            }\n          }`,
);

replaceOnce(
  'transactional transfer',
  `  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {\n    const selected = trackOverride || getSelectedTrack();\n    if (!selected || clientsRef.current.length === 0) return;\n\n    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
  `  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {\n    const selected = trackOverride || getLatestSelectedTrack();\n    if (!selected || clientsRef.current.length === 0) return;\n\n    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
);

replaceOnce(
  'transaction already ready',
  `    if (missingSockets.length === 0) {\n      setTransferProgress(100);\n      setTrackProgress(selected.id, 100);\n      setTransferProgressText(\`Ready: ${'${'}selected.name}\`);\n      setStatus(\`Ready on all speakers: ${'${'}selected.name}\`);\n      return;\n    }\n\n    await PartyAudio.registerTrackForTransfer(selected.id, selected.uri);`,
  `    if (missingSockets.length === 0) {\n      activeTransferIdsRef.current.delete(selected.id);\n      setTrackProgress(selected.id, 100);\n      if (selectedTrackIdRef.current === selected.id) {\n        setTransferProgress(100);\n        setTransferProgressText(\`Ready: ${'${'}selected.name}\`);\n        setStatus(\`Ready on all speakers: ${'${'}selected.name}\`);\n      }\n      return;\n    }\n\n    if (activeTransferIdsRef.current.has(selected.id)) {\n      addLog(\`Transfer already active: ${'${'}selected.name}\`);\n      return;\n    }\n\n    activeTransferIdsRef.current.add(selected.id);\n    await PartyAudio.registerTrackForTransfer(selected.id, selected.uri);`,
);

replaceOnce(
  'selected-only transfer ui',
  `    setTransferProgress(1);\n    setTrackProgress(selected.id, 1);\n    setTransferProgressText(\`Downloading on ${'${'}missingSockets.length} speaker(s): ${'${'}selected.name}\`);\n    setStatus(\`Waiting for ${'${'}missingSockets.length} speaker download(s)\`);\n    addLog(\`Native download requested: ${'${'}selected.name}\`);`,
  `    setTrackProgress(selected.id, 1);\n    if (selectedTrackIdRef.current === selected.id) {\n      setTransferProgress(1);\n      setTransferProgressText(\`Downloading on ${'${'}missingSockets.length} speaker(s): ${'${'}selected.name}\`);\n      setStatus(\`Waiting for ${'${'}missingSockets.length} speaker download(s)\`);\n    }\n    addLog(\`Native download requested: ${'${'}selected.name}\`);`,
);

// Server callbacks must never use the playlist/selection captured when hosting started.
source = source.replace(
  `        syncPlaylistSnapshotToNodes(playlist, selectedTrackId);`,
  `        syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);`,
);

source = source.replace(
  `              tracks: playlist.map(track => ({`,
  `              tracks: playlistRef.current.map(track => ({`,
);
source = source.replace(
  `              selectedTrackId,\n            };`,
  `              selectedTrackId: selectedTrackIdRef.current,\n            };`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker transactional track-state patch applied.');
