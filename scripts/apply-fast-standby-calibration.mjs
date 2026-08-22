import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'fast standby constants',
  "const CLOCK_CALIBRATION_SETTLE_MS = 650;\n",
  "const CLOCK_CALIBRATION_SETTLE_MS = 650;\nconst FAST_CLOCK_CALIBRATION_SAMPLES = 3;\nconst FAST_CLOCK_CALIBRATION_SPACING_MS = 60;\nconst FAST_CLOCK_CALIBRATION_SETTLE_MS = 300;\nconst FAST_STANDBY_START_RUNWAY_MS = 600;\n",
);

replaceOnce(
  'fast calibration helper',
  "  const broadcastNowPlaying = () => {",
  `  const calibrateNodeClocksForPrewarmedTrack = async () => {\n    bestClockSampleRef.current = null;\n    const liveSockets = clientsRef.current.filter(isSocketUsable);\n    if (liveSockets.length === 0) return;\n\n    liveSockets.forEach(socket => writeSocket(socket, 'SYNC_RESET'));\n    await new Promise<void>(resolve => setTimeout(resolve, 50));\n\n    addLog(\`Fast clock calibration: \\${FAST_CLOCK_CALIBRATION_SAMPLES} samples\`);\n\n    for (let sample = 0; sample < FAST_CLOCK_CALIBRATION_SAMPLES; sample += 1) {\n      const requestId = \`fast-\\${Date.now()}-\\${sample}-\\${Math.random()}\`;\n      liveSockets.forEach(socket => {\n        writeSocket(socket, \`SYNC_REQUEST|\\${requestId}\`);\n      });\n\n      if (sample < FAST_CLOCK_CALIBRATION_SAMPLES - 1) {\n        await new Promise<void>(resolve =>\n          setTimeout(resolve, FAST_CLOCK_CALIBRATION_SPACING_MS),\n        );\n      }\n    }\n\n    await new Promise<void>(resolve =>\n      setTimeout(resolve, FAST_CLOCK_CALIBRATION_SETTLE_MS),\n    );\n  };\n\n  const broadcastNowPlaying = () => {`,
);

replaceOnce(
  'standby fast calibration path',
  "      await calibrateNodeClocksBeforePlayback();\n      const targetTimeMs = Date.now() + 850;\n      const payload = {id: selected.id, name: selected.name, targetTimeMs};",
  "      await calibrateNodeClocksForPrewarmedTrack();\n      const targetTimeMs = Date.now() + FAST_STANDBY_START_RUNWAY_MS;\n      const payload = {id: selected.id, name: selected.name, targetTimeMs};",
);

fs.writeFileSync(file, source);
console.log('PartySpeaker fast standby calibration patch applied.');
