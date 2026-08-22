import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

// Reset the visible/state position immediately when a new playback clock is
// installed. Previously playbackPositionMs could retain the previous song's
// near-end value for up to 500ms, which was enough to retrigger auto-next.
replaceOnce(
  'reset playback position on new clock',
  `    setNowPlayingText(trackName);\n\n    playbackUiTimerRef.current = setInterval(() => {`,
  `    setNowPlayingText(trackName);\n    setPlaybackPositionMs(0);\n    setPlaybackPositionText('0:00');\n\n    playbackUiTimerRef.current = setInterval(() => {`,
);

// Auto-next must use the authoritative start timestamp for the CURRENT track,
// not playbackPositionMs inherited from whatever track just finished. The UI
// position remains in the dependency list simply as our periodic tick.
replaceOnce(
  'authoritative auto-next elapsed time',
  `    const current = playlistRef.current[currentIndex];\n    const durationMs = Number(current.metadata?.durationMs || 0);\n    if (!durationMs || playbackPositionMs < durationMs - 350) return;\n    if (autoAdvancedTrackRef.current === current.id) return;`,
  `    const current = playlistRef.current[currentIndex];\n    const durationMs = Number(current.metadata?.durationMs || 0);\n    if (!durationMs) return;\n\n    const activeNowPlaying = nowPlayingRef.current;\n    if (!activeNowPlaying || activeNowPlaying.trackId !== current.id) return;\n\n    // startedAtHostMs may still be in the future while the strict readiness\n    // transaction is completing. Never interpret the previous track's UI\n    // position as this track reaching its end.\n    const authoritativePositionMs = Math.max(0, Date.now() - activeNowPlaying.startedAtHostMs);\n    if (authoritativePositionMs < durationMs - 350) return;\n    if (autoAdvancedTrackRef.current === current.id) return;`,
);

// This reset is unnecessary and creates a short window where a freshly selected
// next track can be auto-advanced again using stale position state. Keeping the
// previous track id in the ref is safe: when the new track genuinely reaches its
// end its id differs and it can advance normally.
replaceOnce(
  'remove eager auto-advance reset',
  `  useEffect(() => {\n    if (nowPlayingTrackId) autoAdvancedTrackRef.current = null;\n  }, [nowPlayingTrackId]);\n\n`,
  ``,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker auto-next stale-position guard patch applied.');
