import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'reconnect refs',
  `  const nodeHeartbeatTimerRef = useRef<any>(null);\n  const appStateRef = useRef(AppState.currentState);`,
  `  const nodeHeartbeatTimerRef = useRef<any>(null);\n  const nodeReconnectTimerRef = useRef<any>(null);\n  const nodeReconnectAttemptRef = useRef(0);\n  const nodeReconnectScheduledRef = useRef(false);\n  const nodeManualDisconnectRef = useRef(false);\n  const lastHostIpRef = useRef<string | null>(null);\n  const appStateRef = useRef(AppState.currentState);`,
);

replaceOnce(
  'connect function prelude',
  `  const connectToHost = (ipOverride?: string) => {\n    const ipToUse = ipOverride || hostIp;`,
  `  const connectToHost = (ipOverride?: string) => {\n    const ipToUse = ipOverride || hostIp;\n    lastHostIpRef.current = ipToUse;\n    nodeManualDisconnectRef.current = false;\n    nodeReconnectScheduledRef.current = false;\n\n    if (nodeReconnectTimerRef.current) {\n      clearTimeout(nodeReconnectTimerRef.current);\n      nodeReconnectTimerRef.current = null;\n    }`,
);

replaceOnce(
  'connected reset',
  `        setStatus('Node connected');\n        addLog('Connected to host');`,
  `        nodeReconnectAttemptRef.current = 0;\n        nodeReconnectScheduledRef.current = false;\n        setStatus('Node connected');\n        addLog('Connected to host');`,
);

replaceOnce(
  'heartbeat reconnect trigger',
  `        nodeHeartbeatTimerRef.current = setInterval(() => {\n          if (clientRef.current) {\n            try {\n              writeSocket(clientRef.current, "I'M_ALIVE");\n            } catch (error) {\n              addLog(\`Heartbeat failed: ${'${'}String(error)}\`);\n            }\n          }\n        }, 5000);`,
  `        nodeHeartbeatTimerRef.current = setInterval(() => {\n          if (clientRef.current) {\n            const sent = writeSocket(clientRef.current, "I'M_ALIVE");\n            if (!sent) {\n              addLog('Heartbeat detected a dead connection');\n              try { clientRef.current?.destroy(); } catch {}\n            }\n          }\n        }, 5000);`,
);

replaceOnce(
  'before client error handlers',
  `    client.on('error', error => {`,
  `    const scheduleReconnect = (reason: string) => {\n      if (nodeManualDisconnectRef.current || nodeReconnectScheduledRef.current) return;\n      const ip = lastHostIpRef.current;\n      if (!ip) return;\n\n      nodeReconnectScheduledRef.current = true;\n      const attempt = nodeReconnectAttemptRef.current + 1;\n      nodeReconnectAttemptRef.current = attempt;\n      const delay = Math.min(10000, 1000 * Math.pow(2, Math.min(attempt - 1, 3)));\n\n      setStatus(\`Connection lost. Reconnecting in ${'${'}Math.round(delay / 1000)}s…\`);\n      addLog(\`Connection lost (${ '${'}reason}); reconnect attempt ${'${'}attempt} in ${'${'}delay}ms\`);\n\n      nodeReconnectTimerRef.current = setTimeout(() => {\n        nodeReconnectTimerRef.current = null;\n        nodeReconnectScheduledRef.current = false;\n        connectToHost(ip);\n      }, delay);\n    };\n\n    client.on('error', error => {`,
);

replaceOnce(
  'client error body',
  `    client.on('error', error => {\n      setStatus(\`Connection error: ${'${'}String(error)}\`);\n      Alert.alert('Connection error', String(error));\n      if (nodeHeartbeatTimerRef.current) {\n        clearInterval(nodeHeartbeatTimerRef.current);\n        nodeHeartbeatTimerRef.current = null;\n      }\n      clientRef.current = null;\n    });`,
  `    client.on('error', error => {\n      addLog(\`Connection error: ${'${'}String(error)}\`);\n      if (nodeHeartbeatTimerRef.current) {\n        clearInterval(nodeHeartbeatTimerRef.current);\n        nodeHeartbeatTimerRef.current = null;\n      }\n      if (clientRef.current === client) clientRef.current = null;\n      scheduleReconnect(String(error));\n    });`,
);

replaceOnce(
  'client close body',
  `    client.on('close', () => {\n      if (nodeHeartbeatTimerRef.current) {\n        clearInterval(nodeHeartbeatTimerRef.current);\n        nodeHeartbeatTimerRef.current = null;\n      }\n      setStatus('Connection closed');\n      clientRef.current = null;\n    });`,
  `    client.on('close', () => {\n      if (nodeHeartbeatTimerRef.current) {\n        clearInterval(nodeHeartbeatTimerRef.current);\n        nodeHeartbeatTimerRef.current = null;\n      }\n      if (clientRef.current === client) clientRef.current = null;\n      if (!nodeManualDisconnectRef.current) {\n        scheduleReconnect('socket closed');\n      } else {\n        setStatus('Disconnected from host');\n      }\n    });`,
);

replaceOnce(
  'manual disconnect',
  `  const disconnectFromHost = () => {\n\n    if (clientRef.current) {`,
  `  const disconnectFromHost = () => {\n    nodeManualDisconnectRef.current = true;\n    nodeReconnectScheduledRef.current = false;\n    nodeReconnectAttemptRef.current = 0;\n\n    if (nodeReconnectTimerRef.current) {\n      clearTimeout(nodeReconnectTimerRef.current);\n      nodeReconnectTimerRef.current = null;\n    }\n\n    if (clientRef.current) {`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker automatic reconnect patch applied.');
