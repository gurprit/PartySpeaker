import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'AppState import',
  `  Alert,\n  NativeModules,`,
  `  Alert,\n  AppState,\n  NativeModules,`,
);

replaceOnce(
  'app state ref',
  `  const nodeHeartbeatTimerRef = useRef<any>(null);\n  const nowPlayingRef = useRef<{trackId: string; trackName: string; startedAtHostMs: number} | null>(null);`,
  `  const nodeHeartbeatTimerRef = useRef<any>(null);\n  const appStateRef = useRef(AppState.currentState);\n  const nowPlayingRef = useRef<{trackId: string; trackName: string; startedAtHostMs: number} | null>(null);`,
);

replaceOnce(
  'resume effect',
  `  useEffect(() => {\n    refreshHostAddress();\n  }, []);`,
  `  useEffect(() => {\n    refreshHostAddress();\n  }, []);\n\n  useEffect(() => {\n    const subscription = AppState.addEventListener('change', nextState => {\n      const previousState = appStateRef.current;\n      appStateRef.current = nextState;\n\n      if (mode !== 'node') return;\n\n      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {\n        addLog('Node returned to foreground; requesting live resync');\n        currentlyPlayingTrackRef.current = null;\n\n        if (isSocketUsable(clientRef.current)) {\n          writeSocket(clientRef.current, 'NODE_RESUMED');\n          writeSocket(\n            clientRef.current,\n            \`NODE_CACHE_STATE|${'${'}JSON.stringify(Array.from(nodeCachedTrackIdsRef.current))}\`,\n          );\n        }\n      }\n\n      if (nextState === 'background' || nextState === 'inactive') {\n        addLog('Node moved to background');\n      }\n    });\n\n    return () => subscription.remove();\n  }, [mode]);`,
);

replaceOnce(
  'host resume handler',
  `          if (message === 'PLAYLIST_RECEIVED') {\n            setPlaylistSyncedNodeCount(previous => previous + 1);\n            addLog('Node confirmed playlist sync');\n          }`,
  `          if (message === 'PLAYLIST_RECEIVED') {\n            setPlaylistSyncedNodeCount(previous => previous + 1);\n            addLog('Node confirmed playlist sync');\n          }\n\n          if (message === 'NODE_RESUMED') {\n            addLog('Speaker resumed; sending fresh clock + playback state');\n            sendTimeSyncToNode(socket);\n\n            const playlistPayload = {\n              tracks: playlist.map(track => ({\n                id: track.id,\n                name: track.name,\n                metadata: track.metadata,\n              })),\n              selectedTrackId,\n            };\n\n            writeSocket(socket, \`PLAYLIST_SYNC|${'${'}JSON.stringify(playlistPayload)}\`);\n\n            if (nowPlayingRef.current) {\n              writeSocket(\n                socket,\n                \`NOW_PLAYING|${'${'}JSON.stringify({\n                  ...nowPlayingRef.current,\n                  hostNowMs: Date.now(),\n                })}\`,\n              );\n            }\n            return;\n          }`,
);

replaceOnce(
  'track received live sockets',
  `            const cachedCount = clientsRef.current.filter(clientSocket => {\n              const clientKey = clientSocket.remoteAddress || 'unknown';\n              return cachedTracksRef.current[clientKey]?.includes(trackId);\n            }).length;\n\n            addLog(\`Node cached track: ${'${'}trackName} (${'${'}cachedCount}/${'${'}clientsRef.current.length})\`);\n\n            if (cachedCount === clientsRef.current.length) {`,
  `            const liveSockets = clientsRef.current.filter(isSocketUsable);\n            const cachedCount = liveSockets.filter(clientSocket => {\n              const clientKey = clientSocket.remoteAddress || 'unknown';\n              return cachedTracksRef.current[clientKey]?.includes(trackId);\n            }).length;\n\n            addLog(\`Node cached track: ${'${'}trackName} (${'${'}cachedCount}/${'${'}liveSockets.length})\`);\n\n            if (liveSockets.length > 0 && cachedCount === liveSockets.length) {`,
);

replaceOnce(
  'track received progress text',
  `              setTransferProgressText(\`Caching ${'${'}trackName}: ${'${'}cachedCount}/${'${'}clientsRef.current.length} speakers ready\`);`,
  `              setTransferProgressText(\`Caching ${'${'}trackName}: ${'${'}cachedCount}/${'${'}liveSockets.length} active speakers ready\`);`,
);

replaceOnce(
  'native transfer active sockets',
  `    const missingSockets = clientsRef.current.filter(socket => {\n      const key = socket.remoteAddress || 'unknown';\n      return !cachedTracksRef.current[key]?.includes(selected.id);\n    });`,
  `    const liveSockets = clientsRef.current.filter(isSocketUsable);\n    const missingSockets = liveSockets.filter(socket => {\n      const key = socket.remoteAddress || 'unknown';\n      return !cachedTracksRef.current[key]?.includes(selected.id);\n    });`,
);

replaceOnce(
  'selected readiness live sockets',
  `  const isTrackCachedOnAllNodes = (trackId: string) => {\n    if (clientsRef.current.length === 0) {\n      return false;\n    }\n\n    return clientsRef.current.every(socket => {`,
  `  const isTrackCachedOnAllNodes = (trackId: string) => {\n    const liveSockets = clientsRef.current.filter(isSocketUsable);\n    if (liveSockets.length === 0) {\n      return false;\n    }\n\n    return liveSockets.every(socket => {`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker background/resume resync patch applied.');
