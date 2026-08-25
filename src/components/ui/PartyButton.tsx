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

  // Host and Node screens both end with Back. Keep storage beside those footer
  // actions, but stack it vertically so narrow phones never squash the labels.
  if (title === 'Back') {
    const inButtonRow = Number(flattenedStyle.flex || 0) > 0;

    if (inButtonRow) {
      // Node: the parent row already contains Disconnect. This wrapper expands
      // to full width and stacks Storage + Back beneath it. The parent can wrap
      // this block naturally on compact screens while keeping button styling
      // consistent with the Host footer.
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
  nodeBackGroup: {
    flex: 1,
    width: '100%',
    gap: 12,
  },
  hostBackGroup: {
    gap: 12,
  },
});
