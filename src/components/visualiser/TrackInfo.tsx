import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TrackMetadata} from '../../types/TrackMetadata';

type Props = {
  metadata: TrackMetadata;
};

export default function TrackInfo({metadata}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>
        {metadata.title || 'Unknown Track'}
      </Text>

      <Text style={styles.artist} numberOfLines={1}>
        {metadata.artist || 'Unknown Artist'}
      </Text>

      <Text style={styles.album} numberOfLines={1}>
        {metadata.album || 'Unknown Album'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{
    alignItems:'center',
    marginBottom:18,
  },

  title:{
    color:'white',
    fontSize:30,
    fontWeight:'700',
  },

  artist:{
    color:'#bfbfbf',
    marginTop:6,
    fontSize:17,
  },

  album:{
    color:'#7c7c7c',
    marginTop:2,
    fontSize:14,
  }
});
