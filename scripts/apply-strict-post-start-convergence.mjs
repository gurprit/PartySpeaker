import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceRegex = (label, pattern, after) => {
  const next = source.replace(pattern, after);
  if (next === source) throw new Error(`Patch failed: ${label}`);
  source = next;
};

replaceRegex(
  'drift thresholds',
  /const DRIFT_CHECK_INTERVAL_MS = 750;\r?\nconst DRIFT_INITIAL_CHECK_MS = 450;\r?\nconst DRIFT_HARD_RESYNC_MS = 250;\r?\nconst DRIFT_LOG_THRESHOLD_MS = 120;/,
  `const DRIFT_CHECK_INTERVAL_MS = 500;\nconst DRIFT_INITIAL_CHECK_MS = 180;\nconst DRIFT_HARD_RESYNC_MS = 60;\nconst DRIFT_LOG_THRESHOLD_MS = 30;\nconst DRIFT_FIRST_PLAY_RESYNC_MS = 15;`,
);

replaceRegex(
  'drift correct signature',
  /  const correctNodePlaybackDrift = async \(label = 'periodic'\) => \{/,
  `  const correctNodePlaybackDrift = async (label = 'periodic', thresholdMs = DRIFT_HARD_RESYNC_MS) => {`,
);

replaceRegex(
  'drift threshold use',
  /      if \(Math\.abs\(driftMs\) >= DRIFT_HARD_RESYNC_MS\) \{\r?\n        await PartyAudio\.seekCurrentPlayback\(expectedPosition\);\r?\n        addLog\(`Playback resynced \(\$\{label\}\) by \$\{Math\.round\(-driftMs\)\}ms`\);\r?\n      \}/,
  `      if (Math.abs(driftMs) >= thresholdMs) {\n        await PartyAudio.seekCurrentPlayback(expectedPosition);\n        addLog(\`Playback resynced (${label}) by ${Math.round(-driftMs)}ms\`);\n      }`,
);

replaceRegex(
  'startup convergence schedule',
  /  const startNodeDriftMonitor = \(\) => \{[\s\S]*?\r?\n  \};\r?\n\r?\n  const stopPlaybackUiClock/,
  `  const startNodeDriftMonitor = () => {\n    stopNodeDriftMonitor();\n\n    // A shared wall-clock start is not enough on Android: each device's audio\n    // pipeline can begin presenting samples a little early/late. Force several\n    // very tight position convergences during the first second, then relax into\n    // the normal drift monitor.\n    [DRIFT_INITIAL_CHECK_MS, 420, 850, 1400].forEach((delayMs, index) => {\n      setTimeout(() => {\n        correctNodePlaybackDrift(\`startup-${index + 1}\`, DRIFT_FIRST_PLAY_RESYNC_MS);\n      }, delayMs);\n    });\n\n    nodeDriftTimerRef.current = setInterval(() => {\n      correctNodePlaybackDrift('periodic', DRIFT_HARD_RESYNC_MS);\n    }, DRIFT_CHECK_INTERVAL_MS);\n  };\n\n  const stopPlaybackUiClock`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker strict post-start convergence patch applied.');
