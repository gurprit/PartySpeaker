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

const fastCalibrationHelper = [
  "  const calibrateNodeClocksForPrewarmedTrack = async () => {",
  "    bestClockSampleRef.current = null;",
  "    const liveSockets = clientsRef.current.filter(isSocketUsable);",
  "    if (liveSockets.length === 0) return;",
  "",
  "    liveSockets.forEach(socket => writeSocket(socket, 'SYNC_RESET'));",
  "    await new Promise<void>(resolve => setTimeout(resolve, 50));",
  "",
  "    addLog(`Fast clock calibration: ${FAST_CLOCK_CALIBRATION_SAMPLES} samples`);",
  "",
  "    for (let sample = 0; sample < FAST_CLOCK_CALIBRATION_SAMPLES; sample += 1) {",
  "      const requestId = `fast-${Date.now()}-${sample}-${Math.random()}`;",
  "      liveSockets.forEach(socket => {",
  "        writeSocket(socket, `SYNC_REQUEST|${requestId}`);",
  "      });",
  "",
  "      if (sample < FAST_CLOCK_CALIBRATION_SAMPLES - 1) {",
  "        await new Promise<void>(resolve =>",
  "          setTimeout(resolve, FAST_CLOCK_CALIBRATION_SPACING_MS),",
  "        );",
  "      }",
  "    }",
  "",
  "    await new Promise<void>(resolve =>",
  "      setTimeout(resolve, FAST_CLOCK_CALIBRATION_SETTLE_MS),",
  "    );",
  "  };",
  "",
  "  const broadcastNowPlaying = () => {",
].join('\n');

replaceOnce(
  'fast calibration helper',
  "  const broadcastNowPlaying = () => {",
  fastCalibrationHelper,
);

replaceOnce(
  'standby fast calibration path',
  "      await calibrateNodeClocksBeforePlayback();\n      const targetTimeMs = Date.now() + 850;\n      const payload = {id: selected.id, name: selected.name, targetTimeMs};",
  "      await calibrateNodeClocksForPrewarmedTrack();\n      const targetTimeMs = Date.now() + FAST_STANDBY_START_RUNWAY_MS;\n      const payload = {id: selected.id, name: selected.name, targetTimeMs};",
);

fs.writeFileSync(file, source);
console.log('PartySpeaker fast standby calibration patch applied.');
