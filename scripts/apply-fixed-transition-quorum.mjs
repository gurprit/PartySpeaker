import fs from 'node:fs';

const appPath = new URL('../App.tsx', import.meta.url);
let source = fs.readFileSync(appPath, 'utf8');

const replacements = [
  [
`  const isTrackCachedOnAllNodes = (trackId: string) => {
    const liveSockets = clientsRef.current.filter(isSocketUsable);
    if (liveSockets.length === 0) {
      return false;
    }

    return liveSockets.every(socket => {
      const key = socket.remoteAddress || 'unknown';
      return cachedTracksRef.current[key]?.includes(trackId);
    });
  };

  const waitForTrackCachedOnAllNodes = async (track: Track, timeoutMs = TRACK_CACHE_TIMEOUT_MS) => {
    const startedAt = Date.now();

    while (!isTrackCachedOnAllNodes(track.id)) {
      const cachedCount = clientsRef.current.filter(socket => {
        const key = socket.remoteAddress || 'unknown';
        return cachedTracksRef.current[key]?.includes(track.id);
      }).length;

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(\`Timed out waiting for speakers to cache \${track.name} (\${cachedCount}/\${clientsRef.current.length} ready)\`);
      }

      setStatus(\`Caching \${track.name}: \${cachedCount}/\${clientsRef.current.length} speakers ready\`);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
    }
  };`,
`  const getLiveNodeKeys = () =>
    clientsRef.current
      .filter(isSocketUsable)
      .map(socket => socket.remoteAddress || 'unknown');

  const isTrackCachedOnAllNodes = (trackId: string, expectedNodeKeys?: string[]) => {
    const requiredKeys = expectedNodeKeys || getLiveNodeKeys();
    if (requiredKeys.length === 0) {
      return false;
    }

    const liveKeys = new Set(getLiveNodeKeys());
    if (!requiredKeys.every(key => liveKeys.has(key))) {
      return false;
    }

    return requiredKeys.every(key => cachedTracksRef.current[key]?.includes(trackId));
  };

  const waitForTrackCachedOnAllNodes = async (
    track: Track,
    timeoutMs = TRACK_CACHE_TIMEOUT_MS,
    expectedNodeKeys?: string[],
  ) => {
    const startedAt = Date.now();
    const requiredKeys = expectedNodeKeys || getLiveNodeKeys();

    if (requiredKeys.length === 0) {
      throw new Error('No speakers were connected when the cache wait started');
    }

    while (!isTrackCachedOnAllNodes(track.id, requiredKeys)) {
      const liveKeys = new Set(getLiveNodeKeys());
      const connectedRequiredCount = requiredKeys.filter(key => liveKeys.has(key)).length;
      const cachedCount = requiredKeys.filter(key =>
        liveKeys.has(key) && cachedTracksRef.current[key]?.includes(track.id),
      ).length;

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          \`Timed out waiting for speakers to cache \${track.name} (\${cachedCount}/\${requiredKeys.length} ready, \${connectedRequiredCount}/\${requiredKeys.length} connected)\`,
        );
      }

      if (connectedRequiredCount < requiredKeys.length) {
        setStatus(
          \`Waiting for speakers to reconnect: \${connectedRequiredCount}/\${requiredKeys.length} connected\`,
        );
      } else {
        setStatus(\`Caching \${track.name}: \${cachedCount}/\${requiredKeys.length} speakers ready\`);
      }
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
    }
  };`
  ],
  [
`    if (!isTrackCachedOnAllNodes(nextTrack.id)) {
      setStatus(\`Preparing next track: \${nextTrack.name}\`);
      transferSelectedTrackToNodes(nextTrack);
      try {
        await waitForTrackCachedOnAllNodes(nextTrack);
      } catch (error) {
        addLog(\`Next-track cache wait failed: \${String(error)}\`);
        setStatus('Next track could not be prepared on every speaker');
        return;
      }
    }

    await playSelectedTrackOnAllSpeakers(nextTrack);`,
`    const expectedNodeKeys = getLiveNodeKeys();
    if (!isTrackCachedOnAllNodes(nextTrack.id, expectedNodeKeys)) {
      setStatus(\`Preparing next track: \${nextTrack.name}\`);
      transferSelectedTrackToNodes(nextTrack);
      try {
        await waitForTrackCachedOnAllNodes(nextTrack, TRACK_CACHE_TIMEOUT_MS, expectedNodeKeys);
      } catch (error) {
        addLog(\`Next-track cache wait failed: \${String(error)}\`);
        setStatus('Next track could not be prepared on every speaker');
        return;
      }
    }

    await playSelectedTrackOnAllSpeakers(nextTrack, expectedNodeKeys);`
  ],
  [
`    const advance = async () => {
      if (!isTrackCachedOnAllNodes(nextTrack.id)) {
        transferSelectedTrackToNodes(nextTrack);
        try {
          await waitForTrackCachedOnAllNodes(nextTrack);
        } catch (error) {
          addLog(\`Auto-next cache wait failed: \${String(error)}\`);
          setStatus('Auto-next waiting for speakers failed');
          return;
        }
      }
      await playSelectedTrackOnAllSpeakers(nextTrack);
    };`,
`    const advance = async () => {
      const expectedNodeKeys = getLiveNodeKeys();
      if (expectedNodeKeys.length === 0) {
        autoAdvancedTrackRef.current = null;
        setStatus('Auto-next waiting for speakers to reconnect');
        return;
      }

      if (!isTrackCachedOnAllNodes(nextTrack.id, expectedNodeKeys)) {
        transferSelectedTrackToNodes(nextTrack);
        try {
          await waitForTrackCachedOnAllNodes(nextTrack, TRACK_CACHE_TIMEOUT_MS, expectedNodeKeys);
        } catch (error) {
          autoAdvancedTrackRef.current = null;
          addLog(\`Auto-next cache wait failed: \${String(error)}\`);
          setStatus('Auto-next waiting for speakers failed');
          return;
        }
      }
      await playSelectedTrackOnAllSpeakers(nextTrack, expectedNodeKeys);
    };`
  ],
  [
`  const playSelectedTrackOnAllSpeakers = async (trackOverride?: Track) => {`,
`  const playSelectedTrackOnAllSpeakers = async (
    trackOverride?: Track,
    expectedNodeKeysOverride?: string[],
  ) => {`
  ],
  [
`    if (clientsRef.current.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    if (!isTrackCachedOnAllNodes(selected.id)) {
      const readyCount = clientsRef.current.filter(socket => {
        const key = socket.remoteAddress || 'unknown';
        return cachedTracksRef.current[key]?.includes(selected.id);
      }).length;
      const message = \`Still downloading to speakers (\${readyCount}/\${clientsRef.current.length} ready)\`;
      addLog(message);
      setStatus(message);
      Alert.alert('Track still downloading', message);
      return;
    }

    const liveSocketsForStandby = clientsRef.current.filter(isSocketUsable);`,
`    const expectedNodeKeys = expectedNodeKeysOverride || getLiveNodeKeys();
    if (expectedNodeKeys.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    if (!isTrackCachedOnAllNodes(selected.id, expectedNodeKeys)) {
      const liveKeys = new Set(getLiveNodeKeys());
      const readyCount = expectedNodeKeys.filter(key =>
        liveKeys.has(key) && cachedTracksRef.current[key]?.includes(selected.id),
      ).length;
      const message = \`Still downloading to speakers (\${readyCount}/\${expectedNodeKeys.length} ready)\`;
      addLog(message);
      setStatus(message);
      Alert.alert('Track still downloading', message);
      return;
    }

    const liveSocketsForStandby = clientsRef.current.filter(socket =>
      isSocketUsable(socket) && expectedNodeKeys.includes(socket.remoteAddress || 'unknown'),
    );`
  ],
  [
`      liveSocketsForStandby.length > 0 &&
      liveSocketsForStandby.every(socket =>
        standbyPreparedNodesRef.current.has(socket.remoteAddress || 'unknown'),
      );`,
`      liveSocketsForStandby.length === expectedNodeKeys.length &&
      expectedNodeKeys.every(key => standbyPreparedNodesRef.current.has(key));`
  ],
  [
`    const liveSockets = clientsRef.current.filter(isSocketUsable);
    if (liveSockets.length === 0) {
      setStatus('No connected speakers');
      return;
    }`,
`    const liveSockets = clientsRef.current.filter(socket =>
      isSocketUsable(socket) && expectedNodeKeys.includes(socket.remoteAddress || 'unknown'),
    );
    if (liveSockets.length !== expectedNodeKeys.length) {
      setStatus(\`Waiting for speakers to reconnect: \${liveSockets.length}/\${expectedNodeKeys.length} connected\`);
      return;
    }`
  ],
  [
`    while (true) {
      const currentSockets = clientsRef.current.filter(isSocketUsable);
      const allReady =
        currentSockets.length > 0 &&
        currentSockets.every(socket =>
          strictPreparedNodesRef.current.has(socket.remoteAddress || 'unknown'),
        );

      if (allReady) break;

      const now = Date.now();
      if (now - lastPrepareRetryAt >= 1500) {
        currentSockets.forEach(socket => {
          const key = socket.remoteAddress || 'unknown';
          if (!strictPreparedNodesRef.current.has(key)) {
            writeSocket(socket, \`PREPARE_TRACK|\${JSON.stringify(preparePayload)}\`);
          }
        });
        lastPrepareRetryAt = now;
        addLog('Retried prepare on speakers still waiting');
      }

      if (now - prepareStartedAt > PREPARE_TIMEOUT_MS) {
        const readyCount = currentSockets.filter(socket =>
          strictPreparedNodesRef.current.has(socket.remoteAddress || 'unknown'),
        ).length;
        strictPrepareTransactionRef.current = null;
        setStatus(\`Playback cancelled: only \${readyCount}/\${currentSockets.length} speakers became ready\`);
        Alert.alert(
          'Speakers not ready',
          \`Playback was not started because only \${readyCount} of \${currentSockets.length} speakers were ready.\`,
        );
        return;
      }

      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }`,
`    while (true) {
      const currentSockets = clientsRef.current.filter(socket =>
        isSocketUsable(socket) && expectedNodeKeys.includes(socket.remoteAddress || 'unknown'),
      );
      const currentKeys = new Set(currentSockets.map(socket => socket.remoteAddress || 'unknown'));
      const connectedEverywhere = expectedNodeKeys.every(key => currentKeys.has(key));
      const allReady =
        connectedEverywhere &&
        expectedNodeKeys.every(key => strictPreparedNodesRef.current.has(key));

      if (allReady) break;

      const now = Date.now();
      if (now - lastPrepareRetryAt >= 1500) {
        currentSockets.forEach(socket => {
          const key = socket.remoteAddress || 'unknown';
          if (!strictPreparedNodesRef.current.has(key)) {
            writeSocket(socket, \`PREPARE_TRACK|\${JSON.stringify(preparePayload)}\`);
          }
        });
        lastPrepareRetryAt = now;
        if (!connectedEverywhere) {
          setStatus(\`Waiting for speakers to reconnect: \${currentSockets.length}/\${expectedNodeKeys.length} connected\`);
          addLog('Strict start paused while an expected speaker reconnects');
        } else {
          addLog('Retried prepare on speakers still waiting');
        }
      }

      if (now - prepareStartedAt > PREPARE_TIMEOUT_MS) {
        const readyCount = expectedNodeKeys.filter(key => strictPreparedNodesRef.current.has(key)).length;
        strictPrepareTransactionRef.current = null;
        setStatus(\`Playback cancelled: only \${readyCount}/\${expectedNodeKeys.length} speakers became ready\`);
        Alert.alert(
          'Speakers not ready',
          \`Playback was not started because only \${readyCount} of \${expectedNodeKeys.length} expected speakers were ready.\`,
        );
        return;
      }

      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }`
  ],
  [
`    liveSockets.forEach(socket => {
      writeSocket(socket, \`START_PRIMED_AT|\${JSON.stringify(startPayload)}\`);
    });`,
`    const startSockets = clientsRef.current.filter(socket =>
      isSocketUsable(socket) && expectedNodeKeys.includes(socket.remoteAddress || 'unknown'),
    );
    if (startSockets.length !== expectedNodeKeys.length) {
      strictPrepareTransactionRef.current = null;
      setStatus('Synchronized start cancelled because a speaker disconnected');
      addLog('Strict start cancelled: expected speaker disappeared before START_PRIMED_AT');
      return;
    }

    startSockets.forEach(socket => {
      writeSocket(socket, \`START_PRIMED_AT|\${JSON.stringify(startPayload)}\`);
    });`
  ],
];

let applied = 0;
for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    console.error('Could not find expected App.tsx block:\n', before.slice(0, 240));
    process.exit(1);
  }
  source = source.replace(before, after);
  applied += 1;
}

fs.writeFileSync(appPath, source);
console.log(`Applied ${applied} fixed-quorum transition replacement(s) to App.tsx`);
