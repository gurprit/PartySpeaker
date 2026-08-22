import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'restore standby calibration path',
  "      await calibrateNodeClocksForPrewarmedTrack();\n      const targetTimeMs = Date.now() + FAST_STANDBY_START_RUNWAY_MS;\n      const payload = {id: selected.id, name: selected.name, targetTimeMs};",
  "      await calibrateNodeClocksBeforePlayback();\n      const targetTimeMs = Date.now() + 850;\n      const payload = {id: selected.id, name: selected.name, targetTimeMs};",
);

fs.writeFileSync(file, source);
console.log('PartySpeaker strict standby sync restored.');
