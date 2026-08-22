import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceValue = (name, value) => {
  const pattern = new RegExp(`const ${name} = \\d+;`);
  if (!pattern.test(source)) throw new Error(`Patch failed: ${name}`);
  source = source.replace(pattern, `const ${name} = ${value};`);
};

replaceValue('DRIFT_CHECK_INTERVAL_MS', 500);
replaceValue('DRIFT_INITIAL_CHECK_MS', 180);
replaceValue('DRIFT_HARD_RESYNC_MS', 60);
replaceValue('DRIFT_LOG_THRESHOLD_MS', 30);

if (!source.includes('const DRIFT_FIRST_PLAY_RESYNC_MS = 15;')) {
  const anchor = 'const DRIFT_LOG_THRESHOLD_MS = 30;';
  if (!source.includes(anchor)) throw new Error('Patch failed: first-play threshold anchor');
  source = source.replace(anchor, `${anchor}\nconst DRIFT_FIRST_PLAY_RESYNC_MS = 15;`);
}

if (!source.includes("thresholdMs = DRIFT_HARD_RESYNC_MS")) {
  const oldSig = "  const correctNodePlaybackDrift = async (label = 'periodic') => {";
  if (!source.includes(oldSig)) throw new Error('Patch failed: drift function signature');
  source = source.replace(
    oldSig,
    "  const correctNodePlaybackDrift = async (label = 'periodic', thresholdMs = DRIFT_HARD_RESYNC_MS) => {",
  );
}

source = source.replace(
  'if (Math.abs(driftMs) >= DRIFT_HARD_RESYNC_MS) {',
  'if (Math.abs(driftMs) >= thresholdMs) {',
);

const startMarker = '  const startNodeDriftMonitor = () => {';
const endMarker = '  const stopPlaybackUiClock = () => {';
const startIndex = source.indexOf(startMarker);
const endIndex = source.indexOf(endMarker, startIndex);
if (startIndex < 0 || endIndex < 0) throw new Error('Patch failed: drift monitor block');

const replacement = `  const startNodeDriftMonitor = () => {\n    stopNodeDriftMonitor();\n\n    [DRIFT_INITIAL_CHECK_MS, 420, 850, 1400].forEach((delayMs, index) => {\n      setTimeout(() => {\n        correctNodePlaybackDrift(\`startup-${index + 1}\`, DRIFT_FIRST_PLAY_RESYNC_MS);\n      }, delayMs);\n    });\n\n    nodeDriftTimerRef.current = setInterval(() => {\n      correctNodePlaybackDrift('periodic', DRIFT_HARD_RESYNC_MS);\n    }, DRIFT_CHECK_INTERVAL_MS);\n  };\n\n`;

source = source.slice(0, startIndex) + replacement + source.slice(endIndex);

fs.writeFileSync(file, source);
console.log('PartySpeaker strict post-start convergence v3 patch applied.');
