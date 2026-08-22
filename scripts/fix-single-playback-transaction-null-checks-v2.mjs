import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceRegex = (label, pattern, replacement) => {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Patch failed: ${label}`);
  source = next;
};

replaceRegex(
  'pending nullable guard',
  /const pending = pendingPlaybackRef\.current;\n\s*const pendingIsCurrent =\n\s*pending &&\n\s*pending\.trackId === payload\.trackId &&\n\s*getNodeHostNowMs\(\) < pending\.targetTimeMs \+ 1500;/,
  `const pending = pendingPlaybackRef.current;\n            const pendingIsCurrent = pending !== null &&\n              pending.trackId === payload.trackId &&\n              getNodeHostNowMs() < pending.targetTimeMs + 1500;`,
);

replaceRegex(
  'existing pending nullable guard',
  /const existingPending = pendingPlaybackRef\.current;\n\s*if \(\n\s*existingPending &&\n\s*existingPending\.trackId === payload\.id &&\n\s*Math\.abs\(existingPending\.targetTimeMs - payload\.targetTimeMs\) < 250\n\s*\) \{/,
  `const existingPending = pendingPlaybackRef.current;\n          if (\n            existingPending !== null &&\n            existingPending.trackId === payload.id &&\n            Math.abs(existingPending.targetTimeMs - payload.targetTimeMs) < 250\n          ) {`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker playback transaction null-check v2 applied.');
