import React, {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TrackMetadata} from '../../types/TrackMetadata';
import {setNowPlayingDisplayMetadata} from './NowPlayingDisplayStore';

type Props = {
  metadata: TrackMetadata;
};

export default function TrackInfo({metadata}: Props) {
  useEffect(() => {
    setNowPlayingDisplayMetadata(metadata);
  }, [metadata]);

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>NOW PLAYING</Text>

      <Text style={styles.title} numberOfLines={2}>
        {metadata.title || 'Unknown Track'}
      </Text>

      <Text style={styles.artist} numberOfLines={1}>
        {metadata.artist || 'Unknown Artist'}
      </Text>

      {metadata.album ? (
        <Text style={styles.album} numberOfLines={1}>
          {metadata.album}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.1,
    marginBottom: 10,
  },
  title: {
    color: '#ffffff',
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.1,
    textAlign: 'center',
  },
  artist: {
    color: 'rgba(255,255,255,0.76)',
    marginTop: 9,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  album: {
    color: 'rgba(255,255,255,0.38)',
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
