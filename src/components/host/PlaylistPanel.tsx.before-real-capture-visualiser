import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, Image} from 'react-native';
import PanelHeader from '../common/PanelHeader';
import AudioVisualiser from '../visualiser/AudioVisualiser';
import NowPlayingArtwork from '../visualiser/NowPlayingArtwork';
import TrackInfo from '../visualiser/TrackInfo';
import MetadataService from '../../services/MetadataService';
import {TrackMetadata} from '../../types/TrackMetadata';

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
  onMetadataChange?: (metadata: import('../../types/TrackMetadata').TrackMetadata) => void;
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
  onMetadataChange,
}: Props) {
  const [metadata, setMetadata] = React.useState<TrackMetadata>({
    title: '',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
  });

  const renderPanelHeader = (title: string, subtitle?: string) => (
    <PanelHeader title={title} subtitle={subtitle} styles={styles} />
  );

  const selectedTrackForMetadata = playlist.find(track => track.id === selectedTrackId);

  React.useEffect(() => {
    let mounted = true;

    MetadataService.getMetadata(
      selectedTrackForMetadata?.name || currentTrackName,
      selectedTrackForMetadata?.uri,
    ).then(result => {
      if (mounted) {
        setMetadata(result);
        onMetadataChange?.(result);
      }
    });

    return () => {
      mounted = false;
    };
  }, [currentTrackName, selectedTrackForMetadata?.name, selectedTrackForMetadata?.uri]);

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
      <NowPlayingArtwork
        title={metadata.title || currentTrackName}
        artworkUri={metadata.artworkUri}
      />

      <TrackInfo
        metadata={metadata}
      />

      <Text style={styles.status}>Selected: {currentTrackName}</Text>

      <Text style={styles.status}>Playback: {nowPlayingText}</Text>
      <Text style={styles.status}>Position: {playbackPositionText}</Text>

      <AudioVisualiser
        isActive={
          currentTrackName.trim().length > 0 &&
          currentTrackName !== 'No track selected'
        }
        label={
          currentTrackName.trim().length > 0 && currentTrackName !== 'No track selected'
            ? 'Visualiser synced to playback clock'
            : 'Select a track to wake visualiser'
        }
        playbackPositionText={playbackPositionText}
      />

      </View>

      <Text style={styles.status}>{transferProgressText}</Text>

      <View
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 16,
          backgroundColor: 'rgba(255,255,255,0.035)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.07)',
        }}>
        <Text
          style={{
            color: '#8fcf9e',
            fontSize: 12,
            lineHeight: 18,
            textAlign: 'center',
          }}>
          Visualiser test: select a track and confirm the bars move.
          Album art: placeholder only for now. Real MP3 artwork comes next.
        </Text>
      </View>


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
