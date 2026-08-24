import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import AudioVisualiser from './AudioVisualiser';

type Props = {
  title: string;
  artworkUri?: string;
  displayMode?: 'host' | 'node';
};

export default function NowPlayingArtwork({title, artworkUri}: Props) {
  const initial = title && title.trim().length > 0
    ? title.trim()[0].toUpperCase()
    : '♪';

  return (
    <View style={styles.wrapper}>
      <View style={styles.stage}>
        {artworkUri ? (
          <>
            <Image
              source={{uri: artworkUri}}
              style={styles.backdrop}
              resizeMode="cover"
              blurRadius={34}
            />
            <View style={styles.backdropShade} />

            <View style={styles.artworkFrame}>
              <Image
                source={{uri: artworkUri}}
                style={styles.image}
                resizeMode="contain"
              />
            </View>
          </>
        ) : (
          <View style={[styles.artworkFrame, styles.fallbackArtwork]}>
            <View style={styles.fallbackHaloOuter}>
              <View style={styles.fallbackHaloInner}>
                <Text style={styles.symbol}>{initial}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <AudioVisualiser />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignSelf: 'center',
  },
  stage: {
    width: '100%',
    maxWidth: 390,
    height: 320,
    alignSelf: 'center',
    marginTop: 6,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    transform: [{scale: 1.12}],
    opacity: 0.5,
  },
  backdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  artworkFrame: {
    width: '88%',
    height: '86%',
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.72,
    shadowRadius: 24,
    elevation: 14,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackArtwork: {
    backgroundColor: '#111411',
  },
  fallbackHaloOuter: {
    width: 184,
    height: 184,
    borderRadius: 92,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(57,255,20,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.14)',
  },
  fallbackHaloInner: {
    width: 126,
    height: 126,
    borderRadius: 63,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(57,255,20,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.22)',
  },
  symbol: {
    color: '#f5f5f5',
    fontSize: 64,
    fontWeight: '900',
  },
});
