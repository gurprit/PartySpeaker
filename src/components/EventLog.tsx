import React from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';

type Props = {
  styles: any;
  log: string[];
  clearLog: () => void;
};

export default function EventLog({
  styles,
  log,
  clearLog,
}: Props) {
  return (
    <View style={styles.logPanel}>
      <Text style={styles.label}>Event log</Text>
      <ScrollView style={styles.logBox}>
        {log.length === 0 ? (
          <Text style={styles.logText}>No events yet</Text>
        ) : (
          log.map((item, index) => (
            <Text key={`${item}-${index}`} style={styles.logText}>
              {item}
            </Text>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.smallButton} onPress={clearLog}>
        <Text style={styles.smallButtonText}>Clear Log</Text>
      </TouchableOpacity>
    </View>
  )
}
