import React, {useEffect, useRef, useState} from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  StyleSheet,
  View,
} from 'react-native';

const BAR_COUNT = 28;
const QUIET_BARS = Array.from({length: BAR_COUNT}, () => 0.035);
const {PartySpectrum} = NativeModules;

export default function AudioVisualiser() {
  const [bars, setBars] = useState<number[]>(QUIET_BARS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!PartySpectrum) return;

    const emitter = new NativeEventEmitter(PartySpectrum);
    const subscription = emitter.addListener('PartySpectrumFFT', payload => {
      if (!Array.isArray(payload?.bars)) return;

      const next = payload.bars
        .slice(0, BAR_COUNT)
        .map((value: unknown) => Math.max(0.025, Math.min(1, Number(value) || 0)));

      if (next.length === BAR_COUNT) {
        setBars(next);
      }
    });

    let cancelled = false;
    let attempts = 0;

    const start = async () => {
      if (cancelled) return;

      try {
        const result = await PartySpectrum.startSpectrum();
        if (result === 'started') return;

        // Android may still have the system permission dialog on screen.
        // Retry quietly for a few seconds so granting permission starts the
        // analyser without requiring an app restart.
        if ((result === 'permission_requested' || result === 'permission_waiting') && attempts < 12) {
          attempts += 1;
          retryTimerRef.current = setTimeout(start, 900);
        }
      } catch {
        // Spectrum is a visual enhancement only; playback must remain untouched.
      }
    };

    start();

    return () => {
      cancelled = true;
      subscription.remove();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      PartySpectrum.stopSpectrum?.().catch?.(() => {});
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
