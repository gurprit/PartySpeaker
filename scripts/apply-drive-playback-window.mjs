import fs from 'node:fs';

const path = 'App.tsx';
let source = fs.readFileSync(path, 'utf8');
let replacements = 0;

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Could not find ${label}`);
  source = source.replace(from, to);
  replacements += 1;
};

replaceOnce(
`      syncPlaylistSnapshotToNodes(nextPlaylist, selectedTrackIdRef.current);
      setTimeout(() => preloadPlaylistToNodes(imported), 250);
      setStatus(\`Added \${imported.length} track(s) from folder\`);`,
`      syncPlaylistSnapshotToNodes(nextPlaylist, selectedTrackIdRef.current);

      const isDriveFolderImport = imported.some(track => track.source === 'google-drive-folder');
      if (isDriveFolderImport) {
        // Drive folders are intentionally lazy. Do not turn a 60-track folder
        // into 60 simultaneous host/node cache jobs. Keep only a tiny playback
        // window warm until the user chooses where they want to listen.
        preloadQueueRef.current = preloadQueueRef.current.filter(
          queued => !imported.some(track => track.id === queued.id),
        );
        const firstImported = imported[0];
        const secondImported = imported[1];
        const initialWindow = [firstImported, secondImported].filter(Boolean) as Track[];
        setTimeout(() => preloadPlaylistToNodes(initialWindow), 250);
      } else {
        setTimeout(() => preloadPlaylistToNodes(imported), 250);
      }
      setStatus(\`Added \${imported.length} track(s) from folder\`);`,
'folder playback window',
);

replaceOnce(
`  const prewarmFollowingTrack = async (currentTrackId: string) => {
    const currentIndex = playlistRef.current.findIndex(track => track.id === currentTrackId);
    const nextTrack = currentIndex >= 0 ? playlistRef.current[currentIndex + 1] : null;
    if (!nextTrack || !isTrackCachedOnAllNodes(nextTrack.id)) {
      standbyTrackIdRef.current = null;
      standbyPreparedNodesRef.current = new Set();
      standbyHostReadyRef.current = false;
      return;
    }

    standbyTrackIdRef.current = nextTrack.id;`,
`  const prewarmFollowingTrack = async (currentTrackId: string) => {
    const currentIndex = playlistRef.current.findIndex(track => track.id === currentTrackId);
    const nextTrack = currentIndex >= 0 ? playlistRef.current[currentIndex + 1] : null;
    if (!nextTrack) {
      standbyTrackIdRef.current = null;
      standbyPreparedNodesRef.current = new Set();
      standbyHostReadyRef.current = false;
      return;
    }

    const expectedNodeKeys = getLiveNodeKeys();
    if (expectedNodeKeys.length === 0) return;

    // Drive tracks may only be lightweight document references at this point.
    // Materialise and transfer the immediate next track while the current song
    // is playing, then prime it only after the same fixed node quorum has it.
    try {
      await ensureTrackMaterialized(nextTrack);
      if (!isTrackCachedOnAllNodes(nextTrack.id, expectedNodeKeys)) {
        await transferSelectedTrackToNodes(nextTrack);
        await waitForTrackCachedOnAllNodes(nextTrack, TRACK_CACHE_TIMEOUT_MS, expectedNodeKeys);
      }
    } catch (error) {
      standbyTrackIdRef.current = null;
      standbyPreparedNodesRef.current = new Set();
      standbyHostReadyRef.current = false;
      addLog(\`Next-track prewarm cache failed: \${String(error)}\`);
      return;
    }

    standbyTrackIdRef.current = nextTrack.id;`,
'next-track cache-before-prewarm',
);

replaceOnce(
`        prioritizeTrackForPreload(track);
        const index = playlistRef.current.findIndex(item => item.id === track.id);
        const nextTrack = index >= 0 ? playlistRef.current[index + 1] : null;
        if (nextTrack) prioritizeTrackForPreload(nextTrack);
        if (isTrackCachedOnAllNodes(track.id)) {`,
`        const index = playlistRef.current.findIndex(item => item.id === track.id);
        const nextTrack = index >= 0 ? playlistRef.current[index + 1] : null;

        // Keep the selected track at absolute priority. Because priority insertion
        // uses unshift(), enqueue the next track first and the selected track last.
        // This prevents background Drive work from stealing bandwidth from the song
        // the user actually asked to play.
        if (nextTrack) prioritizeTrackForPreload(nextTrack);
        prioritizeTrackForPreload(track);

        if (isTrackCachedOnAllNodes(track.id)) {`,
'selection queue order',
);

fs.writeFileSync(path, source);
console.log(`Applied ${replacements} Drive playback-window replacement(s) to ${path}`);
