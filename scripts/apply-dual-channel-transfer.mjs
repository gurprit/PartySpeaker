import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce('transfer port', 'const TCP_PORT = 5050;\nconst UDP_PORT = 5051;', 'const TCP_PORT = 5050;\nconst UDP_PORT = 5051;\nconst TRANSFER_PORT = 5052;');
replaceOnce('ack constants', 'const METADATA_HEAD_START_MS = 500;', 'const METADATA_HEAD_START_MS = 500;\nconst TRANSFER_ACK_EVERY_CHUNKS = 8;\nconst TRANSFER_ACK_TIMEOUT_MS = 8000;');
replaceOnce('transfer refs', '  const serverRef = useRef<any>(null);\n  const clientsRef = useRef<any[]>([]);\n  const clientRef = useRef<any>(null);', '  const serverRef = useRef<any>(null);\n  const transferServerRef = useRef<any>(null);\n  const clientsRef = useRef<any[]>([]);\n  const transferClientsRef = useRef<any[]>([]);\n  const clientRef = useRef<any>(null);\n  const transferClientRef = useRef<any>(null);');
replaceOnce('ack refs', '  const activeTransferIdsRef = useRef<Set<string>>(new Set());', '  const activeTransferIdsRef = useRef<Set<string>>(new Set());\n  const transferAckRef = useRef<Record<string, number>>({});');

const hostMarker = '  const startHostServer = async () => {';
const hostIndex = source.indexOf(hostMarker);
if (hostIndex < 0) throw new Error('Patch failed: host marker');
const hostHelper = `  const startTransferServer = () => {\n    if (transferServerRef.current) return;\n\n    const transferServer = TcpSocket.createServer(socket => {\n      transferClientsRef.current.push(socket);\n      addLog('Audio transfer channel connected');\n\n      socket.on('data', data => {\n        (socket as unknown as PartySocketBuffer)._partyBuffer = \`${'${'}(socket as unknown as PartySocketBuffer)._partyBuffer || ''}${'${'}data.toString()}\`;\n        const lines = ((socket as unknown as PartySocketBuffer)._partyBuffer || '').split('\\n');\n        (socket as unknown as PartySocketBuffer)._partyBuffer = lines.pop() || '';\n        lines.forEach((message: string) => {\n          if (message.startsWith('TRANSFER_ACK|')) {\n            const [, trackId, indexText] = message.split('|');\n            transferAckRef.current[\`${'${'}socket.remoteAddress || 'unknown'}|${'${'}trackId}\`] = Number(indexText);\n          }\n        });\n      });\n\n      socket.on('close', () => {\n        transferClientsRef.current = transferClientsRef.current.filter(item => item !== socket);\n        addLog('Audio transfer channel disconnected');\n      });\n      socket.on('error', error => addLog(\`Transfer socket error: ${'${'}String(error)}\`));\n    });\n\n    transferServer.listen({port: TRANSFER_PORT, host: '0.0.0.0'}, () => {\n      transferServerRef.current = transferServer;\n      addLog(\`Audio transfer server listening on ${'${'}TRANSFER_PORT}\`);\n    });\n    transferServer.on('error', error => addLog(\`Transfer server error: ${'${'}String(error)}\`));\n  };\n\n`;
source = source.slice(0, hostIndex) + hostHelper + source.slice(hostIndex);

replaceOnce('start transfer server', '    await refreshHostAddress();\n\n    if (serverRef.current)', '    await refreshHostAddress();\n    startTransferServer();\n\n    if (serverRef.current)');

replaceOnce(
  'stop transfer server',
  `    if (serverRef.current) {\n      serverRef.current.close();\n      serverRef.current = null;\n    }`,
  `    if (serverRef.current) {\n      serverRef.current.close();\n      serverRef.current = null;\n    }\n\n    transferClientsRef.current.forEach(socket => socket.destroy());\n    transferClientsRef.current = [];\n\n    if (transferServerRef.current) {\n      transferServerRef.current.close();\n      transferServerRef.current = null;\n    }`,
);

const transferStart = source.indexOf('  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {');
const transferEnd = source.indexOf('\n  const syncPlaylistSnapshotToNodes =', transferStart);
if (transferStart < 0 || transferEnd < 0) throw new Error('Patch failed: transfer bounds');
let transferFn = source.slice(transferStart, transferEnd);
transferFn = transferFn.replace("    const targetSockets = clientsRef.current.filter(socket => {", "    const targetSockets = transferClientsRef.current.filter(socket => {");
transferFn = transferFn.replace("    if (targetSockets.length === 0) {\n      addLog(`Skipping transfer. All nodes already cached ${selected.name}`);", "    if (transferClientsRef.current.length === 0) {\n      addLog('Waiting for audio transfer channels');\n      setStatus('Waiting for speaker transfer channels');\n      return;\n    }\n\n    if (targetSockets.length === 0) {\n      addLog(`Skipping transfer. All nodes already cached ${selected.name}`);");
transferFn = transferFn.replace("          await new Promise<void>(resolve => setTimeout(resolve, TRANSFER_BATCH_PAUSE_MS));", `          await new Promise<void>(resolve => setTimeout(resolve, TRANSFER_BATCH_PAUSE_MS));\n\n          if ((i + 1) % TRANSFER_ACK_EVERY_CHUNKS === 0) {\n            const ackDeadline = Date.now() + TRANSFER_ACK_TIMEOUT_MS;\n            while (Date.now() < ackDeadline) {\n              const allAcked = targetSockets.every(socket => {\n                const key = \`${'${'}socket.remoteAddress || 'unknown'}|${'${'}selected.id}\`;\n                return (transferAckRef.current[key] ?? -1) >= i;\n              });\n              if (allAcked) break;\n              await new Promise<void>(resolve => setTimeout(resolve, 40));\n            }\n          }`);
source = source.slice(0, transferStart) + transferFn + source.slice(transferEnd);

const handlerMarker = '    const handleHostMessage = async (message: string) => {';
replaceOnce('handler signature', handlerMarker, '    const handleHostMessage = async (message: string, responseSocket: any = clientRef.current) => {');

replaceOnce(
  'chunk ack',
  "          if (index % TRANSFER_BATCH_SIZE === 0 || index === buffer.chunks.length - 1) {\n            const percent",
  "          if ((index + 1) % TRANSFER_ACK_EVERY_CHUNKS === 0 || index === buffer.chunks.length - 1) {\n            if (responseSocket) {\n              writeSocket(responseSocket, `TRANSFER_ACK|${trackId}|${index}`);\n            }\n          }\n\n          if (index % TRANSFER_BATCH_SIZE === 0 || index === buffer.chunks.length - 1) {\n            const percent",
);

const clientMarker = "    const client = TcpSocket.createConnection(\n      {host: ipToUse, port: TCP_PORT},";
if (!source.includes(clientMarker)) throw new Error('Patch failed: node connect marker');

const transferClientBlock = `    const transferClient = TcpSocket.createConnection(\n      {host: ipToUse, port: TRANSFER_PORT},\n      () => {\n        transferClientRef.current = transferClient;\n        addLog('Connected audio transfer channel');\n      },\n    );\n\n    transferClient.on('data', data => {\n      (transferClient as unknown as PartySocketBuffer)._partyBuffer = \`${'${'}(transferClient as unknown as PartySocketBuffer)._partyBuffer || ''}${'${'}data.toString()}\`;\n      const lines = ((transferClient as unknown as PartySocketBuffer)._partyBuffer || '').split('\\n');\n      (transferClient as unknown as PartySocketBuffer)._partyBuffer = lines.pop() || '';\n\n      lines.forEach((message: string) => {\n        if (message.trim()) {\n          handleHostMessage(message, transferClient);\n        }\n      });\n    });\n\n    transferClient.on('error', error => {\n      addLog(\`Transfer connection error: ${'${'}String(error)}\`);\n      transferClientRef.current = null;\n    });\n\n    transferClient.on('close', () => {\n      transferClientRef.current = null;\n    });\n\n`;

// Insert the transfer connection after handleHostMessage is defined, immediately
// before the normal control socket starts consuming data.
const controlDataMarker = "    client.on('data', data => {";
if (!source.includes(controlDataMarker)) throw new Error('Patch failed: control data marker');
source = source.replace(controlDataMarker, transferClientBlock + controlDataMarker);

replaceOnce(
  'disconnect transfer client',
  `  const disconnectFromHost = () => {\n    if (clientRef.current) {`,
  `  const disconnectFromHost = () => {\n    if (transferClientRef.current) {\n      transferClientRef.current.destroy();\n      transferClientRef.current = null;\n    }\n\n    if (clientRef.current) {`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker dual-channel transfer patch applied.');
