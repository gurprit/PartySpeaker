import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

type Props = {
  isActive: boolean;
};

const BAR_COUNT = 28;

export default function AudioVisualiser({isActive}: Props) {
  const bars = useRef(
    Array.from({length: BAR_COUNT}, () => new Animated.Value(0.2)),
  ).current;

  const animations = useMemo(
    () =>
      bars.map((bar, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 0.35 + Math.random() * 0.65,
              duration: 180 + index * 8,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: 0.15 + Math.random() * 0.35,
              duration: 180 + index * 6,
              useNativeDriver: false,
            }),
          ]),
        ),
      ),
    [bars],
  );

  useEffect(() => {
    if (isActive) {
      animations.forEach(animation => animation.start());
    } else {
      animations.forEach(animation => animation.stop());

      bars.forEach(bar => {
        Animated.timing(bar, {
          toValue: 0.16,
          duration: 250,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      animations.forEach(animation => animation.stop());
    };
  }, [animations, bars, isActive]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.visualiser}>
        {bars.map((bar, index) => {
          const height = bar.interpolate({
            inputRange: [0, 1],
            outputRange: [8, 76],
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
  visualiser: {
    height: 88,
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
