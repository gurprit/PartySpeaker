import React, {useEffect, useRef, useState} from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  StyleSheet,
  View,
} from 'react-native';

const {PartyAudio} = NativeModules;

const BAR_COUNT = 28;
const IDLE_LEVEL = 0.06;

function normaliseBars(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const numeric = values
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));

  if (numeric.length === 0) {
    return null;
  }

  return Array.from({length: BAR_COUNT}, (_, index) => {
    const sourceIndex = Math.min(
      numeric.length - 1,
      Math.round((index / Math.max(1, BAR_COUNT - 1)) * (numeric.length - 1)),
    );

    return Math.max(IDLE_LEVEL, Math.min(1, numeric[sourceIndex]));
  });
}

function shapeLevel(level: number): number[] {
  const safeLevel = Math.max(0, Math.min(1, level));

  return Array.from({length: BAR_COUNT}, (_, index) => {
    const centreDistance = Math.abs(index - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
    const envelope = 0.58 + (1 - centreDistance) * 0.42;
    const bandTexture = 0.76 + 0.24 * Math.sin(index * 1.67 + safeLevel * 5.4);
    return Math.max(IDLE_LEVEL, Math.min(1, safeLevel * envelope * bandTexture));
  });
}

export default function AudioVisualiser() {
  const [bars, setBars] = useState<number[]>(
    Array.from({length: BAR_COUNT}, () => IDLE_LEVEL),
  );
  const lastSpectrumAtRef = useRef(0);

  useEffect(() => {
    if (!PartyAudio) {
      return;
    }

    const emitter = new NativeEventEmitter(PartyAudio);

    const spectrumSubscription = emitter.addListener(
      'PartyPlaybackVisuals',
      (event: {bars?: unknown}) => {
        const nextBars = normaliseBars(event?.bars);
        if (!nextBars) {
          return;
        }

        lastSpectrumAtRef.current = Date.now();
        setBars(nextBars);
      },
    );

    const levelSubscription = emitter.addListener(
      'PartyPlaybackLevel',
      (event: {level?: unknown}) => {
        if (Date.now() - lastSpectrumAtRef.current < 250) {
          return;
        }

        const level = Number(event?.level);
        if (!Number.isFinite(level)) {
          return;
        }

        setBars(shapeLevel(level));
      },
    );

    return () => {
      spectrumSubscription.remove();
      levelSubscription.remove();
    };
  }, []);

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={styles.baseline} />
      <View style={styles.visualiser}>
        {bars.map((level, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: 5 + level * 70,
                opacity: 0.38 + level * 0.62,
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
    height: 92,
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 2,
  },
  baseline: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  visualiser: {
    height: 82,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    flex: 1,
    maxWidth: 7,
    minWidth: 3,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
});
