import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {StorageButton} from '../common/StorageManager';
import {partyTheme} from './PartyTheme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
};

export default function PartyButton({
  title,
  onPress,
  variant = 'primary',
  style,
}: Props) {
  const primary = variant === 'primary';
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const inButtonRow = Number(flattenedStyle.flex || 0) > 0;

  const button = (buttonStyle?: ViewStyle) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      style={[
        styles.button,
        primary ? styles.primary : styles.secondary,
        buttonStyle,
      ]}>
      <View style={styles.buttonInset} />
      <Text
        style={[
          styles.text,
          primary ? styles.primaryText : styles.secondaryText,
        ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  if (title === 'Disconnect' && inButtonRow) {
    return button(styles.nodeDisconnect);
  }

  if (title === 'Back') {
    if (inButtonRow) {
      return (
        <View style={styles.nodeBackGroup}>
          <StorageButton style={{width: '100%'}} />
          {button({width: '100%'})}
        </View>
      );
    }

    return (
      <View
        style={[
          styles.hostBackGroup,
          {
            width: flattenedStyle.width || '100%',
            marginTop: Number(flattenedStyle.marginTop || 0),
          },
        ]}>
        <StorageButton style={{width: '100%'}} />
        {button({width: '100%'})}
      </View>
    );
  }

  return button(style);
}

const styles = StyleSheet.create({
  button: {
    minHeight: 68,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  buttonInset: {
    position: 'absolute',
    top: 3,
    left: 4,
    right: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  primary: {
    backgroundColor: partyTheme.accent,
    borderColor: partyTheme.accentSoft,
    shadowColor: partyTheme.accent,
    shadowOpacity: 0.48,
    shadowRadius: 12,
    elevation: 8,
  },
  secondary: {
    backgroundColor: partyTheme.hardwareRaised,
    borderColor: partyTheme.accentDim,
  },
  text: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  primaryText: {
    color: '#16060b',
  },
  secondaryText: {
    color: partyTheme.accentSoft,
  },
  nodeDisconnect: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    width: '100%',
    zIndex: 2,
  },
  nodeBackGroup: {
    flex: 1,
    width: '100%',
    gap: 12,
    marginTop: 80,
  },
  hostBackGroup: {
    gap: 12,
  },
});
