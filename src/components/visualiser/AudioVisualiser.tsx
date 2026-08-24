import React, {useEffect, useState} from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  StyleSheet,
  View,
} from 'react-native';

const BAR_COUNT = 28;
const QUIET_BARS = Array.from({length: BAR_COUNT}, () => 0.035);
const {PartyAudio} = NativeModules;

export default function AudioVisualiser() {
  const [bars, setBars] = useState<number[]>(QUIET_BARS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      <View style={styles.visualiser}>
        {bars.map((level, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: 5 + level * 92,
                opacity: 0.45 + level * 0.55,
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
    marginTop: 20,
    marginBottom: 14,
  },
  visualiser: {
    height: 102,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
    paddingHorizontal: 4,
  },
  bar: {
    flex: 1,
    maxWidth: 10,
    minWidth: 3,
    borderRadius: 999,
    backgroundColor: '#f3f3f3',
  },
});
