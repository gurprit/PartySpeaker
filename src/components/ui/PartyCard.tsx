import React from 'react';
import {StyleSheet, View, ViewStyle} from 'react-native';
import {partyTheme} from './PartyTheme';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export default function PartyCard({children, style}: Props) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.topHighlight} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: partyTheme.card,
    borderColor: partyTheme.border,
    borderWidth: 1,
    borderRadius: partyTheme.radius,
    padding: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  topHighlight: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
