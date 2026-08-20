import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'sync constants',
  `const DRIFT_CHECK_INTERVAL_MS = 1500;\nconst DRIFT_HARD_RESYNC_MS = 350;\nconst DRIFT_LOG_THRESHOLD_MS = 150;`,
  `const DRIFT_CHECK_INTERVAL_MS = 750;\nconst DRIFT_INITIAL_CHECK_MS = 450;\nconst DRIFT_HARD_RESYNC_MS = 250;\nconst DRIFT_LOG_THRESHOLD_MS = 120;`,
);

replaceOnce(
  'clock refs',
  `  const [nodePlaybackDelayMs, setNodePlaybackDelayMs] = useState(0);\n\n  const serverRef = useRef<any>(null);`,
  `  const [nodePlaybackDelayMs, setNodePlaybackDelayMs] = useState(0);\n  const hostClockOffsetRef = useRef(0);\n  const nodePlaybackDelayRef = useRef(0);\n\n  const serverRef = useRef<any>(null);`,
);

replaceOnce(
  'sync refs effects',
  `  useEffect(() => {\n    refreshHostAddress();\n  }, []);`,
  `  useEffect(() => {\n    refreshHostAddress();\n  }, []);\n\n  useEffect(() => {\n    hostClockOffsetRef.current = hostClockOffsetMs;\n  }, [hostClockOffsetMs]);\n\n  useEffect(() => {\n    nodePlaybackDelayRef.current = nodePlaybackDelayMs;\n  }, [nodePlaybackDelayMs]);`,
);

replaceOnce(
  'live clock refs',
  `  const getNodeHostNowMs = () => Date.now() + hostClockOffsetMs;\n\n  const getPlaybackDelayCompensationMs = () => {\n    return nodePlaybackDelayMs;\n  };`,
  `  const getNodeHostNowMs = () => Date.now() + hostClockOffsetRef.current;\n\n  const getPlaybackDelayCompensationMs = () => {\n    return nodePlaybackDelayRef.current;\n  };`,
);

replaceOnce(
  'drift monitor',
  `  const startNodeDriftMonitor = () => {\n    stopNodeDriftMonitor();\n\n    nodeDriftTimerRef.current = setInterval(async () => {\n      if (mode !== 'node' || appStateRef.current !== 'active') return;\n      if (!nowPlayingRef.current || !currentlyPlayingTrackRef.current) return;\n\n      try {\n        const actualPosition = Number(await PartyAudio.getCurrentPlaybackPosition());\n        if (!Number.isFinite(actualPosition) || actualPosition < 0) return;\n\n        const expectedPosition = Math.max(\n          0,\n          getNodeHostNowMs() - nowPlayingRef.current.startedAtHostMs + getPlaybackDelayCompensationMs(),\n        );\n        const driftMs = actualPosition - expectedPosition;\n\n        if (Math.abs(driftMs) >= DRIFT_LOG_THRESHOLD_MS) {\n          addLog(\`Playback drift: ${'${'}Math.round(driftMs)}ms\`);\n        }\n\n        if (Math.abs(driftMs) >= DRIFT_HARD_RESYNC_MS) {\n          await PartyAudio.seekCurrentPlayback(expectedPosition);\n          addLog(\`Playback resynced by ${'${'}Math.round(-driftMs)}ms\`);\n        }\n      } catch (error) {\n        addLog(\`Drift check skipped: ${'${'}String(error)}\`);\n      }\n    }, DRIFT_CHECK_INTERVAL_MS);\n  };`,
  `  const correctNodePlaybackDrift = async (label = 'periodic') => {\n    if (mode !== 'node' || appStateRef.current !== 'active') return;\n    if (!nowPlayingRef.current || !currentlyPlayingTrackRef.current) return;\n\n    try {\n      const actualPosition = Number(await PartyAudio.getCurrentPlaybackPosition());\n      if (!Number.isFinite(actualPosition) || actualPosition < 0) return;\n\n      const expectedPosition = Math.max(\n        0,\n        getNodeHostNowMs() - nowPlayingRef.current.startedAtHostMs + getPlaybackDelayCompensationMs(),\n      );\n      const driftMs = actualPosition - expectedPosition;\n\n      if (Math.abs(driftMs) >= DRIFT_LOG_THRESHOLD_MS) {\n        addLog(\`Playback drift (${ '${'}label}): ${'${'}Math.round(driftMs)}ms\`);\n      }\n\n      if (Math.abs(driftMs) >= DRIFT_HARD_RESYNC_MS) {\n        await PartyAudio.seekCurrentPlayback(expectedPosition);\n        addLog(\`Playback resynced (${ '${'}label}) by ${'${'}Math.round(-driftMs)}ms\`);\n      }\n    } catch (error) {\n      addLog(\`Drift check skipped: ${'${'}String(error)}\`);\n    }\n  };\n\n  const startNodeDriftMonitor = () => {\n    stopNodeDriftMonitor();\n\n    // The first correction happens quickly after ExoPlayer actually starts.\n    // This catches device-specific decoder/startup latency before it becomes audible drift.\n    setTimeout(() => {\n      correctNodePlaybackDrift('initial');\n    }, DRIFT_INITIAL_CHECK_MS);\n\n    nodeDriftTimerRef.current = setInterval(() => {\n      correctNodePlaybackDrift();\n    }, DRIFT_CHECK_INTERVAL_MS);\n  };`,
);

// SYNC_TIME may be handled inside the long-lived socket callback, so update the
// ref synchronously rather than waiting for a React re-render.
replaceOnce(
  'clock sync immediate ref',
  `          const offset = hostNow - Date.now();\n          setHostClockOffsetMs(offset);\n          addLog(\`Clock sync offset: ${'${'}offset}ms\`);`,
  `          const offset = hostNow - Date.now();\n          hostClockOffsetRef.current = offset;\n          setHostClockOffsetMs(offset);\n          addLog(\`Clock sync offset: ${'${'}offset}ms\`);`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker sync tuning v1 patch applied.');
