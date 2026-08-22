import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    'getNodeHostNowMs() < pending.targetTimeMs + 1500',
    'getNodeHostNowMs() < (pending?.targetTimeMs ?? 0) + 1500',
    'pending nullable guard',
  ],
  [
    'Math.abs(existingPending.targetTimeMs - payload.targetTimeMs) < 250',
    'Math.abs((existingPending?.targetTimeMs ?? 0) - payload.targetTimeMs) < 250',
    'existing pending nullable guard',
  ],
];

for (const [before, after, label] of replacements) {
  if (!source.includes(before)) {
    throw new Error(`Patch failed: ${label}`);
  }
  source = source.replace(before, after);
}

fs.writeFileSync(file, source);
console.log('PartySpeaker playback transaction null-check v3 applied.');
