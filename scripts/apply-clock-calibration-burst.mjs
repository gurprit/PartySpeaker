import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'clock calibration constants',
  `const DRIFT_LOG_THRESHOLD_MS = 120;`,
  `const DRIFT_LOG_THRESHOLD_MS = 120;\nconst CLOCK_CALIBRATION_SAMPLES = 5;\nconst CLOCK_CALIBRATION_SPACING_MS = 90;\nconst CLOCK_CALIBRATION_SETTLE_MS = 650;`,
);

replaceOnce(
  'clock sample refs',
  `  const nodePlaybackDelayRef = useRef(0);`,
  `  const nodePlaybackDelayRef = useRef(0);\n  const bestClockSampleRef = useRef<{rttMs: number; offsetMs: number} | null>(null);`,
);

replaceOnce(
  'send time sync helper',
  `  const sendTimeSyncToNode = (socket: any) => {\n    writeSocket(socket, \`SYNC_TIME|${'${'}Date.now()}\`);\n  };`,
  `  const sendTimeSyncToNode = (socket: any) => {\n    writeSocket(socket, \`SYNC_TIME|${'${'}Date.now()}\`);\n  };\n\n  const calibrateNodeClocksBeforePlayback = async () => {\n    const liveSockets = clientsRef.current.filter(isSocketUsable);\n    if (liveSockets.length === 0) return;\n\n    addLog(\`Clock calibration burst: ${'${'}CLOCK_CALIBRATION_SAMPLES} samples\`);\n\n    for (let sample = 0; sample < CLOCK_CALIBRATION_SAMPLES; sample += 1) {\n      const requestId = \`${'${'}Date.now()}-${'${'}sample}-${'${'}Math.random()}\`;\n      liveSockets.forEach(socket => {\n        writeSocket(socket, \`SYNC_REQUEST|${'${'}requestId}\`);\n      });\n\n      if (sample < CLOCK_CALIBRATION_SAMPLES - 1) {\n        await new Promise<void>(resolve => setTimeout(resolve, CLOCK_CALIBRATION_SPACING_MS));\n      }\n    }\n\n    await new Promise<void>(resolve => setTimeout(resolve, CLOCK_CALIBRATION_SETTLE_MS));\n  };`,
);

replaceOnce(
  'host sync ping handler',
  `          if (message === \"I'M_ALIVE\") {\n            return;\n          }`,
  `          if (message === \"I'M_ALIVE\") {\n            return;\n          }\n\n          if (message.startsWith('SYNC_PING|')) {\n            const parts = message.split('|');\n            const requestId = parts[1];\n            const clientSentMs = Number(parts[2]);\n            if (requestId && Number.isFinite(clientSentMs)) {\n              const hostReceivedMs = Date.now();\n              const hostSentMs = Date.now();\n              writeSocket(\n                socket,\n                \`SYNC_PONG|${'${'}requestId}|${'${'}clientSentMs}|${'${'}hostReceivedMs}|${'${'}hostSentMs}\`,\n              );\n            }\n            return;\n          }`,
);

replaceOnce(
  'node sync request and pong handlers',
  `      if (message.startsWith('SYNC_TIME|')) {\n        const hostNow = Number(message.split('|')[1]);\n        if (!Number.isNaN(hostNow)) {\n          const offset = hostNow - Date.now();\n          hostClockOffsetRef.current = offset;\n          setHostClockOffsetMs(offset);\n          addLog(\`Clock sync offset: ${'${'}offset}ms\`);\n        }\n      }`,
  `      if (message.startsWith('SYNC_REQUEST|')) {\n        const requestId = message.split('|')[1];\n        if (requestId) {\n          writeSocket(client, \`SYNC_PING|${'${'}requestId}|${'${'}Date.now()}\`);\n        }\n        return;\n      }\n\n      if (message.startsWith('SYNC_PONG|')) {\n        const parts = message.split('|');\n        const clientSentMs = Number(parts[2]);\n        const hostReceivedMs = Number(parts[3]);\n        const hostSentMs = Number(parts[4]);\n        const clientReceivedMs = Date.now();\n\n        if ([clientSentMs, hostReceivedMs, hostSentMs].every(Number.isFinite)) {\n          const rttMs = Math.max(0, (clientReceivedMs - clientSentMs) - (hostSentMs - hostReceivedMs));\n          const offsetMs = Math.round(((hostReceivedMs - clientSentMs) + (hostSentMs - clientReceivedMs)) / 2);\n          const best = bestClockSampleRef.current;\n\n          if (!best || rttMs < best.rttMs) {\n            bestClockSampleRef.current = {rttMs, offsetMs};\n            hostClockOffsetRef.current = offsetMs;\n            setHostClockOffsetMs(offsetMs);\n            addLog(\`Clock calibrated: ${'${'}offsetMs}ms offset, ${'${'}rttMs}ms RTT\`);\n          }\n        }\n        return;\n      }\n\n      if (message.startsWith('SYNC_TIME|')) {\n        const hostNow = Number(message.split('|')[1]);\n        if (!Number.isNaN(hostNow) && !bestClockSampleRef.current) {\n          const offset = hostNow - Date.now();\n          hostClockOffsetRef.current = offset;\n          setHostClockOffsetMs(offset);\n          addLog(\`Clock sync offset: ${'${'}offset}ms\`);\n        }\n      }`,
);

replaceOnce(
  'calibrate before target time',
  `    const targetTimeMs = Date.now() + START_BUFFER_MS;`,
  `    await calibrateNodeClocksBeforePlayback();\n\n    const targetTimeMs = Date.now() + START_BUFFER_MS;`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker clock calibration burst patch applied.');
