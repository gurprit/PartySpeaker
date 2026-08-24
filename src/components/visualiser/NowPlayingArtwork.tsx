import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  title: string;
  artworkUri?: string;
};

export default function NowPlayingArtwork({title, artworkUri}: Props) {
  const initial = title && title.trim().length > 0 ? title.trim()[0].toUpperCase() : '♪';
  const pulse = useRef(new Animated.Value(0)).current;

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

  return (
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
    </View>
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
});
