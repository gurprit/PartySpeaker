import fs from 'node:fs';

const path = 'scripts/apply-native-transfer-v2.mjs';
let source = fs.readFileSync(path, 'utf8');

source = source
  .replaceAll('${safeTrackId}', '\\${safeTrackId}')
  .replaceAll('${safeFileName}', '\\${safeFileName}');

fs.writeFileSync(path, source);
console.log('Fixed Kotlin interpolation escaping in native transfer v2 patch.');
