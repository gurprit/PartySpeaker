import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOrVerify = (label, oldPattern, newText, verifyPattern) => {
  if (verifyPattern.test(source)) return;
  const next = source.replace(oldPattern, newText);
  if (next === source) throw new Error(`Patch failed: ${label}`);
  source = next;
};

replaceOrVerify(
  'drift thresholds',
  /const DRIFT_CHECK_INTERVAL_MS = \d+;\r?\nconst DRIFT_INITIAL_CHECK_MS = \d+;\r?\nconst DRIFT_HARD_RESYNC_MS = \d+;\r?\nconst DRIFT_LOG_THRESHOLD_MS = \d+;/,
  `const DRIFT_CHECK_INTERVAL_MS = 500;\nconst DRIFT_INITIAL_CHECK_MS = 180;\nconst DRIFT_HARD_RESYNC_MS = 60;\nconst DRIFT_LOG_THRESHOLD_MS = 30;\nconst DRIFT_FIRST_PLAY_RESYNC_MS = 15;`,
  /const DRIFT_FIRST_PLAY_RESYNC_MS = 15;/,
);

replaceOrVerify(
  'drift correct signature',
  /  const correctNodePlaybackDrift = async \(label = 'periodic'\) => \{/,
  `  const correctNodePlaybackDrift = async (label = 'periodic', thresholdMs = DRIFT_HARD_RESYNC_MS) => {`,
  /correctNodePlaybackDrift = async \(label = 'periodic', thresholdMs = DRIFT_HARD_RESYNC_MS\)/,
);

replaceOrVerify(
  'drift threshold use',
  /      if \(Math\.abs\(driftMs\) >= DRIFT_HARD_RESYNC_MS\) \{\r?\n        await PartyAudio\.seekCurrentPlayback\(expectedPosition\);\r?\n        addLog\(`Playback resynced \(\$\{label\}\) by \$\{Math\.round\(-driftMs\)\}ms`\);\r?\n      \}/,
  `      if (Math.abs(driftMs) >= thresholdMs) {\n        await PartyAudio.seekCurrentPlayback(expectedPosition);\n        addLog(\`Playback resynced (${label}) by ${Math.round(-driftMs)}ms\`);\n      }`,
  /Math\.abs\(driftMs\) >= thresholdMs/,
);

if (!source.includes("correctNodePlaybackDrift(`startup-${index + 1}`")) {
  const startIndex = source.indexOf('  const startNodeDriftMonitor = () => {');
  const endMarker = '\n\n  const stopPlaybackUiClock';
  const endIndex = source.indexOf(endMarker, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error('Patch failed: startup convergence schedule');

  const replacement = `  const startNodeDriftMonitor = () => {\n    stopNodeDriftMonitor();\n\n    [DRIFT_INITIAL_CHECK_MS, 420, 850, 1400].forEach((delayMs, index) => {\n      setTimeout(() => {\n        correctNodePlaybackDrift(\`startup-${index + 1}\`, DRIFT_FIRST_PLAY_RESYNC_MS);\n      }, delayMs);\n    });\n\n    nodeDriftTimerRef.current = setInterval(() => {\n      correctNodePlaybackDrift('periodic', DRIFT_HARD_RESYNC_MS);\n    }, DRIFT_CHECK_INTERVAL_MS);\n  };`;

  source = source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

fs.writeFileSync(file, source);
console.log('PartySpeaker strict post-start convergence v2 patch applied.');
