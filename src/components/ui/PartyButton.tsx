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
      activeOpacity={0.82}
      style={[
        styles.button,
        primary ? styles.primary : styles.secondary,
        buttonStyle,
      ]}>
      <Text
        style={[
          styles.text,
          primary ? styles.primaryText : styles.secondaryText,
        ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  // The Node footer is still hosted inside an older horizontal row in App.tsx.
  // Take Disconnect out of that row's normal layout so the Back component can
  // occupy the full width beneath it with Storage in the middle. This gives the
  // compact screens a true vertical footer without touching playback-heavy App.tsx.
  if (title === 'Disconnect' && inButtonRow) {
    return button(styles.nodeDisconnect);
  }

  // Host and Node screens both end with Back. Keep storage beside those footer
  // actions, but stack it vertically so narrow phones never squash the labels.
  if (title === 'Back') {
    if (inButtonRow) {
      return (
        <View style={styles.nodeBackGroup}>
          <StorageButton style={{width: '100%'}} />
          {button({width: '100%'})}
        </View>
      );
    }

    // Host: Stop Hosting sits directly above this component, so Storage and
    // Back continue vertically underneath it in the same secondary style.
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
    marginTop: 88,
  },
  hostBackGroup: {
    gap: 12,
  },
});
