import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

// We only need clock calibration immediately before the synchronized start.
// Preparing/decoding the track does not depend on synchronized clocks, so doing
// a full calibration before the readiness barrier adds roughly a second of
// avoidable latency to every track change.
replaceOnce(
  'remove redundant pre-prepare calibration',
  `    await calibrateNodeClocksBeforePlayback();\n\n    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
  `    const liveSockets = clientsRef.current.filter(isSocketUsable);`,
);

// Once every node and the host have already reached STATE_READY, we only need a
// modest runway for the final START_PRIMED_AT message to arrive and be queued.
// Keep enough margin for the older Moto while cutting the previous 1.5s delay.
replaceOnce(
  'shorter synchronized start runway',
  `    const targetTimeMs = Date.now() + 1500;`,
  `    const targetTimeMs = Date.now() + 850;`,
);

source = source.replace(
  `    // common start point. The 1.5s runway is only scheduling time now, not decode time.`,
  `    // common start point. The 850ms runway is scheduling time only; decode is already complete.`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker faster track-change patch applied.');
