import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import PanelHeader from './PanelHeader';

type Props = {
  styles: any;
  nodePlaybackDelayMs: number;
  adjustNodeDelay: (amount: number) => void;
  resetNodeDelay: () => void;
};

export default function NodeDelayCalibration({
  styles,
  nodePlaybackDelayMs,
  adjustNodeDelay,
  resetNodeDelay,
}: Props) {
  return (
    <View style={styles.panel}>
      <PanelHeader
        title="Node Delay Calibration"
        subtitle="Use this to line up speakers by ear"
        styles={styles}
      />

      <Text style={styles.status}>
        Delay: {nodePlaybackDelayMs}ms
      </Text>

      <Text style={styles.hint}>
        Negative plays earlier. Positive plays later.
      </Text>

      <View style={styles.row}>
        <TouchableOpacity
          style={styles.halfSecondaryButton}
          onPress={() => adjustNodeDelay(-100)}>
          <Text style={styles.secondaryButtonText}>-100ms</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.halfSecondaryButton}
          onPress={() => adjustNodeDelay(100)}>
          <Text style={styles.secondaryButtonText}>+100ms</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          style={styles.halfSecondaryButton}
          onPress={() => adjustNodeDelay(-25)}>
          <Text style={styles.secondaryButtonText}>-25ms</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.halfSecondaryButton}
          onPress={() => adjustNodeDelay(25)}>
          <Text style={styles.secondaryButtonText}>+25ms</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={resetNodeDelay}>
        <Text style={styles.secondaryButtonText}>
          Reset Delay
        </Text>
      </TouchableOpacity>
    </View>
  );
}
