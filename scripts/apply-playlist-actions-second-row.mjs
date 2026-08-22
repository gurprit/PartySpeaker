import fs from 'node:fs';

const file = 'src/components/host/PlaylistPanel.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'wrap main track content and move actions below',
  `                <Text style={[localStyles.trackIndex, selected ? localStyles.trackIndexSelected : null]}>{index + 1}</Text>\n\n                <View style={localStyles.trackArtworkMini}>\n                  {track.metadata?.artworkUri ? (\n                    <Image\n                      source={{uri: track.metadata.artworkUri}}\n                      style={localStyles.trackArtworkImage}\n                      resizeMode="cover"\n                    />\n                  ) : (\n                    <Text style={[localStyles.trackArtworkText, selected ? localStyles.trackArtworkTextSelected : null]}>\n                      {track.name.trim()[0]?.toUpperCase() || '♪'}\n                    </Text>\n                  )}\n                </View>\n\n                <View style={localStyles.trackTextWrap}>\n                  <Text style={[localStyles.trackTitle, selected ? localStyles.trackTitleSelected : null]} numberOfLines={1}>\n                    {track.name.replace(/\\.[^.]+$/, '')}\n                  </Text>\n\n                  <Text style={[localStyles.trackMeta, selected ? localStyles.trackMetaSelected : null]} numberOfLines={1}>\n                    {progress >= 100 ? 'Cached on speakers' : \\`Loading ${progress}%\\`}\n                  </Text>\n                </View>\n\n                <View style={localStyles.rowActions}>`,
  `                <View style={localStyles.trackMainRow}>\n                  <Text style={[localStyles.trackIndex, selected ? localStyles.trackIndexSelected : null]}>{index + 1}</Text>\n\n                  <View style={localStyles.trackArtworkMini}>\n                    {track.metadata?.artworkUri ? (\n                      <Image\n                        source={{uri: track.metadata.artworkUri}}\n                        style={localStyles.trackArtworkImage}\n                        resizeMode="cover"\n                      />\n                    ) : (\n                      <Text style={[localStyles.trackArtworkText, selected ? localStyles.trackArtworkTextSelected : null]}>\n                        {track.name.trim()[0]?.toUpperCase() || '♪'}\n                      </Text>\n                    )}\n                  </View>\n\n                  <View style={localStyles.trackTextWrap}>\n                    <Text style={[localStyles.trackTitle, selected ? localStyles.trackTitleSelected : null]} numberOfLines={1}>\n                      {track.name.replace(/\\.[^.]+$/, '')}\n                    </Text>\n\n                    <Text style={[localStyles.trackMeta, selected ? localStyles.trackMetaSelected : null]} numberOfLines={1}>\n                      {progress >= 100 ? 'Cached on speakers' : \\`Loading ${progress}%\\`}\n                    </Text>\n                  </View>\n                </View>\n\n                <View style={localStyles.rowActions}>`,
);

replaceOnce(
  'track row layout',
  `  trackRow: {\n    minHeight: 88,\n    borderRadius: 18,\n    paddingHorizontal: 18,\n    paddingVertical: 14,\n    backgroundColor: partyTheme.card,\n    borderColor: partyTheme.border,\n    borderWidth: 1,\n    flexDirection: 'row',\n    alignItems: 'center',\n    gap: 14,\n  },`,
  `  trackRow: {\n    minHeight: 104,\n    borderRadius: 18,\n    paddingHorizontal: 18,\n    paddingVertical: 14,\n    backgroundColor: partyTheme.card,\n    borderColor: partyTheme.border,\n    borderWidth: 1,\n    gap: 10,\n  },\n  trackMainRow: {\n    flexDirection: 'row',\n    alignItems: 'center',\n    gap: 14,\n  },`,
);

replaceOnce(
  'row actions layout',
  `  rowActions: {\n    flexDirection: 'row',\n    alignItems: 'center',\n    gap: 8,\n  },`,
  `  rowActions: {\n    flexDirection: 'row',\n    alignItems: 'center',\n    justifyContent: 'flex-end',\n    gap: 18,\n    paddingRight: 2,\n  },`,
);

source = source.replace(`    minWidth: 22,\n`, `    minWidth: 30,\n`);
source = source.replace(`    minWidth: 24,\n`, `    minWidth: 30,\n`);

fs.writeFileSync(file, source);
console.log('PartySpeaker playlist action buttons moved to second row.');
