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

// Make the visual breathing room below the Drive subtitle match the space
// above the first Device row. 34px gives the bottom of the dropdown a
// deliberately balanced inset instead of hugging the subtitle.
if (source.includes(`  sourceOptionLast: {\n    paddingBottom: 20,\n  },`)) {
  source = source.replace(
    `  sourceOptionLast: {\n    paddingBottom: 20,\n  },`,
    `  sourceOptionLast: {\n    paddingBottom: 34,\n  },`,
  );
  replacements += 1;
} else {
  replaceOnce(
    `  sourceIcon: {\n    width: 34,`,
    `  sourceOptionLast: {\n    paddingBottom: 34,\n  },\n  sourceIcon: {\n    width: 34,`,
    'Google Drive bottom spacing style',
  );
}

fs.writeFileSync(panelPath, source);
console.log(`Applied ${replacements} import dropdown spacing replacement(s)`);
