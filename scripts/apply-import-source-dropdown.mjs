import fs from 'node:fs';

const appPath = 'App.tsx';
const panelPath = 'src/components/host/PlaylistPanel.tsx';
let app = fs.readFileSync(appPath, 'utf8');
let panel = fs.readFileSync(panelPath, 'utf8');
let replacements = 0;

const replaceOnce = (target, from, to, label) => {
  if (target.value.includes(to)) return;
  if (!target.value.includes(from)) throw new Error(`Could not find ${label}`);
  target.value = target.value.replace(from, to);
  replacements += 1;
};

const appTarget = {value: app};
const panelTarget = {value: panel};

replaceOnce(
  appTarget,
  `  const addTrack = async () => {\n    try {\n      const result = await PartyAudio.pickAudioFile();`,
  `  const addTrack = async (source: 'device' | 'drive' = 'device') => {\n    try {\n      const result = source === 'drive'\n        ? await PartyAudio.pickDriveAudioFile()\n        : await PartyAudio.pickDeviceAudioFile();`,
  'App addTrack source picker',
);

replaceOnce(
  appTarget,
  `  const addFolder = async () => {\n    try {\n      const picked = await PartyAudio.pickAudioFolder();`,
  `  const addFolder = async (source: 'device' | 'drive' = 'device') => {\n    try {\n      const picked = source === 'drive'\n        ? await PartyAudio.pickDriveAudioFolder()\n        : await PartyAudio.pickDeviceAudioFolder();`,
  'App addFolder source picker',
);

replaceOnce(
  panelTarget,
  `  addTrack: () => void;\n  addFolder: () => void;`,
  `  addTrack: (source?: 'device' | 'drive') => void;\n  addFolder: (source?: 'device' | 'drive') => void;`,
  'PlaylistPanel source callback types',
);

replaceOnce(
  panelTarget,
  `  const [metadata, setMetadata] = React.useState<TrackMetadata>({`,
  `  const [sourceMenu, setSourceMenu] = React.useState<'track' | 'folder' | null>(null);\n\n  const [metadata, setMetadata] = React.useState<TrackMetadata>({`,
  'PlaylistPanel source menu state',
);

replaceOnce(
  panelTarget,
  `      <View style={localStyles.actionsRow}>\n        <PartyButton\n          title="＋ Track"\n          onPress={addTrack}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n\n        <PartyButton\n          title="＋ Folder"\n          onPress={addFolder}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n      </View>`,
  `      <View style={localStyles.actionsRow}>\n        <PartyButton\n          title="＋ Track"\n          onPress={() => setSourceMenu(previous => previous === 'track' ? null : 'track')}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n\n        <PartyButton\n          title="＋ Folder"\n          onPress={() => setSourceMenu(previous => previous === 'folder' ? null : 'folder')}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n      </View>\n\n      {sourceMenu ? (\n        <View style={localStyles.sourceDropdown}>\n          <TouchableOpacity\n            style={localStyles.sourceOption}\n            activeOpacity={0.76}\n            onPress={() => {\n              const menu = sourceMenu;\n              setSourceMenu(null);\n              if (menu === 'track') addTrack('device');\n              else addFolder('device');\n            }}>\n            <Text style={localStyles.sourceIcon}>{sourceMenu === 'track' ? '🎵' : '📁'}</Text>\n            <View style={localStyles.sourceCopy}>\n              <Text style={localStyles.sourceTitle}>\n                {sourceMenu === 'track' ? 'Device File' : 'Device Folder'}\n              </Text>\n              <Text style={localStyles.sourceSubtitle}>Choose music stored on this phone</Text>\n            </View>\n          </TouchableOpacity>\n\n          <View style={localStyles.sourceDivider} />\n\n          <TouchableOpacity\n            style={localStyles.sourceOption}\n            activeOpacity={0.76}\n            onPress={() => {\n              const menu = sourceMenu;\n              setSourceMenu(null);\n              if (menu === 'track') addTrack('drive');\n              else addFolder('drive');\n            }}>\n            <Text style={localStyles.sourceIcon}>☁️</Text>\n            <View style={localStyles.sourceCopy}>\n              <Text style={localStyles.sourceTitle}>Google Drive</Text>\n              <Text style={localStyles.sourceSubtitle}>Choose from your Drive music</Text>\n            </View>\n          </TouchableOpacity>\n        </View>\n      ) : null}`,
  'PlaylistPanel dropdown markup',
);

replaceOnce(
  panelTarget,
  `  actionButton: {\n    flex: 1,\n    minHeight: 72,\n  },`,
  `  actionButton: {\n    flex: 1,\n    minHeight: 72,\n  },\n  sourceDropdown: {\n    marginTop: -4,\n    borderRadius: 18,\n    backgroundColor: partyTheme.cardStrong,\n    borderColor: partyTheme.border,\n    borderWidth: 1,\n    overflow: 'hidden',\n  },\n  sourceOption: {\n    minHeight: 74,\n    paddingHorizontal: 18,\n    paddingVertical: 14,\n    flexDirection: 'row',\n    alignItems: 'center',\n    gap: 14,\n  },\n  sourceIcon: {\n    width: 34,\n    fontSize: 24,\n    textAlign: 'center',\n  },\n  sourceCopy: {\n    flex: 1,\n  },\n  sourceTitle: {\n    color: partyTheme.white,\n    fontSize: 17,\n    fontWeight: '900',\n  },\n  sourceSubtitle: {\n    color: partyTheme.muted,\n    fontSize: 13,\n    marginTop: 3,\n  },\n  sourceDivider: {\n    height: 1,\n    backgroundColor: partyTheme.border,\n    marginHorizontal: 18,\n  },`,
  'PlaylistPanel dropdown styles',
);

fs.writeFileSync(appPath, appTarget.value);
fs.writeFileSync(panelPath, panelTarget.value);
console.log(`Applied ${replacements} import source dropdown replacement(s)`);
