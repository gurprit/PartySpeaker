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
`type Track = {
  id: string;
  name: string;
  uri: string;
  metadata?: TrackMetadata;
};`,
`type Track = {
  id: string;
  name: string;
  uri: string;
  metadata?: TrackMetadata;
  source?: string;
  sourceUri?: string;
};`,
'Track type',
);

replaceOnce(
`  const preloadQueueRunningRef = useRef(false);`,
`  const preloadQueueRunningRef = useRef(false);
  const driveMaterializePromisesRef = useRef<Record<string, Promise<string>>>({});`,
'Drive materialize ref',
);

replaceOnce(
`  const preloadPlaylistToNodes = (tracksSnapshot = playlistRef.current) => {`,
`  const ensureTrackMaterialized = async (track: Track) => {
    if (track.source !== 'google-drive-folder' || !track.sourceUri) return track.uri;
    if (track.uri.startsWith('file://')) return track.uri;

    const existing = driveMaterializePromisesRef.current[track.id];
    if (existing) return existing;

    const job = (async () => {
      setStatus(\`Fetching from Google Drive: \${track.name}\`);
      addLog(\`Drive fetch starting: \${track.name}\`);
      const cachedUri = String(await PartyAudio.cacheDriveFolderTrack(track.sourceUri, track.name));
      track.uri = cachedUri;
      await PartyAudio.registerTrackForTransfer(track.id, cachedUri);
      setPlaylist(previous => previous.map(item => item.id === track.id ? {...item, uri: cachedUri} : item));
      addLog(\`Drive fetch ready: \${track.name}\`);
      return cachedUri;
    })().finally(() => {
      delete driveMaterializePromisesRef.current[track.id];
    });

    driveMaterializePromisesRef.current[track.id] = job;
    return job;
  };

  const prioritizeTrackForPreload = (track: Track) => {
    preloadQueueRef.current = preloadQueueRef.current.filter(item => item.id !== track.id);
    if (!isTrackCachedOnAllNodes(track.id)) preloadQueueRef.current.unshift(track);
  };

  const preloadPlaylistToNodes = (tracksSnapshot = playlistRef.current) => {`,
'on-demand helpers',
);

replaceOnce(
`          addLog(\`Queue upload starting: \${track.name}\`);
          activeTransferIdsRef.current.delete(track.id);
          await transferSelectedTrackToNodes(track);`,
`          addLog(\`Queue upload starting: \${track.name}\`);
          activeTransferIdsRef.current.delete(track.id);
          try {
            await ensureTrackMaterialized(track);
          } catch (error) {
            addLog(\`Drive fetch failed/skipped: \${track.name} (\${String(error)})\`);
            continue;
          }
          await transferSelectedTrackToNodes(track);`,
'preload materialization',
);

replaceOnce(
`          const track: Track = {
            id: \`\${Date.now()}-\${Math.random()}\`,
            name,
            uri,
            metadata,
          };
          await PartyAudio.registerTrackForTransfer(track.id, track.uri);
          imported.push(track);`,
`          const source = String(item?.source || '');
          const track: Track = {
            id: \`\${Date.now()}-\${Math.random()}\`,
            name,
            uri,
            metadata,
            source,
            sourceUri: source === 'google-drive-folder' ? uri : undefined,
          };
          if (source !== 'google-drive-folder') {
            await PartyAudio.registerTrackForTransfer(track.id, track.uri);
          }
          imported.push(track);`,
'folder lazy registration',
);

replaceOnce(
`    const expectedNodeKeys = expectedNodeKeysOverride || getLiveNodeKeys();
    if (expectedNodeKeys.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    if (!isTrackCachedOnAllNodes(selected.id, expectedNodeKeys)) {`,
`    const expectedNodeKeys = expectedNodeKeysOverride || getLiveNodeKeys();
    if (expectedNodeKeys.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    try {
      await ensureTrackMaterialized(selected);
    } catch (error) {
      setStatus(\`Could not fetch \${selected.name} from Google Drive\`);
      addLog(\`Drive fetch failed: \${String(error)}\`);
      return;
    }

    if (!isTrackCachedOnAllNodes(selected.id, expectedNodeKeys)) {`,
'play materialization',
);

replaceOnce(
`  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {
    const selected = trackOverride || getLatestSelectedTrack();
    if (!selected || clientsRef.current.length === 0) return;

    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
`  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {
    const selected = trackOverride || getLatestSelectedTrack();
    if (!selected || clientsRef.current.length === 0) return;

    try {
      await ensureTrackMaterialized(selected);
    } catch (error) {
      addLog(\`Drive fetch failed: \${selected.name} (\${String(error)})\`);
      return;
    }

    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
'transfer materialization',
);

replaceOnce(
`      onTrackSelected={(track: Track) => {
        selectedTrackIdRef.current = track.id;
        setSelectedTrackId(track.id);
        syncPlaylistSnapshotToNodes(playlistRef.current, track.id);
        if (isTrackCachedOnAllNodes(track.id)) {
          playSelectedTrackOnAllSpeakers(track);
        } else {
          transferSelectedTrackToNodes(track);
        }
      }}`,
`      onTrackSelected={(track: Track) => {
        selectedTrackIdRef.current = track.id;
        setSelectedTrackId(track.id);
        syncPlaylistSnapshotToNodes(playlistRef.current, track.id);
        prioritizeTrackForPreload(track);
        const index = playlistRef.current.findIndex(item => item.id === track.id);
        const nextTrack = index >= 0 ? playlistRef.current[index + 1] : null;
        if (nextTrack) prioritizeTrackForPreload(nextTrack);
        if (isTrackCachedOnAllNodes(track.id)) {
          playSelectedTrackOnAllSpeakers(track);
        } else {
          transferSelectedTrackToNodes(track);
        }
      }}`,
'selection priority',
);

fs.writeFileSync(path, source);
console.log(`Applied ${replacements} Drive on-demand cache replacement(s) to ${path}`);
