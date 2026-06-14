import React from 'react';
import {StyleSheet, Text, TouchableOpacity, ViewStyle} from 'react-native';
import {partyTheme} from './PartyTheme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
};

export default function PartyButton({title, onPress, variant = 'primary', style}: Props) {
  const primary = variant === 'primary';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.button, primary ? styles.primary : styles.secondary, style]}>
      <Text style={[styles.text, primary ? styles.primaryText : styles.secondaryText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 76,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  primary: {
    backgroundColor: partyTheme.white,
  },
  secondary: {
    backgroundColor: partyTheme.card,
    borderColor: partyTheme.border,
    borderWidth: 1,
  },
  text: {
    fontSize: 21,
    fontWeight: '800',
  },
  primaryText: {
    color: partyTheme.black,
  },
  secondaryText: {
    color: partyTheme.text,
  },
});
