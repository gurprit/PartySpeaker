import fs from 'node:fs';

const file = 'src/components/host/PlaylistPanel.tsx';
let source = fs.readFileSync(file, 'utf8');

const before = `>⌫</Text>`;
const after = `>🗑</Text>`;

if (!source.includes(before)) {
  throw new Error('Patch failed: playlist delete icon');
}

source = source.replace(before, after);
fs.writeFileSync(file, source);
console.log('PartySpeaker playlist delete button changed to bin icon.');
