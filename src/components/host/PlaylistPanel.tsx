import React from 'react';
import {View, Text, TouchableOpacity, Image} from 'react-native';
import PanelHeader from '../common/PanelHeader';
import AudioVisualiser from '../visualiser/AudioVisualiser';

type Track = {
  id: string;
  name: string;
  uri: string;
};

type Props = {
  styles: any;
  currentTrackName: string;
  nowPlayingText: string;
  playbackPositionText: string;
  transferProgressText: string;
  transferProgress: number;
  playlist: Track[];
  selectedTrackId: string | null;
  trackTransferStatus: Record<string, number>;
  addTrack: () => void;
  removeSelectedTrack: () => void;
  setSelectedTrackId: (id: string) => void;
  setCurrentTrackName: (name: string) => void;
  addLog: (message: string) => void;
  autoSyncAndTransfer: (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => void;
};

export default function PlaylistPanel({
  styles,
  currentTrackName,
  nowPlayingText,
  playbackPositionText,
  transferProgressText,
  transferProgress,
  playlist,
  selectedTrackId,
  trackTransferStatus,
  addTrack,
  removeSelectedTrack,
  setSelectedTrackId,
  setCurrentTrackName,
  addLog,
  autoSyncAndTransfer,
}: Props) {
  const renderPanelHeader = (title: string, subtitle?: string) => (
    <PanelHeader title={title} subtitle={subtitle} styles={styles} />
  );

  return (
    <View style={styles.panel}>
      {renderPanelHeader('Now Playing')}

      <View
        style={{
          marginTop:18,
          marginBottom:24,
          borderRadius:30,
          padding:22,
          backgroundColor:'rgba(255,255,255,0.04)',
          borderWidth:1,
          borderColor:'rgba(255,255,255,0.08)',
          shadowColor:'#39ff14',
          shadowOpacity:0.15,
          shadowRadius:20,
          elevation:8,
        }}>

      <View
        style={{
          alignSelf:'center',
          width:250,
          height:250,
          borderRadius:36,
          backgroundColor:'#101510',
          marginTop:20,
          marginBottom:20,
          overflow:'hidden',
          justifyContent:'center',
          alignItems:'center',
          borderWidth:1,
          borderColor:'rgba(57,255,20,0.55)'
        }}>

        <Text
          style={{
            color:'#39ff14',
            fontSize:64
          }}>
          ◉
        </Text>

      </View>

      <Text
        style={{
          color:'white',
          fontSize:32,
          fontWeight:'700',
          textAlign:'center',
          marginBottom:4
        }}>
        {currentTrackName}
      </Text>

      <Text
        style={{
          color:'#aaa',
          textAlign:'center',
          marginBottom:12
        }}>
        Unknown Artist
      </Text>

      <Text style={styles.status}>Selected: {currentTrackName}</Text>

      <Text style={styles.status}>Playback: {nowPlayingText}</Text>
      <Text style={styles.status}>Position: {playbackPositionText}</Text>

      <AudioVisualiser
        isActive={
          currentTrackName.trim().length > 0 &&
          currentTrackName !== 'No track selected' &&
          !nowPlayingText.toLowerCase().includes('stopped') &&
          !nowPlayingText.toLowerCase().includes('paused')
        }
      />

      </View>

      <Text style={styles.status}>{transferProgressText}</Text>


      <View
        style={{
          height:8,
          borderRadius:99,
          overflow:'hidden',
          backgroundColor:'#101510',
          marginTop:12,
          marginBottom:18
        }}>

        <View style={[styles.meterInner, {width: `${transferProgress}%`}]} />
      </View>

      <TouchableOpacity style={styles.button} onPress={addTrack}>
        <Text style={styles.buttonText}>Add Track ＋</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={removeSelectedTrack}>
        <Text style={styles.secondaryButtonText}>Remove Selected Track</Text>
      </TouchableOpacity>

      <View style={styles.playlistBox}>
        {playlist.length === 0 ? (
          <Text style={styles.logText}>No tracks added yet</Text>
        ) : (
          playlist.map((track, index) => {
            const selected = selectedTrackId === track.id;

            return (
              <TouchableOpacity
                key={track.id}
                style={selected ? styles.trackSelected : styles.trackRow}
                onPress={() => {
                  setSelectedTrackId(track.id);
                  setCurrentTrackName(track.name);
                  addLog(`Selected track: ${track.name}`);
                  autoSyncAndTransfer(track, playlist, track.id);
                }}>
                <Text style={selected ? styles.trackTextSelected : styles.trackText}>
                  {index + 1}. {track.name}
                </Text>
                <Text style={selected ? styles.trackMetaSelected : styles.trackMeta}>
                  {trackTransferStatus[track.id] === 100
                    ? 'Cached on nodes'
                    : `Loading ${trackTransferStatus[track.id] || 0}%`}
                </Text>
                <View style={selected ? styles.trackMeterOuterSelected : styles.trackMeterOuter}>
                  <View
                    style={[
                      styles.trackMeterInner,
                      {width: `${trackTransferStatus[track.id] || 0}%`},
                    ]}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  )
}
