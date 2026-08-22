import fs from 'node:fs';

const file = 'scripts/apply-standby-next-track-prewarm-v1.mjs';
let source = fs.readFileSync(file, 'utf8');

const beforeTrackId = '\\\\${safeTrackId}';
const afterTrackId = '\\${safeTrackId}';
const beforeFileName = '\\\\${safeFileName}';
const afterFileName = '\\${safeFileName}';

let changed = false;

if (source.includes(beforeTrackId)) {
  source = source.replaceAll(beforeTrackId, afterTrackId);
  changed = true;
}

if (source.includes(beforeFileName)) {
  source = source.replaceAll(beforeFileName, afterFileName);
  changed = true;
}

if (!changed) {
  console.log('Standby prewarm script escaping already fixed.');
} else {
  fs.writeFileSync(file, source);
  console.log('PartySpeaker standby prewarm v1 script escaping fixed.');
}
