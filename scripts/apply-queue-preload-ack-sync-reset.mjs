import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'playlist preload helper',
  `  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {`,
  `  const preloadPlaylistToNodes = (tracksSnapshot = playlistRef.current) => {\n    tracksSnapshot.forEach((track, index) => {\n      setTimeout(() => {\n        activeTransferIdsRef.current.delete(track.id);\n        transferSelectedTrackToNodes(track);\n      }, index * 350);\n    });\n  };\n\n  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {`,
);

replaceOnce(
  'host resume preload whole queue',
  `          const selected = getLatestSelectedTrack();\n          if (!selected) return;\n          syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);\n          transferSelectedTrackToNodes(selected);`,
  `          syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);\n          preloadPlaylistToNodes(playlistRef.current);`,
);

replaceOnce(
  'new node preload whole queue',
  `        const selected = getLatestSelectedTrack();\n        if (selected) {\n          activeTransferIdsRef.current.delete(selected.id);\n          transferSelectedTrackToNodes(selected);\n        }`,
  `        preloadPlaylistToNodes(playlistRef.current);`,
);

replaceOnce(
  'fresh calibration reset command',
  `    bestClockSampleRef.current = null;\n    const liveSockets = clientsRef.current.filter(isSocketUsable);\n    if (liveSockets.length === 0) return;\n\n    addLog(\`Clock calibration burst: ${'${'}CLOCK_CALIBRATION_SAMPLES} samples\`);`,
  `    bestClockSampleRef.current = null;\n    const liveSockets = clientsRef.current.filter(isSocketUsable);\n    if (liveSockets.length === 0) return;\n\n    // The useful best-sample state lives on each node, not on the host. Reset\n    // it explicitly so every Play uses a genuinely fresh calibration window.\n    liveSockets.forEach(socket => writeSocket(socket, 'SYNC_RESET'));\n    await new Promise<void>(resolve => setTimeout(resolve, 80));\n\n    addLog(\`Clock calibration burst: ${'${'}CLOCK_CALIBRATION_SAMPLES} samples\`);`,
);

replaceOnce(
  'node sync reset handler',
  `      if (message.startsWith('SYNC_REQUEST|')) {`,
  `      if (message === 'SYNC_RESET') {\n        bestClockSampleRef.current = null;\n        return;\n      }\n\n      if (message.startsWith('SYNC_REQUEST|')) {`,
);

replaceOnce(
  'download ack active socket',
  `          writeSocket(client, \`TRACK_RECEIVED|${'${'}payload.id}|${'${'}payload.name}\`);`,
  `          writeSocket(responseSocket || clientRef.current, \`TRACK_RECEIVED|${'${'}payload.id}|${'${'}payload.name}\`);`,
);

replaceOnce(
  'download failure active socket',
  `            writeSocket(client, \`TRACK_DOWNLOAD_FAILED|${'${'}payload.id}|${'${'}String(error)}\`);`,
  `            writeSocket(responseSocket || clientRef.current, \`TRACK_DOWNLOAD_FAILED|${'${'}payload.id}|${'${'}String(error)}\`);`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker queue preload + ACK routing + fresh node clock reset patch applied.');
