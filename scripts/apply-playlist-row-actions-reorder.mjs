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
  'remove selected function',
  `  const removeSelectedTrack = () => {\n    const selected = getSelectedTrack();\n\n    if (!selected) {\n      addLog('No selected track to remove');\n      return;\n    }\n\n    const nextPlaylist = playlist.filter(track => track.id !== selected.id);\n    setPlaylist(nextPlaylist);\n\n    if (nextPlaylist.length > 0) {\n      setSelectedTrackId(nextPlaylist[0].id);\n      setCurrentTrackName(nextPlaylist[0].name);\n      setPlaybackState('idle');\n    } else {\n      setSelectedTrackId(null);\n      setCurrentTrackName('None');\n      setPlaybackState('idle');\n    }\n\n    addLog(\`Removed track: ${'${'}selected.name}\`);\n    setTrackTransferStatus(previous => {\n      const updated = {...previous};\n      delete updated[selected.id];\n      return updated;\n    });\n    setTimeout(() => {\n      syncPlaylistSnapshotToNodes(nextPlaylist, nextPlaylist[0]?.id || null);\n    }, 100);\n  };`,
  `  const removeTrackById = (trackId: string) => {\n    const currentPlaylist = playlistRef.current;\n    const removed = currentPlaylist.find(track => track.id === trackId);\n    if (!removed) return;\n\n    const nextPlaylist = currentPlaylist.filter(track => track.id !== trackId);\n    playlistRef.current = nextPlaylist;\n    setPlaylist(nextPlaylist);\n\n    let nextSelectedId = selectedTrackIdRef.current;\n    if (nextSelectedId === trackId) {\n      const removedIndex = currentPlaylist.findIndex(track => track.id === trackId);\n      const replacement = nextPlaylist[Math.min(removedIndex, Math.max(0, nextPlaylist.length - 1))] || null;\n      nextSelectedId = replacement?.id || null;\n      selectedTrackIdRef.current = nextSelectedId;\n      setSelectedTrackId(nextSelectedId);\n      setCurrentTrackName(replacement?.name || 'None');\n      if (nowPlayingTrackId !== trackId) setPlaybackState('idle');\n    }\n\n    setTrackTransferStatus(previous => {\n      const updated = {...previous};\n      delete updated[trackId];\n      return updated;\n    });\n\n    addLog(\`Removed track: ${'${'}removed.name}\`);\n    syncPlaylistSnapshotToNodes(nextPlaylist, nextSelectedId);\n  };\n\n  const moveTrack = (trackId: string, direction: -1 | 1) => {\n    const currentPlaylist = [...playlistRef.current];\n    const index = currentPlaylist.findIndex(track => track.id === trackId);\n    if (index < 0) return;\n\n    const targetIndex = index + direction;\n    if (targetIndex < 0 || targetIndex >= currentPlaylist.length) return;\n\n    [currentPlaylist[index], currentPlaylist[targetIndex]] = [\n      currentPlaylist[targetIndex],\n      currentPlaylist[index],\n    ];\n\n    playlistRef.current = currentPlaylist;\n    setPlaylist(currentPlaylist);\n    syncPlaylistSnapshotToNodes(currentPlaylist, selectedTrackIdRef.current);\n    addLog(\`Moved track ${'${'}direction < 0 ? 'up' : 'down'}: ${'${'}currentPlaylist[targetIndex].name}\`);\n  };`,
);

// PlaylistPanel props wired from App. Keep the old prop name slot but replace it with row actions.
app = app.replace(/removeSelectedTrack=\{removeSelectedTrack\}/g, 'removeTrackById={removeTrackById}\n          moveTrack={moveTrack}');

panel = replaceOnce(panel, 'props remove selected', '  removeSelectedTrack: () => void;\n', '  removeTrackById: (trackId: string) => void;\n  moveTrack: (trackId: string, direction: -1 | 1) => void;\n');
panel = replaceOnce(panel, 'destructure remove selected', '  removeSelectedTrack,\n', '  removeTrackById,\n  moveTrack,\n');

panel = replaceOnce(
  panel,
  'row more icon',
  `                <Text style={[localStyles.moreIcon, selected ? localStyles.moreIconSelected : null]}>⋮</Text>`,
  `                <View style={localStyles.rowActions}>\n                  <TouchableOpacity\n                    activeOpacity={0.7}\n                    disabled={index === 0}\n                    onPress={event => {\n                      event.stopPropagation();\n                      moveTrack(track.id, -1);\n                    }}>\n                    <Text style={[localStyles.rowActionIcon, index === 0 ? localStyles.rowActionDisabled : null, selected ? localStyles.rowActionSelected : null]}>↑</Text>\n                  </TouchableOpacity>\n\n                  <TouchableOpacity\n                    activeOpacity={0.7}\n                    disabled={index === playlist.length - 1}\n                    onPress={event => {\n                      event.stopPropagation();\n                      moveTrack(track.id, 1);\n                    }}>\n                    <Text style={[localStyles.rowActionIcon, index === playlist.length - 1 ? localStyles.rowActionDisabled : null, selected ? localStyles.rowActionSelected : null]}>↓</Text>\n                  </TouchableOpacity>\n\n                  <TouchableOpacity\n                    activeOpacity={0.7}\n                    onPress={event => {\n                      event.stopPropagation();\n                      removeTrackById(track.id);\n                    }}>\n                    <Text style={[localStyles.binIcon, selected ? localStyles.rowActionSelected : null]}>⌫</Text>\n                  </TouchableOpacity>\n                </View>`,
);

panel = panel.replace('title="＋ Add File"', 'title="＋ Track"');
panel = panel.replace('title="▣ Add Folder"', 'title="＋ Folder"');

panel = replaceOnce(
  panel,
  'remove selected button',
  `\n      <PartyButton\n        title="⌫ Remove Selected"\n        onPress={removeSelectedTrack}\n        variant="secondary"\n        style={localStyles.removeButton}\n      />\n`,
  '\n',
);

panel = replaceOnce(
  panel,
  'more icon styles',
  `  moreIcon: {\n    color: partyTheme.muted,\n    fontSize: 28,\n    fontWeight: '900',\n  },\n  moreIconSelected: {\n    color: 'rgba(0,0,0,0.55)',\n  },`,
  `  rowActions: {\n    flexDirection: 'row',\n    alignItems: 'center',\n    gap: 10,\n  },\n  rowActionIcon: {\n    color: partyTheme.muted,\n    fontSize: 22,\n    fontWeight: '900',\n    minWidth: 22,\n    textAlign: 'center',\n  },\n  binIcon: {\n    color: partyTheme.muted,\n    fontSize: 22,\n    fontWeight: '900',\n    minWidth: 24,\n    textAlign: 'center',\n  },\n  rowActionSelected: {\n    color: 'rgba(0,0,0,0.62)',\n  },\n  rowActionDisabled: {\n    opacity: 0.22,\n  },`,
);

panel = panel.replace(/\n  removeButton: \{[\s\S]*?\n  \},\n\}\);\n$/, '\n});\n');

fs.writeFileSync(appFile, app);
fs.writeFileSync(panelFile, panel);
console.log('PartySpeaker playlist row actions + reorder patch applied.');
