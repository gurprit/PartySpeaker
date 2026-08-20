import fs from 'node:fs';

const appFile = 'App.tsx';
const panelFile = 'src/components/host/PlaylistPanel.tsx';
let app = fs.readFileSync(appFile, 'utf8');
let panel = fs.readFileSync(panelFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

app = replaceOnce(
  app,
  'now playing state',
  `  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');\n  const [nodePlaybackDelayMs, setNodePlaybackDelayMs] = useState(0);`,
  `  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');\n  const [nowPlayingTrackId, setNowPlayingTrackId] = useState<string | null>(null);\n  const [nodePlaybackDelayMs, setNodePlaybackDelayMs] = useState(0);`,
);

app = replaceOnce(
  app,
  'add track does not select/play',
  `      playlistRef.current = nextPlaylist;\n      selectedTrackIdRef.current = track.id;\n      setPlaylist(nextPlaylist);\n      setSelectedTrackId(track.id);\n      setCurrentTrackName(track.name);\n      setCurrentTrackMetadata(metadata);\n      setPlaybackState('idle');`,
  `      playlistRef.current = nextPlaylist;\n      setPlaylist(nextPlaylist);\n      setPlaybackState(previous => previous);`,
);

app = replaceOnce(
  app,
  'playlist sync new track no selection',
  `      syncPlaylistSnapshotToNodes(nextPlaylist, track.id);`,
  `      syncPlaylistSnapshotToNodes(nextPlaylist, selectedTrackIdRef.current);`,
);

app = replaceOnce(
  app,
  'selection does not imply current playing',
  `    setSelectedTrackId(nextTrack.id);\n    setCurrentTrackName(nextTrack.name);\n    addLog(\`Selected track: ${'${'}nextTrack.name}\`);`,
  `    selectedTrackIdRef.current = nextTrack.id;\n    setSelectedTrackId(nextTrack.id);\n    addLog(\`Selected track: ${'${'}nextTrack.name}\`);`,
);

app = replaceOnce(
  app,
  'host playback sets now playing',
  `    nowPlayingRef.current = {\n      trackId: selected.id,\n      trackName: selected.name,\n      startedAtHostMs: targetTimeMs,\n    };`,
  `    nowPlayingRef.current = {\n      trackId: selected.id,\n      trackName: selected.name,\n      startedAtHostMs: targetTimeMs,\n    };\n    setNowPlayingTrackId(selected.id);\n    setCurrentTrackName(selected.name);\n    if (selected.metadata) setCurrentTrackMetadata(selected.metadata);`,
);

app = replaceOnce(
  app,
  'node now playing state',
  `            nowPlayingRef.current = {\n              trackId: payload.trackId,\n              trackName: payload.trackName,\n              startedAtHostMs: payload.startedAtHostMs,\n            };`,
  `            nowPlayingRef.current = {\n              trackId: payload.trackId,\n              trackName: payload.trackName,\n              startedAtHostMs: payload.startedAtHostMs,\n            };\n            setNowPlayingTrackId(payload.trackId);\n            setCurrentTrackName(payload.trackName);`,
);

app = replaceOnce(
  app,
  'playlist sync does not alter now playing',
  `          const selected = syncedTracks.find(track => track.id === payload.selectedTrackId);\n          setCurrentTrackName(selected ? selected.name : 'None');\n          if (selected?.metadata) {\n            setCurrentTrackMetadata(selected.metadata);\n          }`,
  `          const selected = syncedTracks.find(track => track.id === payload.selectedTrackId);\n          if (selected?.metadata && !nowPlayingRef.current) {\n            // Keep queued/selected metadata separate from the Now Playing identity.\n          }`,
);

app = replaceOnce(
  app,
  'pass now playing id',
  `      playbackState={playbackState}\n      onPlayPause={() => {`,
  `      playbackState={playbackState}\n      nowPlayingTrackId={nowPlayingTrackId}\n      onPlayPause={() => {`,
);

panel = replaceOnce(
  panel,
  'prop type now playing id',
  `  playbackState: 'idle' | 'playing' | 'paused';\n  onPlayPause: () => void;`,
  `  playbackState: 'idle' | 'playing' | 'paused';\n  nowPlayingTrackId: string | null;\n  onPlayPause: () => void;`,
);

panel = replaceOnce(
  panel,
  'destructure now playing id',
  `  playbackState,\n  onPlayPause,`,
  `  playbackState,\n  nowPlayingTrackId,\n  onPlayPause,`,
);

panel = replaceOnce(
  panel,
  'track selection no current playing mutation',
  `                  setSelectedTrackId(track.id);\n                  setCurrentTrackName(track.name);\n                  addLog(\`Selected track: ${'${'}track.name}\`);`,
  `                  setSelectedTrackId(track.id);\n                  addLog(\`Selected track: ${'${'}track.name}\`);`,
);

panel = replaceOnce(
  panel,
  'now playing metadata source',
  `  const selectedTrack = selectedTrackForMetadata;\n  const selectedTransfer = selectedTrack`,
  `  const selectedTrack = selectedTrackForMetadata;\n  const nowPlayingTrack = playlist.find(track => track.id === nowPlayingTrackId);\n  const nowPlayingMetadata = nowPlayingTrack\n    ? metadata.title && selectedTrack?.id === nowPlayingTrack.id\n      ? metadata\n      : {title: nowPlayingTrack.name.replace(/\\.[^.]+$/, ''), artist: 'Unknown Artist', album: 'Unknown Album'}\n    : {title: '', artist: 'Unknown Artist', album: 'Unknown Album'};\n  const selectedTransfer = selectedTrack`,
);

panel = replaceOnce(
  panel,
  'now playing artwork identity',
  `        <NowPlayingArtwork\n          title={metadata.title || currentTrackName}\n          artworkUri={metadata.artworkUri}\n        />\n\n        <TrackInfo metadata={metadata} />`,
  `        <NowPlayingArtwork\n          title={nowPlayingTrack ? (nowPlayingMetadata.title || nowPlayingTrack.name) : 'Nothing playing'}\n          artworkUri={nowPlayingTrack && selectedTrack?.id === nowPlayingTrack.id ? metadata.artworkUri : undefined}\n        />\n\n        <TrackInfo metadata={nowPlayingTrack ? nowPlayingMetadata : {title: 'Nothing playing', artist: '', album: ''}} />`,
);

panel = replaceOnce(
  panel,
  'idle queue status',
  `          {playbackState === 'playing'\n            ? 'Playing on all speakers'\n            : selectedTrackReady\n              ? 'Ready on all speakers'\n              : selectedTrack\n                ? 'Uploading to speakers...'\n                : 'Add and select a track'}`,
  `          {playbackState === 'playing'\n            ? 'Playing on all speakers'\n            : selectedTrack\n              ? selectedTrackReady\n                ? 'Selected track ready'\n                : 'Selected track uploading...'\n              : playlist.length > 0\n                ? 'Playlist queued • select a track to play'\n                : 'Add tracks to build the playlist'}`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(panelFile, panel);
console.log('PartySpeaker queue/Now Playing separation patch applied.');
