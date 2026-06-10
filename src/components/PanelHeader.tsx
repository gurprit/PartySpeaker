import React from 'react';
import {View, Text} from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  styles: any;
};

export default function PanelHeader({
  title,
  subtitle,
  styles,
}: Props) {
  return (
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>
        {title}
      </Text>

      {subtitle ? (
        <Text style={styles.panelSubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
