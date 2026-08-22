import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  'node prepare refs',
  `  const strictPrepareTransactionRef = useRef<string | null>(null);\n  const strictPreparedNodesRef = useRef<Set<string>>(new Set());`,
  `  const strictPrepareTransactionRef = useRef<string | null>(null);\n  const strictPreparedNodesRef = useRef<Set<string>>(new Set());\n  const nodePrepareTransactionRef = useRef<string | null>(null);\n  const nodePrimedTransactionRef = useRef<string | null>(null);`,
);

replaceOnce(
  'idempotent prepare handler',
  `      if (message.startsWith('PREPARE_TRACK|')) {\n        try {\n          const payload = JSON.parse(message.replace('PREPARE_TRACK|', ''));\n          if (!payload.id || !payload.name || !payload.transactionId) return;\n\n          pendingScheduledPlaybackRef.current = {trackId: payload.id, targetTimeMs: Number.MAX_SAFE_INTEGER};\n          currentlyPlayingTrackRef.current = null;\n          await PartyAudio.primeCachedTrack(payload.id, payload.name);\n\n          // Only acknowledge if this preparation is still the active one.\n          if (pendingScheduledPlaybackRef.current?.trackId === payload.id) {\n            writeSocket(clientRef.current || client, \`TRACK_PRIMED|${'${'}payload.transactionId}|${'${'}payload.id}\`);\n            setStatus(\`Ready to play: ${'${'}payload.name}\`);\n            addLog(\`Primed and waiting: ${'${'}payload.name}\`);\n          }\n        } catch (error) {\n          addLog(\`Track prepare error: ${'${'}String(error)}\`);\n          setStatus('Could not prepare track');\n        }\n        return;\n      }`,
  `      if (message.startsWith('PREPARE_TRACK|')) {\n        try {\n          const payload = JSON.parse(message.replace('PREPARE_TRACK|', ''));\n          if (!payload.id || !payload.name || !payload.transactionId) return;\n\n          // PREPARE_TRACK may be retried by the host if an acknowledgement is slow\n          // or lost. Never restart ExoPlayer for the same transaction: doing so\n          // repeatedly replaces the player while a slower phone is still decoding\n          // and can prevent that phone from ever reaching STATE_READY.\n          if (nodePrepareTransactionRef.current === payload.transactionId) {\n            if (nodePrimedTransactionRef.current === payload.transactionId) {\n              writeSocket(\n                clientRef.current || client,\n                \`TRACK_PRIMED|${'${'}payload.transactionId}|${'${'}payload.id}\`,\n              );\n              addLog(\`Re-sent ready acknowledgement: ${'${'}payload.name}\`);\n            } else {\n              addLog(\`Prepare already in progress: ${'${'}payload.name}\`);\n            }\n            return;\n          }\n\n          nodePrepareTransactionRef.current = payload.transactionId;\n          nodePrimedTransactionRef.current = null;\n          pendingScheduledPlaybackRef.current = {trackId: payload.id, targetTimeMs: Number.MAX_SAFE_INTEGER};\n          currentlyPlayingTrackRef.current = null;\n\n          await PartyAudio.primeCachedTrack(payload.id, payload.name);\n\n          // Ignore a late completion from an older preparation transaction.\n          if (nodePrepareTransactionRef.current !== payload.transactionId) {\n            addLog(\`Ignored stale prepare completion: ${'${'}payload.name}\`);\n            return;\n          }\n\n          if (pendingScheduledPlaybackRef.current?.trackId === payload.id) {\n            nodePrimedTransactionRef.current = payload.transactionId;\n            writeSocket(\n              clientRef.current || client,\n              \`TRACK_PRIMED|${'${'}payload.transactionId}|${'${'}payload.id}\`,\n            );\n            setStatus(\`Ready to play: ${'${'}payload.name}\`);\n            addLog(\`Primed and waiting: ${'${'}payload.name}\`);\n          }\n        } catch (error) {\n          nodePrimedTransactionRef.current = null;\n          addLog(\`Track prepare error: ${'${'}String(error)}\`);\n          setStatus('Could not prepare track');\n        }\n        return;\n      }`,
);

replaceOnce(
  'verify primed transaction before start',
  `      if (message.startsWith('START_PRIMED_AT|')) {\n        try {\n          const payload = JSON.parse(message.replace('START_PRIMED_AT|', ''));\n          if (!payload.id || !payload.name || !payload.targetTimeMs) return;`,
  `      if (message.startsWith('START_PRIMED_AT|')) {\n        try {\n          const payload = JSON.parse(message.replace('START_PRIMED_AT|', ''));\n          if (!payload.id || !payload.name || !payload.targetTimeMs) return;\n\n          if (payload.transactionId && nodePrimedTransactionRef.current !== payload.transactionId) {\n            addLog(\`Ignored start for unprimed transaction: ${'${'}payload.name}\`);\n            return;\n          }`,
);

replaceOnce(
  'clear node prepare refs after scheduled start',
  `          await PartyAudio.startPrimedTrackAt(localTargetTimeMs);\n          pendingScheduledPlaybackRef.current = null;\n          currentlyPlayingTrackRef.current = payload.id;`,
  `          await PartyAudio.startPrimedTrackAt(localTargetTimeMs);\n          pendingScheduledPlaybackRef.current = null;\n          nodePrepareTransactionRef.current = null;\n          nodePrimedTransactionRef.current = null;\n          currentlyPlayingTrackRef.current = payload.id;`,
);

fs.writeFileSync(file, source);
console.log('PartySpeaker idempotent prepare handshake patch applied.');
