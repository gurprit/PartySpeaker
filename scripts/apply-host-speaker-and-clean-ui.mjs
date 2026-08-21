import fs from 'node:fs';

const appFile = 'App.tsx';
const nativeFile = 'android/app/src/main/java/com/partyspeaker/PartyAudioModule.kt';
let app = fs.readFileSync(appFile, 'utf8');
let native = fs.readFileSync(nativeFile, 'utf8');

const replaceOnce = (source, label, before, after) => {
  if (!source.includes(before)) throw new Error(`Patch failed: ${label}`);
  return source.replace(before, after);
};

// Host joins the same scheduled playback event as the speaker nodes.
app = replaceOnce(
  app,
  'schedule host playback',
  `    nowPlayingRef.current = {\n      trackId: selected.id,\n      trackName: selected.name,\n      startedAtHostMs: targetTimeMs,\n    };\n    setNowPlayingTrackId(selected.id);`,
  `    nowPlayingRef.current = {\n      trackId: selected.id,\n      trackName: selected.name,\n      startedAtHostMs: targetTimeMs,\n    };\n\n    // The host is a speaker too. Prepare its source URI now, but do not let\n    // audio start until the exact same wall-clock target sent to the nodes.\n    // This mirrors node prewarming and avoids decoder startup skew.\n    PartyAudio.prepareAudioUriAt(selected.uri, targetTimeMs)\n      .then(() => {\n        addLog(\`Host joined synchronized playback: ${'${'}selected.name}\`);\n      })\n      .catch((error: unknown) => {\n        addLog(\`Host synchronized playback error: ${'${'}String(error)}\`);\n      });\n\n    setNowPlayingTrackId(selected.id);`,
);

// Remove the host debug-tools button/panel from the production-facing UI.
app = replaceOnce(
  app,
  'hide host debug tools',
  `\n          {renderDebugTools()}\n`,
  `\n`,
);

// Remove the node Developer Tools button and expandable panel while preserving
// the underlying diagnostics code for future development if we need it again.
app = replaceOnce(
  app,
  'hide node developer tools',
  `          <PartyButton\n            title={showNodeDebugTools ? 'Hide Developer Tools ▲' : 'Developer Tools ▼'}\n            onPress={() => setShowNodeDebugTools(previous => !previous)}\n            variant="secondary"\n            style={{width: '100%', marginTop: 22}}\n          />\n\n          {showNodeDebugTools ? (\n            <PartyCard style={{width: '100%', marginTop: 14}}>\n              <SectionLabel>Developer Tools</SectionLabel>\n\n              <NodeStatusPanel\n                styles={styles}\n                status={status}\n                nowPlayingText={nowPlayingText}\n                playbackPositionText={playbackPositionText}\n                hostClockOffsetMs={hostClockOffsetMs}\n                nodePlaybackDelayMs={nodePlaybackDelayMs}\n                subnetPrefix={subnetPrefix}\n                lastMessage={lastMessage}\n              />\n\n              <NodeDelayCalibration\n                styles={styles}\n                nodePlaybackDelayMs={nodePlaybackDelayMs}\n                adjustNodeDelay={adjustNodeDelay}\n                resetNodeDelay={resetNodeDelay}\n              />\n\n              <Text style={styles.label}>Manual Host IP</Text>\n              <TextInput\n                style={styles.input}\n                placeholder="Host IP address"\n                placeholderTextColor="#666"\n                value={hostIp}\n                onChangeText={setHostIp}\n                autoCapitalize="none"\n                keyboardType="numbers-and-punctuation"\n              />\n\n              <TouchableOpacity\n                style={styles.secondaryButton}\n                onPress={() =>\n                  discoveredHost ? connectToHost(discoveredHost.ip) : connectToHost()\n                }>\n                <Text style={styles.secondaryButtonText}>Connect Using Manual IP</Text>\n              </TouchableOpacity>\n\n              <TouchableOpacity style={styles.secondaryButton} onPress={scanSubnetForHost}>\n                <Text style={styles.secondaryButtonText}>\n                  {isScanning ? 'Scanning...' : 'Fallback Scan'}\n                </Text>\n              </TouchableOpacity>\n\n              <TouchableOpacity style={styles.secondaryButton} onPress={sendAliveToHost}>\n                <Text style={styles.secondaryButtonText}>Send I'm Alive</Text>\n              </TouchableOpacity>\n\n              {renderLog()}\n            </PartyCard>\n          ) : null}\n\n`,
  ``,
);

// Native equivalent of prepareCachedTrackAt for the host's original content URI.
native = replaceOnce(
  native,
  'native host uri prewarm',
  `    private fun startPlaybackLevelEvents() {`,
  `    @ReactMethod\n    fun prepareAudioUriAt(\n        uriString: String,\n        localTargetTimeMs: Double,\n        promise: Promise\n    ) {\n        if (Looper.myLooper() != Looper.getMainLooper()) {\n            Handler(Looper.getMainLooper()).post {\n                prepareAudioUriAt(uriString, localTargetTimeMs, promise)\n            }\n            return\n        }\n\n        try {\n            stopCurrentPlayer()\n\n            val player = ExoPlayer.Builder(reactContext)\n                .setLooper(Looper.getMainLooper())\n                .build()\n            currentExoPlayer = player\n\n            val uri = Uri.parse(uriString)\n            player.setMediaItem(MediaItem.fromUri(uri))\n\n            var startScheduled = false\n            var promiseSettled = false\n\n            player.addListener(object : Player.Listener {\n                override fun onPlaybackStateChanged(playbackState: Int) {\n                    if (playbackState == Player.STATE_READY && !startScheduled) {\n                        startScheduled = true\n                        val remainingMs = (localTargetTimeMs - System.currentTimeMillis())\n                            .toLong()\n                            .coerceAtLeast(0L)\n\n                        Handler(Looper.getMainLooper()).postDelayed({\n                            if (currentExoPlayer === player) {\n                                player.play()\n                                startPlaybackLevelEvents()\n                                if (!promiseSettled) {\n                                    promiseSettled = true\n                                    promise.resolve(true)\n                                }\n                            } else if (!promiseSettled) {\n                                promiseSettled = true\n                                promise.reject(\n                                    "HOST_PREWARM_CANCELLED",\n                                    "Prepared host player was replaced before start"\n                                )\n                            }\n                        }, remainingMs)\n                    }\n\n                    if (playbackState == Player.STATE_ENDED) {\n                        player.release()\n                        if (currentExoPlayer === player) {\n                            currentExoPlayer = null\n                        }\n                    }\n                }\n            })\n\n            player.prepare()\n        } catch (error: Exception) {\n            promise.reject("PREPARE_AUDIO_URI_ERROR", error)\n        }\n    }\n\n    private fun startPlaybackLevelEvents() {`,
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(nativeFile, native);
console.log('PartySpeaker host speaker + clean UI patch applied.');
