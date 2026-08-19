import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) {
    throw new Error(`Patch failed: ${label} target not found`);
  }
  source = source.replace(before, after);
};

replaceOnce(
  'transfer constants',
  "const START_BUFFER_MS = 5000;\nconst BLUETOOTH_LATENCY_COMPENSATION_MS = 0;\nconst DISCOVERY_MESSAGE = 'PARTYSPEAKER_HOST';",
  "const START_BUFFER_MS = 5000;\nconst BLUETOOTH_LATENCY_COMPENSATION_MS = 0;\nconst DISCOVERY_MESSAGE = 'PARTYSPEAKER_HOST';\nconst TRANSFER_CHUNK_SIZE = 12000;\nconst TRANSFER_BATCH_SIZE = 4;\nconst TRANSFER_BATCH_PAUSE_MS = 12;\nconst TRACK_CACHE_TIMEOUT_MS = 120000;\nconst METADATA_HEAD_START_MS = 500;",
);

replaceOnce(
  'active transfer ref',
  "  const transferBuffersRef = useRef<Record<string, {name: string; chunks: string[]}>>({});\n  const cachedTracksRef = useRef<Record<string, string[]>>({});",
  "  const transferBuffersRef = useRef<Record<string, {name: string; chunks: string[]}>>({});\n  const cachedTracksRef = useRef<Record<string, string[]>>({});\n  const activeTransferIdsRef = useRef<Set<string>>(new Set());",
);

replaceOnce(
  'metadata-first auto sync',
  `  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {\n    setTimeout(() => {\n      if (playlistSnapshot) {\n        syncPlaylistSnapshotToNodes(\n          playlistSnapshot,\n          selectedIdSnapshot === undefined ? selectedTrackId : selectedIdSnapshot,\n        );\n      } else {\n        syncPlaylistToNodes();\n      }\n\n      if (track) {\n        transferSelectedTrackToNodes(track);\n      }\n    }, 100);\n  };`,
  `  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {\n    // Control-plane messages go first so playlist/metadata updates are never\n    // trapped behind megabytes of audio data in the same TCP socket.\n    setTimeout(() => {\n      if (playlistSnapshot) {\n        syncPlaylistSnapshotToNodes(\n          playlistSnapshot,\n          selectedIdSnapshot === undefined ? selectedTrackId : selectedIdSnapshot,\n        );\n      } else {\n        syncPlaylistToNodes();\n      }\n    }, 50);\n\n    if (track) {\n      setTimeout(() => {\n        transferSelectedTrackToNodes(track);\n      }, METADATA_HEAD_START_MS);\n    }\n  };`,
);

replaceOnce(
  'track received acknowledgement',
  `            if (!cachedTracksRef.current[key].includes(trackId)) {\n              cachedTracksRef.current[key].push(trackId);\n            }\n\n            addLog(\`Node cached track: \${trackName}\`);`,
  `            if (!cachedTracksRef.current[key].includes(trackId)) {\n              cachedTracksRef.current[key].push(trackId);\n            }\n\n            const cachedCount = clientsRef.current.filter(clientSocket => {\n              const clientKey = clientSocket.remoteAddress || 'unknown';\n              return cachedTracksRef.current[clientKey]?.includes(trackId);\n            }).length;\n\n            addLog(\`Node cached track: \${trackName} (\${cachedCount}/\${clientsRef.current.length})\`);\n\n            if (cachedCount === clientsRef.current.length) {\n              setTransferProgress(100);\n              setTrackProgress(trackId, 100);\n              setTransferProgressText(\`Ready: \${trackName}\`);\n              setStatus(\`Ready on all speakers: \${trackName}\`);\n            } else {\n              setTransferProgressText(\`Caching \${trackName}: \${cachedCount}/\${clientsRef.current.length} speakers ready\`);\n            }`,
);

replaceOnce(
  'dynamic discovery subnet',
  "            '192.168.0.255',",
  "            `${subnetPrefix}.255`,",
);

replaceOnce(
  'cache wait helper',
  `  const waitForTrackCachedOnAllNodes = async (track: Track, timeoutMs = 45000) => {\n    const startedAt = Date.now();\n\n    while (!isTrackCachedOnAllNodes(track.id)) {\n      if (Date.now() - startedAt > timeoutMs) {\n        throw new Error(\`Timed out waiting for nodes to cache \${track.name}\`);\n      }\n\n      setStatus(\`Waiting for nodes to cache: \${track.name}\`);\n      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));\n    }\n  };`,
  `  const waitForTrackCachedOnAllNodes = async (track: Track, timeoutMs = TRACK_CACHE_TIMEOUT_MS) => {\n    const startedAt = Date.now();\n\n    while (!isTrackCachedOnAllNodes(track.id)) {\n      const cachedCount = clientsRef.current.filter(socket => {\n        const key = socket.remoteAddress || 'unknown';\n        return cachedTracksRef.current[key]?.includes(track.id);\n      }).length;\n\n      if (Date.now() - startedAt > timeoutMs) {\n        throw new Error(\`Timed out waiting for speakers to cache \${track.name} (\${cachedCount}/\${clientsRef.current.length} ready)\`);\n      }\n\n      setStatus(\`Caching \${track.name}: \${cachedCount}/\${clientsRef.current.length} speakers ready\`);\n      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));\n    }\n  };`,
);

const transferStart = source.indexOf('  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {');
const transferEnd = source.indexOf('\n  const syncPlaylistSnapshotToNodes =', transferStart);
if (transferStart < 0 || transferEnd < 0) {
  throw new Error('Patch failed: transfer function bounds not found');
}

const newTransferFunction = `  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {\n    const selected = trackOverride || getSelectedTrack();\n\n    if (!selected) {\n      Alert.alert('No track selected', 'Add and select a track first.');\n      return;\n    }\n\n    if (clientsRef.current.length === 0) {\n      addLog('No nodes connected');\n      setStatus('No nodes connected');\n      return;\n    }\n\n    if (activeTransferIdsRef.current.has(selected.id)) {\n      addLog(\`Transfer already active: \${selected.name}\`);\n      return;\n    }\n\n    const targetSockets = clientsRef.current.filter(socket => {\n      const key = socket.remoteAddress || 'unknown';\n      return !cachedTracksRef.current[key]?.includes(selected.id);\n    });\n\n    if (targetSockets.length === 0) {\n      addLog(\`Skipping transfer. All nodes already cached \${selected.name}\`);\n      setStatus('Already cached on all nodes');\n      setTransferProgressText(\`Ready: \${selected.name}\`);\n      setTransferProgress(100);\n      setTrackProgress(selected.id, 100);\n      return;\n    }\n\n    activeTransferIdsRef.current.add(selected.id);\n\n    try {\n      setTransferProgress(0);\n      setTrackProgress(selected.id, 0);\n      setTransferProgressText(\`Preparing: \${selected.name}\`);\n      setStatus('Reading selected track...');\n      addLog(\`Reading track for transfer: \${selected.name}\`);\n\n      const base64: string = await PartyAudio.readAudioUriAsBase64(selected.uri);\n      const chunks: string[] = [];\n\n      for (let i = 0; i < base64.length; i += TRANSFER_CHUNK_SIZE) {\n        chunks.push(base64.slice(i, i + TRANSFER_CHUNK_SIZE));\n      }\n\n      const startPayload = {\n        id: selected.id,\n        name: selected.name,\n        chunks: chunks.length,\n        bytes: base64.length,\n      };\n\n      targetSockets.forEach(socket => {\n        writeSocket(socket, \`TRACK_TRANSFER_START|\${JSON.stringify(startPayload)}\`);\n      });\n\n      // Send small batches and yield to the JS/native socket bridge. This prevents\n      // large files from starving playlist, metadata, heartbeat and playback messages.\n      for (let i = 0; i < chunks.length; i++) {\n        targetSockets.forEach(socket => {\n          writeSocket(socket, \`TRACK_TRANSFER_CHUNK|\${selected.id}|\${i}|\${chunks[i]}\`);\n        });\n\n        const isBatchBoundary =\n          (i + 1) % TRANSFER_BATCH_SIZE === 0 || i === chunks.length - 1;\n\n        if (isBatchBoundary) {\n          const percent = Math.min(99, Math.round(((i + 1) / chunks.length) * 100));\n          setTransferProgress(percent);\n          setTrackProgress(selected.id, percent);\n          setTransferProgressText(\`Sending \${selected.name}: \${percent}%\`);\n          setStatus(\`Sending \${selected.name}: \${i + 1}/\${chunks.length} chunks\`);\n          await new Promise<void>(resolve => setTimeout(resolve, TRANSFER_BATCH_PAUSE_MS));\n        }\n      }\n\n      targetSockets.forEach(socket => {\n        writeSocket(socket, \`TRACK_TRANSFER_END|\${selected.id}\`);\n      });\n\n      // 100% now means confirmed cached, not merely written to the socket.\n      setTransferProgress(99);\n      setTrackProgress(selected.id, 99);\n      setTransferProgressText(\`Finalising \${selected.name} on speakers…\`);\n      setStatus('Waiting for speaker cache confirmations');\n      addLog(\`Track data sent: \${selected.name} (\${chunks.length} chunks to \${targetSockets.length} node(s))\`);\n    } catch (error) {\n      addLog(\`Track transfer error: \${String(error)}\`);\n      setTransferProgressText(\`Transfer failed: \${selected.name}\`);\n      setStatus('Track transfer failed');\n      Alert.alert('Track transfer error', String(error));\n    } finally {\n      activeTransferIdsRef.current.delete(selected.id);\n    }\n  };\n`;

source = source.slice(0, transferStart) + newTransferFunction + source.slice(transferEnd);

replaceOnce(
  'node chunk progress cadence',
  `          if (index % 10 === 0) {\n            const percent = Math.round(((index + 1) / buffer.chunks.length) * 100);\n            setTrackProgress(trackId, percent);\n            setStatus(\`Receiving \${buffer.name}: \${percent}%\`);\n          }`,
  `          if (index % TRANSFER_BATCH_SIZE === 0 || index === buffer.chunks.length - 1) {\n            const percent = Math.min(99, Math.round(((index + 1) / buffer.chunks.length) * 100));\n            setTrackProgress(trackId, percent);\n            setStatus(\`Receiving \${buffer.name}: \${percent}%\`);\n          }`,
);

replaceOnce(
  'node transfer integrity check',
  `        if (buffer) {\n          try {\n            const base64 = buffer.chunks.join('');\n            await PartyAudio.saveBase64Track(trackId, buffer.name, base64);`,
  `        if (buffer) {\n          try {\n            const missingChunks = buffer.chunks.reduce<number[]>((missing, chunk, index) => {\n              if (!chunk) missing.push(index);\n              return missing;\n            }, []);\n\n            if (missingChunks.length > 0) {\n              throw new Error(\`Incomplete transfer: missing \${missingChunks.length} chunk(s)\`);\n            }\n\n            const base64 = buffer.chunks.join('');\n            setStatus(\`Finalising \${buffer.name}…\`);\n            await PartyAudio.saveBase64Track(trackId, buffer.name, base64);`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker progressive transfer optimisation applied.');
