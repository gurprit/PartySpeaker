import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `      if (message.startsWith('PREPARE_TRACK|')) {\n        try {\n          const payload = JSON.parse(message.replace('PREPARE_TRACK|', ''));`;

if (!source.includes(oldBlock)) {
  throw new Error('Patch failed: PREPARE_TRACK handler anchor');
}

source = source.replace(
  oldBlock,
  `      if (message.startsWith('PREPARE_TRACK|')) {\n        let preparePayload: any = null;\n        try {\n          preparePayload = JSON.parse(message.replace('PREPARE_TRACK|', ''));\n          const payload = preparePayload;`,
);

const oldFailure = `          writeSocket(\n            clientRef.current || client,\n            \`TRACK_PREPARE_FAILED|${'${'}payload?.transactionId || 'unknown'}|${'${'}payload?.id || 'unknown'}|${'${'}detail}\`,\n          );`;

if (!source.includes(oldFailure)) {
  throw new Error('Patch failed: prepare failure payload references');
}

source = source.replace(
  oldFailure,
  `          writeSocket(\n            clientRef.current || client,\n            \`TRACK_PREPARE_FAILED|${'${'}preparePayload?.transactionId || 'unknown'}|${'${'}preparePayload?.id || 'unknown'}|${'${'}detail}\`,\n          );`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker prepare failure payload scope fix applied.');
