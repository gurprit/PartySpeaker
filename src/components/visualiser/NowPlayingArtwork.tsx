import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Image,
  Modal,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNowPlayingDisplayMetadata} from './NowPlayingDisplayStore';

type Props = {
  title: string;
  artworkUri?: string;
  displayMode?: 'host' | 'node';
};

const {PartyAudio} = NativeModules;

function formatMs(ms: number) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function NowPlayingArtwork({
  title,
  artworkUri,
  displayMode = 'node',
}: Props) {
  const initial = title && title.trim().length > 0 ? title.trim()[0].toUpperCase() : '♪';
  const pulse = useRef(new Animated.Value(0)).current;
  const displayPulse = useRef(new Animated.Value(1)).current;
  const metadata = useNowPlayingDisplayMetadata();
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [displayVisible, setDisplayVisible] = useState(false);
  const [manuallyDismissed, setManuallyDismissed] = useState(false);

  useEffect(() => {
    pulse.setValue(0);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 3200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 3200,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulse, artworkUri, title]);

  useEffect(() => {
    setManuallyDismissed(false);
    setDisplayVisible(false);
  }, [title]);

  useEffect(() => {
    if (displayMode !== 'node') {
      setDisplayVisible(false);
      return;
    }

    let cancelled = false;

    const readPlaybackPosition = async () => {
      try {
        const position = Number(await PartyAudio?.getCurrentPlaybackPosition?.());
        if (cancelled || !Number.isFinite(position)) return;

        const safePosition = Math.max(0, position);
        setPlaybackPositionMs(safePosition);

        const phase = (Math.sin(safePosition / 620) + 1) / 2;
        Animated.timing(displayPulse, {
          toValue: 1 + phase * 0.025,
          duration: 300,
          useNativeDriver: true,
        }).start();

        if (safePosition > 250 && !manuallyDismissed) {
          setDisplayVisible(true);
        } else if (safePosition <= 100) {
          setDisplayVisible(false);
        }
      } catch {
        // Visual mode is deliberately best-effort and must never affect playback.
      }
    };

    readPlaybackPosition();
    const timer = setInterval(readPlaybackPosition, 400);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [displayMode, displayPulse, manuallyDismissed]);

  const artworkScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018],
  });

  const auraScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.08, 1.18],
  });

  const auraOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.42, 0.62],
  });

  const durationMs = Number(metadata.durationMs || 0);
  const progressPercent = durationMs > 0
    ? Math.max(0, Math.min(100, (playbackPositionMs / durationMs) * 100))
    : 0;

  const openDisplay = () => {
    if (displayMode !== 'node' || playbackPositionMs <= 0) return;
    setManuallyDismissed(false);
    setDisplayVisible(true);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={displayMode === 'node' ? 0.88 : 1}
        onPress={openDisplay}
        disabled={displayMode !== 'node'}>
        <View style={styles.stage}>
          {artworkUri ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.aura,
                  {
                    opacity: auraOpacity,
                    transform: [{scale: auraScale}],
                  },
                ]}>
                <Image
                  source={{uri: artworkUri}}
                  style={styles.auraImage}
                  resizeMode="cover"
                  blurRadius={32}
                />
              </Animated.View>

              <View pointerEvents="none" style={styles.auraShade} />

              <Animated.View
                style={[
                  styles.artwork,
                  styles.artworkWithImage,
                  {transform: [{scale: artworkScale}]},
                ]}>
                <Image
                  source={{uri: artworkUri}}
                  style={styles.image}
                  resizeMode="cover"
                />
              </Animated.View>
            </>
          ) : (
            <Animated.View
              style={[
                styles.artwork,
                styles.fallbackArtwork,
                {transform: [{scale: artworkScale}]},
              ]}>
              <View style={styles.fallbackHaloOuter}>
                <View style={styles.fallbackHaloInner}>
                  <Text style={styles.symbol}>{initial}</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {displayMode === 'node' && playbackPositionMs > 0 && manuallyDismissed ? (
            <View style={styles.displayHint} pointerEvents="none">
              <Text style={styles.displayHintText}>TAP FOR PARTY DISPLAY</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      {displayMode === 'node' ? (
        <Modal
          animationType="fade"
          visible={displayVisible}
          statusBarTranslucent
          onRequestClose={() => {
            setDisplayVisible(false);
            setManuallyDismissed(true);
          }}>
          <TouchableOpacity
            style={styles.fullscreen}
            activeOpacity={1}
            onPress={() => {
              setDisplayVisible(false);
              setManuallyDismissed(true);
            }}>
            {artworkUri ? (
              <Image
                source={{uri: artworkUri}}
                style={styles.fullscreenBackdrop}
                resizeMode="cover"
                blurRadius={48}
              />
            ) : null}

            <View style={styles.fullscreenShade} />

            <View style={styles.fullscreenTopRow}>
              <Text style={styles.speakerLabel}>PARTYSPEAKER · SPEAKER</Text>
              <View style={styles.syncedBadge}>
                <View style={styles.syncedDot} />
                <Text style={styles.syncedText}>SYNCED</Text>
              </View>
            </View>

            <View style={styles.fullscreenContent}>
              <Animated.View style={{transform: [{scale: displayPulse}]}}>
                {artworkUri ? (
                  <View style={styles.fullscreenArtwork}>
                    <Image
                      source={{uri: artworkUri}}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View style={[styles.fullscreenArtwork, styles.fullscreenFallback]}>
                    <Text style={styles.fullscreenSymbol}>{initial}</Text>
                  </View>
                )}
              </Animated.View>

              <Text style={styles.fullscreenTitle} numberOfLines={2}>
                {metadata.title || title || 'Unknown Track'}
              </Text>

              <Text style={styles.fullscreenArtist} numberOfLines={1}>
                {metadata.artist || 'Unknown Artist'}
              </Text>

              <View style={styles.fullscreenProgressRow}>
                <Text style={styles.fullscreenTime}>{formatMs(playbackPositionMs)}</Text>
                <View style={styles.fullscreenProgressOuter}>
                  <View
                    style={[
                      styles.fullscreenProgressInner,
                      {width: `${progressPercent}%`},
                    ]}
                  />
                </View>
                <Text style={styles.fullscreenTime}>
                  {durationMs > 0 ? formatMs(durationMs) : '--:--'}
                </Text>
              </View>

              <Text style={styles.tapHint}>Tap anywhere for speaker controls</Text>
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    maxWidth: 390,
    height: 350,
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 34,
    backgroundColor: '#090909',
  },
  aura: {
    ...StyleSheet.absoluteFillObject,
  },
  auraImage: {
    width: '100%',
    height: '100%',
  },
  auraShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  artwork: {
    width: 272,
    height: 272,
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artworkWithImage: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.72,
    shadowRadius: 28,
    elevation: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackArtwork: {
    backgroundColor: '#111411',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  fallbackHaloOuter: {
    width: 190,
    height: 190,
    borderRadius: 95,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(57,255,20,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.14)',
  },
  fallbackHaloInner: {
    width: 132,
    height: 132,
    borderRadius: 66,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(57,255,20,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.22)',
  },
  symbol: {
    color: '#f5f5f5',
    fontSize: 66,
    fontWeight: '900',
  },
  displayHint: {
    position: 'absolute',
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  displayHintText: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: '#050505',
  },
  fullscreenBackdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    transform: [{scale: 1.22}],
  },
  fullscreenShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fullscreenTopRow: {
    paddingTop: 54,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speakerLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  syncedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  syncedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#39ff14',
  },
  syncedText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  fullscreenContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 42,
  },
  fullscreenArtwork: {
    width: 286,
    height: 286,
    maxWidth: '78%',
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 18,
  },
  fullscreenFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10,15,11,0.9)',
  },
  fullscreenSymbol: {
    color: '#fff',
    fontSize: 86,
    fontWeight: '900',
  },
  fullscreenTitle: {
    color: '#ffffff',
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '900',
    letterSpacing: -1.3,
    textAlign: 'center',
    marginTop: 30,
  },
  fullscreenArtist: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
  },
  fullscreenProgressRow: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 34,
  },
  fullscreenProgressOuter: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fullscreenProgressInner: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  fullscreenTime: {
    minWidth: 40,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '800',
  },
  tapHint: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 18,
  },
});
