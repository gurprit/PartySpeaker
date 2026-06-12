import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

type Props = {
  isActive: boolean;
  label?: string;
  playbackPositionText?: string;
};

const BAR_COUNT = 28;

const PATTERN = [
  0.18, 0.28, 0.44, 0.66, 0.82, 0.95, 0.74,
  0.52, 0.34, 0.24, 0.38, 0.62, 0.88, 1,
  0.78, 0.58, 0.42, 0.31, 0.49, 0.71, 0.91,
  0.84, 0.63, 0.46, 0.29, 0.21, 0.33, 0.56,
];

function parsePlaybackSeconds(value?: string): number {
  if (!value) {
    return 0;
  }

  const parts = value.split(':').map(part => Number(part.trim()));

  if (parts.some(Number.isNaN)) {
    return 0;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return 0;
}

export default function AudioVisualiser({
  isActive,
  label,
  playbackPositionText,
}: Props) {
  const [frame, setFrame] = useState(0);

  const playbackSeconds = useMemo(
    () => parsePlaybackSeconds(playbackPositionText),
    [playbackPositionText],
  );

  useEffect(() => {
    if (!isActive) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame(previous => previous + 1);
    }, 90);

    return () => clearInterval(timer);
  }, [isActive]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.statusLabel}>
        {label || (isActive ? 'Visualiser synced to playback clock' : 'Visualiser waiting')}
      </Text>

      <View style={styles.visualiser}>
        {PATTERN.map((base, index) => {
          const phase = playbackSeconds * 0.85 + frame * 0.18 + index * 0.55;
          const wave = (Math.sin(phase) + 1) / 2;
          const beat = (Math.sin(playbackSeconds * 2.4 + frame * 0.3) + 1) / 2;
          const energy = isActive ? Math.min(1, base * 0.55 + wave * 0.35 + beat * 0.25) : 0.18;
          const height = 10 + energy * 78;

          return (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height,
                  opacity: isActive ? 0.95 : 0.35,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(57, 255, 20, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(57, 255, 20, 0.18)',
  },
  statusLabel: {
    color: '#8fcf9e',
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 8,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  visualiser: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bar: {
    width: 5,
    borderRadius: 999,
    backgroundColor: '#39ff14',
    shadowColor: '#39ff14',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
});
