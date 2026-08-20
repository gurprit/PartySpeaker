import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'host resume transfer retry',
  `      if (mode !== 'node') return;\n\n      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {`,
  `      if (mode === 'host' && (previousState === 'background' || previousState === 'inactive') && nextState === 'active') {\n        clientsRef.current = clientsRef.current.filter(isSocketUsable);\n        setNodeCount(clientsRef.current.length);\n        activeTransferIdsRef.current.clear();\n        addLog('Host resumed; waiting for speakers to reconnect before retrying transfer');\n\n        setTimeout(() => {\n          const selected = getLatestSelectedTrack();\n          if (!selected) return;\n          syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);\n          transferSelectedTrackToNodes(selected);\n        }, 1500);\n        return;\n      }\n\n      if (mode !== 'node') return;\n\n      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {`,
);

replaceOnce(
  'new node retry current transfer',
  `      setTimeout(() => {\n        syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);\n        broadcastNowPlaying();\n      }, 300);`,
  `      setTimeout(() => {\n        syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);\n        broadcastNowPlaying();\n\n        const selected = getLatestSelectedTrack();\n        if (selected) {\n          activeTransferIdsRef.current.delete(selected.id);\n          transferSelectedTrackToNodes(selected);\n        }\n      }, 500);`,
);

replaceOnce(
  'successful write tracking',
  `    const payload = {id: selected.id, name: selected.name};\n    missingSockets.forEach(socket => {\n      writeSocket(socket, \`DOWNLOAD_TRACK|${'${'}JSON.stringify(payload)}\`);\n    });\n\n    setTrackProgress(selected.id, 1);`,
  `    const payload = {id: selected.id, name: selected.name};\n    let successfulWrites = 0;\n    missingSockets.forEach(socket => {\n      if (writeSocket(socket, \`DOWNLOAD_TRACK|${'${'}JSON.stringify(payload)}\`)) {\n        successfulWrites += 1;\n      }\n    });\n\n    if (successfulWrites === 0) {\n      activeTransferIdsRef.current.delete(selected.id);\n      addLog(\`Download command could not reach any speaker; retrying ${'${'}selected.name}\`);\n      setTimeout(() => transferSelectedTrackToNodes(selected), 1500);\n      return;\n    }\n\n    setTrackProgress(selected.id, 1);`,
);

replaceOnce(
  'socket close clears transfer lock',
  `      socket.on('close', () => {\n        clientsRef.current = clientsRef.current.filter(item => item !== socket);`,
  `      socket.on('close', () => {\n        activeTransferIdsRef.current.clear();\n        clientsRef.current = clientsRef.current.filter(item => item !== socket);`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker host picker recovery patch applied.');
