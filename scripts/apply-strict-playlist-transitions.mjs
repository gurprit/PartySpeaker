import fs from 'node:fs';

const path = 'App.tsx';
let source = fs.readFileSync(path, 'utf8');

const alreadyPatched = source.includes('if (false && standbyReadyEverywhere) {');
if (alreadyPatched) {
  console.log('Strict playlist-transition patch already applied');
  process.exit(0);
}

const anchor = '    if (standbyReadyEverywhere) {';
if (!source.includes(anchor)) {
  throw new Error('Could not find standby fast-start anchor in App.tsx');
}

source = source.replace(
  anchor,
  `    // Reliability first: standby prewarming still prepares the next track early,\n    // but every actual playlist transition uses the same strict all-speaker\n    // readiness barrier as a cold start. Re-enable the standby fast path only\n    // after it independently proves identical start timing across devices.\n    if (false && standbyReadyEverywhere) {`,
);

fs.writeFileSync(path, source);
console.log('Applied strict playlist-transition sync patch to App.tsx');
