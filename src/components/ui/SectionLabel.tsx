import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {partyTheme} from './PartyTheme';

type Props = {
  children: React.ReactNode;
};

export default function SectionLabel({children}: Props) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    color: partyTheme.accentSoft,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 12,
    fontFamily: 'monospace',
    textShadowColor: partyTheme.accentDim,
    textShadowRadius: 7,
  },
});
