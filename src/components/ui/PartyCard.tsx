import React from 'react';
import {StyleSheet, View, ViewStyle} from 'react-native';
import {partyTheme} from './PartyTheme';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export default function PartyCard({children, style}: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: partyTheme.card,
    borderColor: partyTheme.border,
    borderWidth: 1,
    borderRadius: partyTheme.radius,
    padding: 20,
  },
});
