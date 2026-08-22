import fs from 'node:fs';

const file = 'src/components/host/PlaylistPanel.tsx';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes('localStyles.trackMainRow')) {
  const startMarker = '                <Text style={[localStyles.trackIndex';
  const actionMarker = '                <View style={localStyles.rowActions}>';

  const start = source.indexOf(startMarker);
  const action = source.indexOf(actionMarker, start);

  if (start < 0 || action < 0) {
    throw new Error('Patch failed: could not locate playlist row content/actions');
  }

  const mainContent = source.slice(start, action);
  const wrappedMain =
    '                <View style={localStyles.trackMainRow}>\n' +
    mainContent
      .split('\n')
      .map(line => (line ? '  ' + line : line))
      .join('\n') +
    '                </View>\n\n';

  source = source.slice(0, start) + wrappedMain + source.slice(action);
}

source = source.replace(
  /  trackRow: \{[\s\S]*?\n  \},\n  trackRowSelected:/,
  [
    '  trackRow: {',
    '    minHeight: 104,',
    '    borderRadius: 18,',
    '    paddingHorizontal: 18,',
    '    paddingVertical: 14,',
    '    backgroundColor: partyTheme.card,',
    '    borderColor: partyTheme.border,',
    '    borderWidth: 1,',
    '    gap: 10,',
    '  },',
    '  trackMainRow: {',
    "    flexDirection: 'row',",
    "    alignItems: 'center',",
    '    gap: 14,',
    '  },',
    '  trackRowSelected:',
  ].join('\n'),
);

source = source.replace(
  /  rowActions: \{[\s\S]*?\n  \},/,
  [
    '  rowActions: {',
    "    flexDirection: 'row',",
    "    alignItems: 'center',",
    "    justifyContent: 'flex-end',",
    '    gap: 18,',
    '    paddingRight: 2,',
    '  },',
  ].join('\n'),
);

source = source.replace(/minWidth: 22,/g, 'minWidth: 30,');
source = source.replace(/minWidth: 24,/g, 'minWidth: 30,');

fs.writeFileSync(file, source);
console.log('PartySpeaker playlist action buttons moved to second row v2.');
