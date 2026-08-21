import fs from 'node:fs';

const appFile = 'App.tsx';
const panelFile = 'src/components/host/PlaylistPanel.tsx';

let app = fs.readFileSync(appFile, 'utf8');
let panel = fs.readFileSync(panelFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

app = replaceOnce(
  app,
  'preload queue refs',
  `  const transferAckRef = useRef<Record<string, number>>({});\n  const autoAdvancedTrackRef = useRef<string | null>(null);`,
  `  const transferAckRef = useRef<Record<string, number>>({});\n  const autoAdvancedTrackRef = useRef<string | null>(null);\n  const preloadQueueRef = useRef<Track[]>([]);\n  const preloadQueueRunningRef = useRef(false);`,
);

app = replaceOnce(
  app,
  'sequential playlist preload',
  `  const preloadPlaylistToNodes = (tracksSnapshot = playlistRef.current) => {\n    tracksSnapshot.forEach((track, index) => {\n      setTimeout(() => {\n        activeTransferIdsRef.current.delete(track.id);\n        transferSelectedTrackToNodes(track);\n      }, index * 350);\n    });\n  };`,
  `  const preloadPlaylistToNodes = (tracksSnapshot = playlistRef.current) => {\n    // Folder imports can contain dozens of songs. Queue them instead of firing\n    // every native download at once, which makes the phones and Wi-Fi fight over\n    // bandwidth and leaves progress states looking chaotic.\n    tracksSnapshot.forEach(track => {\n      const alreadyQueued = preloadQueueRef.current.some(item => item.id === track.id);\n      if (!alreadyQueued && !isTrackCachedOnAllNodes(track.id)) {\n        preloadQueueRef.current.push(track);\n      }\n    });\n\n    if (preloadQueueRunningRef.current) return;\n    preloadQueueRunningRef.current = true;\n\n    const runQueue = async () => {\n      try {\n        while (preloadQueueRef.current.length > 0) {\n          const track = preloadQueueRef.current.shift();\n          if (!track || isTrackCachedOnAllNodes(track.id)) continue;\n\n          addLog(\`Queue upload starting: ${'${'}track.name}\`);\n          activeTransferIdsRef.current.delete(track.id);\n          await transferSelectedTrackToNodes(track);\n\n          try {\n            await waitForTrackCachedOnAllNodes(track);\n            addLog(\`Queue upload complete: ${'${'}track.name}\`);\n          } catch (error) {\n            addLog(\`Queue upload timed out/skipped: ${'${'}track.name} (${ '${'}String(error)})\`);\n          }\n        }\n      } finally {\n        preloadQueueRunningRef.current = false;\n\n        // A reconnect or another folder import may have appended work while the\n        // previous item was finishing. Pick it up automatically.\n        if (preloadQueueRef.current.length > 0) {\n          preloadPlaylistToNodes([]);\n        }\n      }\n    };\n\n    runQueue();\n  };`,
);

panel = replaceOnce(
  panel,
  'split add controls from remove',
  `      <View style={localStyles.actionsRow}>\n        <PartyButton\n          title="＋ Add"\n          onPress={addTrack}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n\n        <PartyButton\n          title="▣ Folder"\n          onPress={addFolder}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n\n        <PartyButton\n          title="⌫ Remove"\n          onPress={removeSelectedTrack}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n      </View>`,
  `      <View style={localStyles.actionsRow}>\n        <PartyButton\n          title="＋ Add File"\n          onPress={addTrack}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n\n        <PartyButton\n          title="▣ Add Folder"\n          onPress={addFolder}\n          variant="secondary"\n          style={localStyles.actionButton}\n        />\n      </View>\n\n      <PartyButton\n        title="⌫ Remove Selected"\n        onPress={removeSelectedTrack}\n        variant="secondary"\n        style={localStyles.removeButton}\n      />`,
);

panel = replaceOnce(
  panel,
  'remove button style',
  `  actionButton: {\n    flex: 1,\n    minHeight: 72,\n  },`,
  `  actionButton: {\n    flex: 1,\n    minHeight: 72,\n  },\n  removeButton: {\n    width: '100%',\n    minHeight: 64,\n  },`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(panelFile, panel);
console.log('PartySpeaker folder import queue + add-button layout patch applied.');
