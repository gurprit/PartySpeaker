import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'pending nullable guard',
  `          const pending = pendingPlaybackRef.current;\n          const pendingSameTrack =\n            pending?.trackId === payload.trackId &&\n            getNodeHostNowMs() < pending.targetTimeMs + 1500;`,
  `          const pending = pendingPlaybackRef.current;\n          const pendingSameTrack =\n            pending !== null &&\n            pending.trackId === payload.trackId &&\n            getNodeHostNowMs() < pending.targetTimeMs + 1500;`,
);

replaceOnce(
  'existing pending nullable guard',
  `          const existingPending = pendingPlaybackRef.current;\n          if (\n            existingPending?.trackId === payload.id &&\n            Math.abs(existingPending.targetTimeMs - payload.targetTimeMs) < 250\n          ) {`,
  `          const existingPending = pendingPlaybackRef.current;\n          if (\n            existingPending !== null &&\n            existingPending.trackId === payload.id &&\n            Math.abs(existingPending.targetTimeMs - payload.targetTimeMs) < 250\n          ) {`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker playback transaction null-check fix applied.');
