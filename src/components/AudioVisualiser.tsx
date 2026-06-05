import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

type Props = {
  isPlaying: boolean;
};

const BAR_COUNT = 24;

export default function AudioVisualiser({isPlaying}: Props) {
  const bars = useRef(
    Array.from({length: BAR_COUNT}, () => new Animated.Value(0.18)),
  ).current;

  useEffect(() => {
    const animations = bars.map((bar, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 0.35 + Math.random() * 0.65,
            duration: 170 + index * 8,
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: 0.15 + Math.random() * 0.35,
            duration: 170 + index * 7,
            useNativeDriver: false,
          }),
        ]),
      ),
    );

    if (isPlaying) {
      animations.forEach(animation => animation.start());
    } else {
      animations.forEach(animation => animation.stop());
      bars.forEach(bar => {
        Animated.timing(bar, {
          toValue: 0.18,
          duration: 250,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      animations.forEach(animation => animation.stop());
    };
  }, [isPlaying, bars]);

  return (
    <View style={styles.container}>
      {bars.map((bar, index) => {
        const height = bar.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 70],
        });

        return <Animated.View key={index} style={[styles.bar, {height}]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginVertical: 16,
  },
  bar: {
    width: 6,
    borderRadius: 999,
    backgroundColor: '#39ff14',
    opacity: 0.9,
  },
});
