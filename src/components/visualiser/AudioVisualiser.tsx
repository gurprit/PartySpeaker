import React, {useEffect, useState} from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  StyleSheet,
  View,
} from 'react-native';
import {partyTheme} from '../ui/PartyTheme';

const BAR_COUNT = 28;
const QUIET_BARS = Array.from({length: BAR_COUNT}, () => 0.035);
const {PartyAudio} = NativeModules;

export default function AudioVisualiser() {
  const [bars, setBars] = useState<number[]>(QUIET_BARS);

  useEffect(() => {
    if (!PartyAudio) return;

    const emitter = new NativeEventEmitter(PartyAudio);
    const subscription = emitter.addListener('PartyPlaybackVisuals', payload => {
      if (!Array.isArray(payload?.bars)) return;

      const next = payload.bars
        .slice(0, BAR_COUNT)
        .map((value: unknown) =>
          Math.max(0.015, Math.min(1, Number(value) || 0)),
        );

      if (next.length === BAR_COUNT) {
        setBars(next);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.scanline} />
      <View style={styles.visualiser}>
        {bars.map((level, index) => (
          <View
            key={`main-${index}`}
            style={[
              styles.bar,
              {
                height: 8 + level * 92,
                opacity: 0.52 + level * 0.48,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.reflection}>
        {bars.map((level, index) => (
          <View
            key={`reflection-${index}`}
            style={[
              styles.reflectionBar,
              {
                height: 4 + level * 28,
                opacity: 0.08 + level * 0.2,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginTop: 18,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: partyTheme.accentDim,
    backgroundColor: '#090508',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    overflow: 'hidden',
    shadowColor: partyTheme.accent,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 108,
    height: 1,
    backgroundColor: partyTheme.accentDim,
    opacity: 0.7,
  },
  visualiser: {
    height: 100,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
    paddingHorizontal: 2,
  },
  bar: {
    flex: 1,
    maxWidth: 9,
    minWidth: 3,
    borderRadius: 2,
    backgroundColor: partyTheme.accent,
    shadowColor: partyTheme.accent,
    shadowOpacity: 0.85,
    shadowRadius: 5,
    elevation: 2,
  },
  reflection: {
    height: 34,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 3,
    paddingHorizontal: 2,
    transform: [{scaleY: -1}],
  },
  reflectionBar: {
    flex: 1,
    maxWidth: 9,
    minWidth: 3,
    borderRadius: 2,
    backgroundColor: partyTheme.accentSoft,
  },
});
