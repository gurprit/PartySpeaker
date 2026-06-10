import React from 'react';
import {View, Text} from 'react-native';
import PanelHeader from '../common/PanelHeader';

type Props = {
  styles: any;
  status: string;
  nowPlayingText: string;
  playbackPositionText: string;
  hostClockOffsetMs: number;
  nodePlaybackDelayMs: number;
  subnetPrefix: string;
  lastMessage: string;
};

export default function NodeStatusPanel({
  styles,
  status,
  nowPlayingText,
  playbackPositionText,
  hostClockOffsetMs,
  nodePlaybackDelayMs,
  subnetPrefix,
  lastMessage,
}: Props) {
  return (
    <View style={styles.panel}>
      <PanelHeader title="Node Status" styles={styles} />

      <Text style={styles.label}>Status</Text>
      <Text style={styles.status}>{status}</Text>

      <Text style={styles.label}>Playback</Text>
      <Text style={styles.status}>{nowPlayingText}</Text>
      <Text style={styles.status}>Position: {playbackPositionText}</Text>

      <Text style={styles.label}>Host clock offset</Text>
      <Text style={styles.status}>{hostClockOffsetMs}ms</Text>

      <Text style={styles.label}>Local delay</Text>
      <Text style={styles.status}>{nodePlaybackDelayMs}ms</Text>

      <Text style={styles.label}>Node Network Prefix</Text>
      <Text style={styles.status}>{subnetPrefix}</Text>

      <Text style={styles.label}>Last message</Text>
      <Text style={styles.status}>{lastMessage}</Text>
    </View>
  );
}
