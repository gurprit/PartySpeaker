import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) {
    throw new Error(`Patch failed: ${label}`);
  }
  source = source.replace(before, after);
};

replaceOnce(
  'node cache ref',
  '  const cachedTracksRef = useRef<Record<string, string[]>>({});\n  const activeTransferIdsRef = useRef<Set<string>>(new Set());',
  '  const cachedTracksRef = useRef<Record<string, string[]>>({});\n  const nodeCachedTrackIdsRef = useRef<Set<string>>(new Set());\n  const activeTransferIdsRef = useRef<Set<string>>(new Set());',
);

replaceOnce(
  'safe socket writer',
  `  const writeSocket = (socket: any, message: string) => {\n    socket.write(\`${'${'}message}\\n\`);\n  };`,
  `  const isSocketUsable = (socket: any) => {\n    return Boolean(socket) && socket.destroyed !== true && socket.writable !== false;\n  };\n\n  const pruneHostSocket = (socket: any, reason = 'socket unavailable') => {\n    const before = clientsRef.current.length;\n    clientsRef.current = clientsRef.current.filter(item => item !== socket && isSocketUsable(item));\n\n    if (clientsRef.current.length !== before) {\n      setNodeCount(clientsRef.current.length);\n      addLog(\`Pruned speaker (${ '${'}reason}); ${'${'}clientsRef.current.length} connected\`);\n    }\n  };\n\n  const writeSocket = (socket: any, message: string) => {\n    if (!isSocketUsable(socket)) {\n      pruneHostSocket(socket, 'write skipped: closed');\n      return false;\n    }\n\n    try {\n      socket.write(\`${'${'}message}\\n\`);\n      return true;\n    } catch (error) {\n      pruneHostSocket(socket, \`write failed: ${'${'}String(error)}\`);\n      addLog(\`Socket write ignored: ${'${'}String(error)}\`);\n      return false;\n    }\n  };`,
);

replaceOnce(
  'host error prune',
  `      (socket as any).on('error', (error: any) => {\n        setStatus(\`Socket error: ${'${'}String(error)}\`);\n        addLog(\`Socket error: ${'${'}String(error)}\`);\n      });`,
  `      (socket as any).on('error', (error: any) => {\n        pruneHostSocket(socket, String(error));\n        setStatus(\`Socket error: ${'${'}String(error)}\`);\n        addLog(\`Socket error: ${'${'}String(error)}\`);\n      });`,
);

replaceOnce(
  'node cache announce',
  `        writeSocket(client, 'NODE_CONNECTED');\n\n        if (nodeHeartbeatTimerRef.current) {`,
  `        writeSocket(client, 'NODE_CONNECTED');\n        writeSocket(client, \`NODE_CACHE_STATE|${'${'}JSON.stringify(Array.from(nodeCachedTrackIdsRef.current))}\`);\n\n        if (nodeHeartbeatTimerRef.current) {`,
);

replaceOnce(
  'host cache state handler',
  `          if (message.startsWith('TRACK_RECEIVED|')) {`,
  `          if (message.startsWith('NODE_CACHE_STATE|')) {\n            try {\n              const cachedIds = JSON.parse(message.replace('NODE_CACHE_STATE|', ''));\n              const key = socket.remoteAddress || 'unknown';\n              cachedTracksRef.current[key] = Array.isArray(cachedIds) ? cachedIds : [];\n              addLog(\`Speaker cache restored: ${'${'}cachedTracksRef.current[key].length} track(s)\`);\n\n              const selected = getSelectedTrack();\n              if (selected) {\n                const liveSockets = clientsRef.current.filter(isSocketUsable);\n                const readyCount = liveSockets.filter(clientSocket => {\n                  const clientKey = clientSocket.remoteAddress || 'unknown';\n                  return cachedTracksRef.current[clientKey]?.includes(selected.id);\n                }).length;\n\n                if (liveSockets.length > 0 && readyCount === liveSockets.length) {\n                  setTrackProgress(selected.id, 100);\n                  setTransferProgress(100);\n                  setTransferProgressText(\`Ready: ${'${'}selected.name}\`);\n                  setStatus(\`Ready on all speakers: ${'${'}selected.name}\`);\n                }\n              }\n            } catch (error) {\n              addLog(\`Invalid cache-state message: ${'${'}String(error)}\`);\n            }\n            return;\n          }\n\n          if (message.startsWith('TRACK_RECEIVED|')) {`,
);

replaceOnce(
  'remember node download',
  `          setTrackProgress(payload.id, 100);\n          setStatus(\`Track cached: ${'${'}payload.name}\`);\n          addLog(\`Native download complete: ${'${'}payload.name}\`);\n          writeSocket(client, \`TRACK_RECEIVED|${'${'}payload.id}|${'${'}payload.name}\`);`,
  `          nodeCachedTrackIdsRef.current.add(payload.id);\n          setTrackProgress(payload.id, 100);\n          setStatus(\`Track cached: ${'${'}payload.name}\`);\n          addLog(\`Native download complete: ${'${'}payload.name}\`);\n          writeSocket(client, \`TRACK_RECEIVED|${'${'}payload.id}|${'${'}payload.name}\`);`,
);

// Only use live sockets for readiness and download targeting.
source = source.replaceAll(
  'clientsRef.current.filter(socket => {',
  'clientsRef.current.filter(socket => isSocketUsable(socket) && (() => {',
);
source = source.replaceAll(
  '    });\n\n    if (missingSockets.length === 0) {',
  '    })());\n\n    if (missingSockets.length === 0) {',
);

// The targeted replacement above is intentionally conservative; undo it if the
// expected native-transfer function shape was not matched cleanly.
if (source.includes('filter(socket => isSocketUsable(socket) && (() => {') && !source.includes('})());\n\n    if (missingSockets.length === 0)')) {
  throw new Error('Patch failed: live download socket filter');
}

// Keep host broadcasts from retaining dead sockets indefinitely.
replaceOnce(
  'broadcast prune',
  `    clientsRef.current.forEach(socket => {\n      writeSocket(socket, \`NOW_PLAYING|${'${'}JSON.stringify(payload)}\`);\n    });`,
  `    clientsRef.current = clientsRef.current.filter(isSocketUsable);\n    setNodeCount(clientsRef.current.length);\n    clientsRef.current.forEach(socket => {\n      writeSocket(socket, \`NOW_PLAYING|${'${'}JSON.stringify(payload)}\`);\n    });`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker connection resilience patch applied.');
