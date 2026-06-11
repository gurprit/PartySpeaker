import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

type Props = {
  title: string;
};

export default function NowPlayingArtwork({title}: Props) {
  const initial = title && title.trim().length > 0 ? title.trim()[0].toUpperCase() : '♪';

  return (
    <View style={styles.artwork}>
      <View style={styles.innerGlow}>
        <Text style={styles.symbol}>{initial}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: {
    alignSelf: 'center',
    width: 250,
    height: 250,
    borderRadius: 36,
    backgroundColor: '#101510',
    marginTop: 20,
    marginBottom: 20,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.55)',
    shadowColor: '#39ff14',
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 8,
  },
  innerGlow: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(57,255,20,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.2)',
  },
  symbol: {
    color: '#39ff14',
    fontSize: 76,
    fontWeight: '900',
  },
});
