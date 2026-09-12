import React from 'react';
import {StyleSheet, View} from 'react-native';
import {partyTheme} from '../ui/PartyTheme';

type Props = {
  active?: boolean;
};

const BARS = [28, 52, 38, 74, 46, 88, 62, 96, 72, 58, 82, 44, 68, 92, 54, 78, 48, 86, 64, 36, 70, 50, 80, 42];

export default function RetroSpectrum({active = false}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.scanline} />
      <View style={styles.bars}>
        {BARS.map((height, index) => (
          <View
            key={`bar-${index}`}
            style={[
              styles.bar,
              {
                height: active ? height : Math.max(18, Math.round(height * 0.48)),
                opacity: active ? 0.96 : 0.58,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.reflection}>
        {BARS.map((height, index) => (
          <View
            key={`reflection-${index}`}
            style={[
              styles.reflectionBar,
              {
                height: Math.max(7, Math.round(height * (active ? 0.25 : 0.13))),
                opacity: active ? 0.22 : 0.1,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: 142,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#090508',
    borderWidth: 1,
    borderColor: partyTheme.accentDim,
    marginBottom: 18,
    paddingHorizontal: 10,
    paddingTop: 12,
  },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 96,
    height: 1,
    backgroundColor: partyTheme.accentDim,
    opacity: 0.6,
  },
  bars: {
    height: 86,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  bar: {
    width: 5,
    borderRadius: 3,
    backgroundColor: partyTheme.accent,
    shadowColor: partyTheme.accent,
    shadowOpacity: 0.9,
    shadowRadius: 7,
    elevation: 4,
  },
  reflection: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    transform: [{scaleY: -1}],
  },
  reflectionBar: {
    width: 5,
    borderRadius: 3,
    backgroundColor: partyTheme.accent,
  },
});
