import fs from 'node:fs';

const file = 'src/components/host/PlaylistPanel.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'image import',
  `  StyleSheet,\n  Text,`,
  `  Image,\n  StyleSheet,\n  Text,`,
);

replaceOnce(
  'track metadata type',
  `type Track = {\n  id: string;\n  name: string;\n  uri: string;\n};`,
  `type Track = {\n  id: string;\n  name: string;\n  uri: string;\n  metadata?: TrackMetadata;\n};`,
);

replaceOnce(
  'playlist artwork block',
  `                <View style={localStyles.trackArtworkMini}>\n                  <Text style={[localStyles.trackArtworkText, selected ? localStyles.trackArtworkTextSelected : null]}>\n                    {track.name.trim()[0]?.toUpperCase() || '♪'}\n                  </Text>\n                </View>`,
  `                <View style={localStyles.trackArtworkMini}>\n                  {track.metadata?.artworkUri ? (\n                    <Image\n                      source={{uri: track.metadata.artworkUri}}\n                      style={localStyles.trackArtworkImage}\n                      resizeMode="cover"\n                    />\n                  ) : (\n                    <Text style={[localStyles.trackArtworkText, selected ? localStyles.trackArtworkTextSelected : null]}>\n                      {track.name.trim()[0]?.toUpperCase() || '♪'}\n                    </Text>\n                  )}\n                </View>`,
);

replaceOnce(
  'artwork image style',
  `  trackArtworkText: {\n    color: partyTheme.white,`,
  `  trackArtworkImage: {\n    width: '100%',\n    height: '100%',\n    borderRadius: 12,\n  },\n  trackArtworkText: {\n    color: partyTheme.white,`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker playlist album-art patch applied.');
