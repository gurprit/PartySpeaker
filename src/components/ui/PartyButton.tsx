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

  // PartySpeaker's Host and Node screens both finish with a Back action. Keep
  // storage management alongside those controls instead of floating over the
  // Android system navigation area where it can be hard to see/tap.
  if (title === 'Back') {
    const inButtonRow = Number(flattenedStyle.flex || 0) > 0;

    if (inButtonRow) {
      // Node: parent already contains Disconnect (flex 1). This wrapper takes
      // two shares, then splits them evenly into Storage + Back, producing
      // three equal actions across the row.
      return (
        <View style={styles.nodeBackGroup}>
          <StorageButton style={{flex: 1}} />
          {button({flex: 1})}
        </View>
      );
    }

    // Host: Stop Hosting is above this component. Keep Storage directly between
    // Stop Hosting and Back, matching the same full-width secondary treatment.
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
    flex: 2,
    flexDirection: 'row',
    gap: 12,
  },
  hostBackGroup: {
    gap: 12,
  },
});
