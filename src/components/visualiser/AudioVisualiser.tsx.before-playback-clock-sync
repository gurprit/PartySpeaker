import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';

type Props = {
  isActive: boolean;
  label?: string;
};

const BAR_COUNT = 28;

const PATTERN = [
  0.18, 0.28, 0.44, 0.66, 0.82, 0.95, 0.74,
  0.52, 0.34, 0.24, 0.38, 0.62, 0.88, 1,
  0.78, 0.58, 0.42, 0.31, 0.49, 0.71, 0.91,
  0.84, 0.63, 0.46, 0.29, 0.21, 0.33, 0.56,
];

export default function AudioVisualiser({isActive, label}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    if (isActive) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
      );

      animation.start();
    } else {
      pulse.stopAnimation();
      Animated.timing(pulse, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }

    return () => {
      if (animation) {
        animation.stop();
      }
    };
  }, [isActive, pulse]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.statusLabel}>
        {label || (isActive ? 'Visualiser active' : 'Visualiser waiting')}
      </Text>

      <View style={styles.visualiser}>
        {PATTERN.map((base, index) => {
          const phaseOffset = (index % 7) / 10;
          const boosted = Math.min(1, base + phaseOffset);

          const height = pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [
              10 + base * 28,
              22 + boosted * 66,
            ],
          });

          return (
            <Animated.View
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
