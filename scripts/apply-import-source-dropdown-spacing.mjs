import fs from 'node:fs';

const panelPath = 'src/components/host/PlaylistPanel.tsx';
let source = fs.readFileSync(panelPath, 'utf8');
let replacements = 0;

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Could not find ${label}`);
  source = source.replace(from, to);
  replacements += 1;
};

replaceOnce(
  `          <TouchableOpacity\n            style={localStyles.sourceOption}\n            activeOpacity={0.76}\n            onPress={() => {\n              const menu = sourceMenu;\n              setSourceMenu(null);\n              if (menu === 'track') addTrack('drive');`,
  `          <TouchableOpacity\n            style={[localStyles.sourceOption, localStyles.sourceOptionLast]}\n            activeOpacity={0.76}\n            onPress={() => {\n              const menu = sourceMenu;\n              setSourceMenu(null);\n              if (menu === 'track') addTrack('drive');`,
  'Google Drive option style',
);

replaceOnce(
  `  sourceIcon: {\n    width: 34,`,
  `  sourceOptionLast: {\n    paddingBottom: 20,\n  },\n  sourceIcon: {\n    width: 34,`,
  'Google Drive bottom spacing style',
);

fs.writeFileSync(panelPath, source);
console.log(`Applied ${replacements} import dropdown spacing replacement(s)`);
