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
    color: partyTheme.muted,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
});
