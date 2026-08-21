import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'pending scheduled playback ref',
  `  const autoAdvancedTrackRef = useRef<string | null>(null);`,
  `  const autoAdvancedTrackRef = useRef<string | null>(null);\n  const pendingScheduledPlaybackRef = useRef<{trackId: string; targetTimeMs: number} | null>(null);`,
);

replaceOnce(
  'protect now playing catchup from replacing prewarm',
  `            const alreadyPlayingThisTrack =\n              currentlyPlayingTrackRef.current === payload.trackId;\n\n            if (!alreadyPlayingThisTrack) {\n              const hostNow = getNodeHostNowMs();\n              const positionMs = hostNow - payload.startedAtHostMs;\n\n              if (positionMs > 750) {\n                await playCachedTrackFromPosition(payload.trackId, payload.trackName, positionMs);\n              }\n            }`,
  `            const alreadyPlayingThisTrack =\n              currentlyPlayingTrackRef.current === payload.trackId;\n            const pending = pendingScheduledPlaybackRef.current;\n            const sameTrackStillScheduled =\n              pending?.trackId === payload.trackId &&\n              getNodeHostNowMs() < pending.targetTimeMs + 1500;\n\n            // NOW_PLAYING is a state heartbeat, not a second playback command.\n            // While a prewarmed start is pending, never let catch-up playback\n            // replace the prepared ExoPlayer instance.\n            if (!alreadyPlayingThisTrack && !sameTrackStillScheduled) {\n              const hostNow = getNodeHostNowMs();\n              const positionMs = hostNow - payload.startedAtHostMs;\n\n              if (positionMs > 750) {\n                await playCachedTrackFromPosition(payload.trackId, payload.trackName, positionMs);\n              }\n            }`,
);

replaceOnce(
  'dedupe scheduled play command',
  `          currentlyPlayingTrackRef.current = null;\n\n          nowPlayingRef.current = {`,
  `          const existingPending = pendingScheduledPlaybackRef.current;\n          if (\n            existingPending?.trackId === payload.id &&\n            Math.abs(existingPending.targetTimeMs - payload.targetTimeMs) < 250\n          ) {\n            addLog(\`Ignored duplicate scheduled playback: ${'${'}payload.name}\`);\n            return;\n          }\n\n          pendingScheduledPlaybackRef.current = {\n            trackId: payload.id,\n            targetTimeMs: payload.targetTimeMs,\n          };\n          currentlyPlayingTrackRef.current = null;\n\n          nowPlayingRef.current = {`,
);

replaceOnce(
  'clear pending after scheduled prewarm starts',
  `    PartyAudio.prepareCachedTrackAt(trackId, trackName, localTargetTimeMs)\n      .then(() => {\n        currentlyPlayingTrackRef.current = trackId;\n        startNodeDriftMonitor();`,
  `    PartyAudio.prepareCachedTrackAt(trackId, trackName, localTargetTimeMs)\n      .then(() => {\n        if (pendingScheduledPlaybackRef.current?.trackId === trackId) {\n          pendingScheduledPlaybackRef.current = null;\n        }\n        currentlyPlayingTrackRef.current = trackId;\n        startNodeDriftMonitor();`,
);

replaceOnce(
  'ignore cancelled prewarm popup',
  `      .catch((error: unknown) => {\n        addLog(\`Prewarmed scheduled track error: ${'${'}String(error)}\`);\n        Alert.alert('Scheduled playback error', String(error));\n      });`,
  `      .catch((error: unknown) => {\n        const detail = String(error);\n        if (pendingScheduledPlaybackRef.current?.trackId === trackId) {\n          pendingScheduledPlaybackRef.current = null;\n        }\n        addLog(\`Prewarmed scheduled track error: ${'${'}detail}\`);\n        if (!detail.includes('PREWARM_CANCELLED') && !detail.includes('Prepared player was replaced')) {\n          Alert.alert('Scheduled playback error', detail);\n        }\n      });`,
);

replaceOnce(
  'pause clears scheduled transaction',
  `        nowPlayingRef.current = null;\n        stopPlaybackUiClock();\n        setStatus('Paused');`,
  `        pendingScheduledPlaybackRef.current = null;\n        nowPlayingRef.current = null;\n        stopPlaybackUiClock();\n        setStatus('Paused');`,
);

replaceOnce(
  'catchup clears scheduled transaction',
  `  const playCachedTrackFromPosition = async (trackId: string, trackName: string, positionMs: number) => {\n    try {`,
  `  const playCachedTrackFromPosition = async (trackId: string, trackName: string, positionMs: number) => {\n    try {\n      pendingScheduledPlaybackRef.current = null;`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker single playback transaction patch applied.');
