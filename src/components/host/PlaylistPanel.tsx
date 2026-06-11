import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
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
      {renderPanelHeader('Playlist')}
      <Text style={styles.status}>Selected: {currentTrackName}</Text>
      <Text style={styles.status}>Playback: {nowPlayingText}</Text>
      <Text style={styles.status}>Position: {playbackPositionText}</Text>

      <AudioVisualiser
        isActive={nowPlayingText.toLowerCase().includes('playing')}
      />

      <Text style={styles.status}>{transferProgressText}</Text>

      <View style={styles.meterOuter}>
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
