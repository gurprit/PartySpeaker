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
  'sync thresholds',
  `const DRIFT_CHECK_INTERVAL_MS = 750;\nconst DRIFT_INITIAL_CHECK_MS = 450;\nconst DRIFT_HARD_RESYNC_MS = 250;\nconst DRIFT_LOG_THRESHOLD_MS = 120;`,
  `const DRIFT_CHECK_INTERVAL_MS = 500;\nconst DRIFT_INITIAL_CHECK_MS = 250;\nconst DRIFT_HARD_RESYNC_MS = 80;\nconst DRIFT_INITIAL_RESYNC_MS = 35;\nconst DRIFT_LOG_THRESHOLD_MS = 25;`,
);

app = replaceOnce(
  app,
  'node progress cannot downgrade cached',
  `      const percent = Math.max(1, Math.min(99, Math.round(Number(event?.percent) || 1)));\n      if (!trackId) return;\n\n      setTrackProgress(trackId, percent);`,
  `      const percent = Math.max(1, Math.min(99, Math.round(Number(event?.percent) || 1)));\n      if (!trackId) return;\n\n      if (nodeCachedTrackIdsRef.current.has(trackId)) {\n        setTrackProgress(trackId, 100);\n        return;\n      }\n\n      setTrackProgress(trackId, percent);`,
);

app = replaceOnce(
  app,
  'drift threshold by phase',
  `      if (Math.abs(driftMs) >= DRIFT_LOG_THRESHOLD_MS) {\n        addLog(\`Playback drift (${'${'}label}): ${'${'}Math.round(driftMs)}ms\`);\n      }\n\n      if (Math.abs(driftMs) >= DRIFT_HARD_RESYNC_MS) {\n        await PartyAudio.seekCurrentPlayback(expectedPosition);\n        addLog(\`Playback resynced (${'${'}label}) by ${'${'}Math.round(-driftMs)}ms\`);\n      }`,
  `      if (Math.abs(driftMs) >= DRIFT_LOG_THRESHOLD_MS) {\n        addLog(\`Playback drift (${'${'}label}): ${'${'}Math.round(driftMs)}ms\`);\n      }\n\n      const resyncThreshold = label === 'initial'\n        ? DRIFT_INITIAL_RESYNC_MS\n        : DRIFT_HARD_RESYNC_MS;\n\n      if (Math.abs(driftMs) >= resyncThreshold) {\n        await PartyAudio.seekCurrentPlayback(expectedPosition);\n        addLog(\`Playback resynced (${'${'}label}) by ${'${'}Math.round(-driftMs)}ms\`);\n      }`,
);

app = replaceOnce(
  app,
  'double initial correction',
  `    setTimeout(() => {\n      correctNodePlaybackDrift('initial');\n    }, DRIFT_INITIAL_CHECK_MS);\n\n    nodeDriftTimerRef.current = setInterval(() => {`,
  `    setTimeout(() => {\n      correctNodePlaybackDrift('initial');\n    }, DRIFT_INITIAL_CHECK_MS);\n\n    setTimeout(() => {\n      correctNodePlaybackDrift('initial');\n    }, 900);\n\n    nodeDriftTimerRef.current = setInterval(() => {`,
);

app = replaceOnce(
  app,
  'host progress ignore cached sender',
  `          if (message.startsWith('TRACK_DOWNLOAD_PROGRESS|')) {\n            const [, trackId, rawPercent] = message.split('|');\n            const percent = Math.max(1, Math.min(99, Math.round(Number(rawPercent) || 1)));\n            const key = socket.remoteAddress || 'unknown';`,
  `          if (message.startsWith('TRACK_DOWNLOAD_PROGRESS|')) {\n            const [, trackId, rawPercent] = message.split('|');\n            const percent = Math.max(1, Math.min(99, Math.round(Number(rawPercent) || 1)));\n            const key = socket.remoteAddress || 'unknown';\n\n            if (cachedTracksRef.current[key]?.includes(trackId)) {\n              return;\n            }`,
);

app = replaceOnce(
  app,
  'host progress reaches 100',
  `            const overallProgress = progressValues.length > 0\n              ? Math.max(1, Math.min(99, Math.min(...progressValues)))\n              : percent;`,
  `            const allCached = progressValues.length > 0 && progressValues.every(value => value >= 100);\n            const overallProgress = allCached\n              ? 100\n              : progressValues.length > 0\n                ? Math.max(1, Math.min(99, Math.min(...progressValues)))\n                : percent;`,
);

app = replaceOnce(
  app,
  'received marks sender progress complete',
  `            if (!cachedTracksRef.current[key].includes(trackId)) {\n              cachedTracksRef.current[key].push(trackId);\n            }`,
  `            if (!cachedTracksRef.current[key].includes(trackId)) {\n              cachedTracksRef.current[key].push(trackId);\n            }\n\n            if (!trackNodeProgressRef.current[trackId]) {\n              trackNodeProgressRef.current[trackId] = {};\n            }\n            trackNodeProgressRef.current[trackId][key] = 100;`,
);

app = replaceOnce(
  app,
  'playlist panel select callback',
  `      autoSyncAndTransfer={autoSyncAndTransfer}\n      onMetadataChange={setCurrentTrackMetadata}`, 
  `      autoSyncAndTransfer={autoSyncAndTransfer}\n      onTrackSelected={(track: Track) => {\n        selectedTrackIdRef.current = track.id;\n        setSelectedTrackId(track.id);\n        syncPlaylistSnapshotToNodes(playlistRef.current, track.id);\n        if (isTrackCachedOnAllNodes(track.id)) {\n          playSelectedTrackOnAllSpeakers(track);\n        } else {\n          transferSelectedTrackToNodes(track);\n        }\n      }}\n      onMetadataChange={setCurrentTrackMetadata}`,
);

panel = replaceOnce(
  panel,
  'select prop type',
  `  autoSyncAndTransfer: (\n    track?: Track,\n    playlistSnapshot?: Track[],\n    selectedIdSnapshot?: string | null,\n  ) => void;\n  onMetadataChange?:`,
  `  autoSyncAndTransfer: (\n    track?: Track,\n    playlistSnapshot?: Track[],\n    selectedIdSnapshot?: string | null,\n  ) => void;\n  onTrackSelected: (track: Track) => void;\n  onMetadataChange?:`,
);

panel = replaceOnce(
  panel,
  'select prop destructure',
  `  autoSyncAndTransfer,\n  onMetadataChange,`,
  `  autoSyncAndTransfer,\n  onTrackSelected,\n  onMetadataChange,`,
);

panel = replaceOnce(
  panel,
  'tap plays selected track',
  `                onPress={() => {\n                  setSelectedTrackId(track.id);\n                  addLog(\`Selected track: ${'${'}track.name}\`);\n                  autoSyncAndTransfer(track, playlist, track.id);\n                }}>`,
  `                onPress={() => {\n                  addLog(\`Selected track: ${'${'}track.name}\`);\n                  onTrackSelected(track);\n                }}>`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(panelFile, panel);
console.log('PartySpeaker playback/queue polish patch applied.');
