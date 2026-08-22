import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'next button strict transition',
  `  const selectTrackByOffset = (offset: number) => {\n    if (playlist.length === 0) {\n      return;\n    }\n\n    const currentIndex = playlist.findIndex(track => track.id === selectedTrackId);\n    const safeIndex = currentIndex >= 0 ? currentIndex : 0;\n    const nextIndex = (safeIndex + offset + playlist.length) % playlist.length;\n    const nextTrack = playlist[nextIndex];\n\n    selectedTrackIdRef.current = nextTrack.id;\n    setSelectedTrackId(nextTrack.id);\n    addLog(\`Selected track: ${'${'}nextTrack.name}\`);\n    autoSyncAndTransfer(nextTrack, playlist, nextTrack.id);\n\n    setTimeout(() => {\n      playSelectedTrackOnAllSpeakers(nextTrack);\n    }, 1000);\n  };`,
  `  const selectTrackByOffset = async (offset: number) => {\n    if (playlist.length === 0) {\n      return;\n    }\n\n    const currentIndex = playlist.findIndex(track => track.id === selectedTrackId);\n    const safeIndex = currentIndex >= 0 ? currentIndex : 0;\n    const nextIndex = (safeIndex + offset + playlist.length) % playlist.length;\n    const nextTrack = playlist[nextIndex];\n\n    selectedTrackIdRef.current = nextTrack.id;\n    setSelectedTrackId(nextTrack.id);\n    addLog(\`Selected track: ${'${'}nextTrack.name}\`);\n    syncPlaylistSnapshotToNodes(playlist, nextTrack.id);\n\n    if (!isTrackCachedOnAllNodes(nextTrack.id)) {\n      setStatus(\`Preparing next track: ${'${'}nextTrack.name}\`);\n      transferSelectedTrackToNodes(nextTrack);\n      try {\n        await waitForTrackCachedOnAllNodes(nextTrack);\n      } catch (error) {\n        addLog(\`Next-track cache wait failed: ${'${'}String(error)}\`);\n        setStatus('Next track could not be prepared on every speaker');\n        return;\n      }\n    }\n\n    await playSelectedTrackOnAllSpeakers(nextTrack);\n  };`,
);

replaceOnce(
  'auto next strict transition',
  `    selectedTrackIdRef.current = nextTrack.id;\n    setSelectedTrackId(nextTrack.id);\n    syncPlaylistSnapshotToNodes(playlistRef.current, nextTrack.id);\n    setTimeout(() => playSelectedTrackOnAllSpeakers(nextTrack), 120);`,
  `    selectedTrackIdRef.current = nextTrack.id;\n    setSelectedTrackId(nextTrack.id);\n    syncPlaylistSnapshotToNodes(playlistRef.current, nextTrack.id);\n\n    const advance = async () => {\n      if (!isTrackCachedOnAllNodes(nextTrack.id)) {\n        transferSelectedTrackToNodes(nextTrack);\n        try {\n          await waitForTrackCachedOnAllNodes(nextTrack);\n        } catch (error) {\n          addLog(\`Auto-next cache wait failed: ${'${'}String(error)}\`);\n          setStatus('Auto-next waiting for speakers failed');\n          return;\n        }\n      }\n      await playSelectedTrackOnAllSpeakers(nextTrack);\n    };\n\n    advance();`,
);

replaceOnce(
  'stop heartbeat before strict prepare',
  `    await calibrateNodeClocksBeforePlayback();\n\n    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
  `    // Stop the previous track heartbeat before priming a replacement. Otherwise\n    // a late NOW_PLAYING from the old song can cause a node to restore/catch-up\n    // the old player while the new track is being prepared.\n    if (nowPlayingBroadcastTimerRef.current) {\n      clearInterval(nowPlayingBroadcastTimerRef.current);\n      nowPlayingBroadcastTimerRef.current = null;\n    }\n\n    await calibrateNodeClocksBeforePlayback();\n\n    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
);

replaceOnce(
  'prepare retry state',
  `    const prepareStartedAt = Date.now();\n    const PREPARE_TIMEOUT_MS = 12000;\n\n    while (true) {`,
  `    const prepareStartedAt = Date.now();\n    const PREPARE_TIMEOUT_MS = 20000;\n    let lastPrepareRetryAt = prepareStartedAt;\n\n    while (true) {`,
);

replaceOnce(
  'prepare retry loop',
  `      if (allReady) break;\n\n      if (Date.now() - prepareStartedAt > PREPARE_TIMEOUT_MS) {`,
  `      if (allReady) break;\n\n      const now = Date.now();\n      if (now - lastPrepareRetryAt >= 1500) {\n        currentSockets.forEach(socket => {\n          const key = socket.remoteAddress || 'unknown';\n          if (!strictPreparedNodesRef.current.has(key)) {\n            writeSocket(socket, \`PREPARE_TRACK|${'${'}JSON.stringify(preparePayload)}\`);\n          }\n        });\n        lastPrepareRetryAt = now;\n        addLog('Retried prepare on speakers still waiting');\n      }\n\n      if (now - prepareStartedAt > PREPARE_TIMEOUT_MS) {`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker strict next-track transition patch applied.');
