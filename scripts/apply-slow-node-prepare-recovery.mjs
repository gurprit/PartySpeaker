import fs from 'node:fs';

const appFile = 'App.tsx';
const nativeFile = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';
let app = fs.readFileSync(appFile, 'utf8');
let native = fs.readFileSync(nativeFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

// Host: track prepare failures so slow/old devices can recover instead of
// remaining permanently stuck in the same transaction.
app = replaceOnce(
  app,
  'host prepare failure handler',
  `          if (message.startsWith('TRACK_PRIMED|')) {`,
  `          if (message.startsWith('TRACK_PREPARE_FAILED|')) {\n            const [, transactionId, trackId, ...detailParts] = message.split('|');\n            if (transactionId && trackId && strictPrepareTransactionRef.current === transactionId) {\n              const key = socket.remoteAddress || 'unknown';\n              const detail = detailParts.join('|') || 'unknown error';\n              addLog(\`Speaker prepare failed: ${'${'}key} • ${'${'}detail}\`);\n              setStatus(\`Retrying slow speaker: ${'${'}key}\`);\n            }\n            return;\n          }\n\n          if (message.startsWith('TRACK_PRIMED|')) {`,
);

// Give genuinely slow hardware more room, but keep retrying every 1.5s.
app = app.replace('const PREPARE_TIMEOUT_MS = 20000;', 'const PREPARE_TIMEOUT_MS = 45000;');

// Node: a failed prime MUST clear the in-flight transaction. Previously the
// transaction id stayed set, so every host retry was treated as a duplicate and
// the node could never recover, leaving the host at 2/3 forever.
app = replaceOnce(
  app,
  'node prepare failure recovery',
  `        } catch (error) {\n          nodePrimedTransactionRef.current = null;\n          addLog(\`Track prepare error: ${'${'}String(error)}\`);\n          setStatus('Could not prepare track');\n        }\n        return;\n      }`,
  `        } catch (error) {\n          nodePrepareTransactionRef.current = null;\n          nodePrimedTransactionRef.current = null;\n          pendingScheduledPlaybackRef.current = null;\n          const detail = String(error).replace(/\\|/g, '/');\n          writeSocket(\n            clientRef.current || client,\n            \`TRACK_PREPARE_FAILED|${'${'}payload?.transactionId || 'unknown'}|${'${'}payload?.id || 'unknown'}|${'${'}detail}\`,\n          );\n          addLog(\`Track prepare error: ${'${'}detail}\`);\n          setStatus('Prepare failed; waiting for retry');\n        }\n        return;\n      }`,
);

// Native: ExoPlayer errors during prime must reject the Promise. Without this,
// older hardware can sit forever waiting for STATE_READY and JS never gets a
// chance to clear/retry the transaction.
const cachedListener = `            player.addListener(object : Player.Listener {\n                override fun onPlaybackStateChanged(state: Int) {\n                    if (state == Player.STATE_READY && !settled) {\n                        settled = true\n                        promise.resolve(true)\n                    }\n                }\n            })\n            player.prepare()`;
const cachedListenerAfter = `            player.addListener(object : Player.Listener {\n                override fun onPlaybackStateChanged(state: Int) {\n                    if (state == Player.STATE_READY && !settled) {\n                        settled = true\n                        promise.resolve(true)\n                    }\n                }\n\n                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {\n                    if (!settled) {\n                        settled = true\n                        promise.reject("PRIME_CACHED_TRACK_PLAYER_ERROR", error.message, error)\n                    }\n                }\n            })\n\n            Handler(Looper.getMainLooper()).postDelayed({\n                if (!settled && currentExoPlayer === player) {\n                    settled = true\n                    promise.reject("PRIME_CACHED_TRACK_TIMEOUT", "Player did not become ready within 15000ms")\n                }\n            }, 15000L)\n\n            player.prepare()`;

if (!native.includes('PRIME_CACHED_TRACK_TIMEOUT')) {
  native = replaceOnce(native, 'native cached prime error/timeout', cachedListener, cachedListenerAfter);
}

fs.writeFileSync(appFile, app);
fs.writeFileSync(nativeFile, native);
console.log('PartySpeaker slow-node prepare recovery patch applied.');
