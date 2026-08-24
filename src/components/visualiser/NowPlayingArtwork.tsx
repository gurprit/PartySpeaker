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
      <View style={styles.artworkFrame}>
        {artworkUri ? (
          <Image
            source={{uri: artworkUri}}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.fallbackArtwork}>
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
  artworkFrame: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: 1,
    alignSelf: 'center',
    marginTop: 8,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackArtwork: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101210',
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
