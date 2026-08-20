import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import MetadataService from '../../services/MetadataService';
import {TrackMetadata} from '../../types/TrackMetadata';
import NowPlayingArtwork from '../visualiser/NowPlayingArtwork';
import TrackInfo from '../visualiser/TrackInfo';
import PartyButton from '../ui/PartyButton';
import PartyCard from '../ui/PartyCard';
import SectionLabel from '../ui/SectionLabel';
import {partyTheme} from '../ui/PartyTheme';

type Track = {
  id: string;
  name: string;
  uri: string;
  metadata?: TrackMetadata;
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
  setSelectedTrackId: (trackId: string) => void;
  setCurrentTrackName: (name: string) => void;
  addLog: (message: string) => void;
  trackTransferStatus: Record<string, number | undefined>;
  addTrack: () => void;
  removeSelectedTrack: () => void;
  autoSyncAndTransfer: (
    track?: Track,
    playlistSnapshot?: Track[],
    selectedIdSnapshot?: string | null,
  ) => void;
  onMetadataChange?: (metadata: TrackMetadata) => void;
  selectedTrackReady: boolean;
  playbackState: 'idle' | 'playing' | 'paused';
  nowPlayingTrackId: string | null;
  onPlayPause: () => void;
  selectPreviousTrack: () => void;
  selectNextTrack: () => void;
};

export default function PlaylistPanel({
  currentTrackName,
  nowPlayingText,
  playbackPositionText,
  transferProgressText,
  transferProgress,
  playlist,
  selectedTrackId,
  setSelectedTrackId,
  setCurrentTrackName,
  addLog,
  trackTransferStatus,
  addTrack,
  removeSelectedTrack,
  autoSyncAndTransfer,
  onMetadataChange,
  selectedTrackReady,
  playbackState,
  nowPlayingTrackId,
  onPlayPause,
  selectPreviousTrack,
  selectNextTrack,
}: Props) {
  const [metadata, setMetadata] = React.useState<TrackMetadata>({
    title: '',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
  });

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
  }, [
    currentTrackName,
    selectedTrackForMetadata?.name,
    selectedTrackForMetadata?.uri,
    onMetadataChange,
  ]);

  const selectedTrack = selectedTrackForMetadata;
  const nowPlayingTrack = playlist.find(track => track.id === nowPlayingTrackId);
  const nowPlayingMetadata = nowPlayingTrack
    ? metadata.title && selectedTrack?.id === nowPlayingTrack.id
      ? metadata
      : {title: nowPlayingTrack.name.replace(/\.[^.]+$/, ''), artist: 'Unknown Artist', album: 'Unknown Album'}
    : {title: '', artist: 'Unknown Artist', album: 'Unknown Album'};
  const selectedTransfer = selectedTrack
    ? trackTransferStatus[selectedTrack.id] || 0
    : 0;

  return (
    <View style={localStyles.container}>
      <View style={localStyles.sectionHeaderRow}>
        <SectionLabel>Playlist</SectionLabel>
        <Text style={localStyles.countText}>
          {playlist.length} {playlist.length === 1 ? 'Track' : 'Tracks'}
        </Text>
      </View>

      <View style={localStyles.playlistBox}>
        {playlist.length === 0 ? (
          <PartyCard>
            <Text style={localStyles.emptyText}>No tracks added yet</Text>
          </PartyCard>
        ) : (
          playlist.map((track, index) => {
            const selected = selectedTrackId === track.id;
            const progress = trackTransferStatus[track.id] || 0;

            return (
              <TouchableOpacity
                key={track.id}
                activeOpacity={0.82}
                style={[
                  localStyles.trackRow,
                  selected ? localStyles.trackRowSelected : null,
                ]}
                onPress={() => {
                  setSelectedTrackId(track.id);
                  addLog(`Selected track: ${track.name}`);
                  autoSyncAndTransfer(track, playlist, track.id);
                }}>
                <Text style={[localStyles.trackIndex, selected ? localStyles.trackIndexSelected : null]}>{index + 1}</Text>

                <View style={localStyles.trackArtworkMini}>
                  {track.metadata?.artworkUri ? (
                    <Image
                      source={{uri: track.metadata.artworkUri}}
                      style={localStyles.trackArtworkImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={[localStyles.trackArtworkText, selected ? localStyles.trackArtworkTextSelected : null]}>
                      {track.name.trim()[0]?.toUpperCase() || '♪'}
                    </Text>
                  )}
                </View>

                <View style={localStyles.trackTextWrap}>
                  <Text style={[localStyles.trackTitle, selected ? localStyles.trackTitleSelected : null]} numberOfLines={1}>
                    {track.name.replace(/\.[^.]+$/, '')}
                  </Text>

                  <Text style={[localStyles.trackMeta, selected ? localStyles.trackMetaSelected : null]} numberOfLines={1}>
                    {progress >= 100 ? 'Cached on speakers' : `Loading ${progress}%`}
                  </Text>
                </View>

                <Text style={[localStyles.moreIcon, selected ? localStyles.moreIconSelected : null]}>⋮</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={localStyles.actionsRow}>
        <PartyButton
          title="＋ Add"
          onPress={addTrack}
          variant="secondary"
          style={localStyles.actionButton}
        />

        <PartyButton
          title="⌫ Remove"
          onPress={removeSelectedTrack}
          variant="secondary"
          style={localStyles.actionButton}
        />
      </View>

      <View style={localStyles.nowPlayingSpacing}>
      <SectionLabel>Now Playing</SectionLabel>

      <PartyCard style={localStyles.nowPlayingCard}>
        <NowPlayingArtwork
          title={nowPlayingTrack ? (nowPlayingMetadata.title || nowPlayingTrack.name) : 'Nothing playing'}
          artworkUri={nowPlayingTrack && selectedTrack?.id === nowPlayingTrack.id ? metadata.artworkUri : undefined}
        />

        <TrackInfo metadata={nowPlayingTrack ? nowPlayingMetadata : {title: 'Nothing playing', artist: '', album: ''}} />

        <View style={localStyles.progressRow}>
          <Text style={localStyles.timeText}>{playbackPositionText}</Text>

          <View style={localStyles.progressOuter}>
            <View
              style={[
                localStyles.progressInner,
                {
                  width: `${Math.max(4, Math.min(100, transferProgress || selectedTransfer))}%`,
                },
              ]}
            />
          </View>

          <Text style={localStyles.timeText}>--:--</Text>
        </View>

        <View style={localStyles.controlsRow}>
          <Text style={[localStyles.controlIcon, localStyles.disabledIcon]}>↭</Text>

          <TouchableOpacity onPress={selectPreviousTrack} activeOpacity={0.75}>
            <Text style={localStyles.controlIcon}>‹‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              localStyles.playButton,
              !selectedTrackReady && playbackState !== 'playing'
                ? localStyles.playButtonDisabled
                : null,
            ]}
            activeOpacity={0.8}
            disabled={!selectedTrackReady && playbackState !== 'playing'}
            onPress={onPlayPause}>
            <Text
              style={[
                localStyles.playButtonText,
                !selectedTrackReady && playbackState !== 'playing'
                  ? localStyles.playButtonTextDisabled
                  : null,
              ]}>
              {playbackState === 'playing' ? 'Ⅱ' : '▶'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={selectNextTrack} activeOpacity={0.75}>
            <Text style={localStyles.controlIcon}>››</Text>
          </TouchableOpacity>

          <Text style={[localStyles.controlIcon, localStyles.disabledIcon]}>↻</Text>
        </View>

        <Text style={localStyles.readyText}>
          {playbackState === 'playing'
            ? 'Playing on all speakers'
            : selectedTrack
              ? selectedTrackReady
                ? 'Selected track ready'
                : 'Selected track uploading...'
              : playlist.length > 0
                ? 'Playlist queued • select a track to play'
                : 'Add tracks to build the playlist'}
        </Text>

        <Text style={localStyles.statusText}>{nowPlayingText}</Text>
        <Text style={localStyles.statusText}>{transferProgressText}</Text>
      </PartyCard>

      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    gap: 16,
  },
  nowPlayingSpacing: {
    marginTop: 24,
  },
  nowPlayingCard: {
    padding: 18,
  },
  progressRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressOuter: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  progressInner: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: partyTheme.white,
  },
  timeText: {
    color: partyTheme.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  controlsRow: {
    marginTop: 28,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlIcon: {
    color: partyTheme.white,
    fontSize: 34,
    fontWeight: '800',
  },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: partyTheme.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  playButtonText: {
    color: partyTheme.black,
    fontSize: 32,
    fontWeight: '900',
  },
  playButtonTextDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
  disabledIcon: {
    opacity: 0.35,
  },
  readyText: {
    color: partyTheme.white,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusText: {
    color: partyTheme.muted,
    fontSize: 13,
    marginTop: 4,
  },
  sectionHeaderRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countText: {
    color: partyTheme.muted,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  playlistBox: {
    gap: 10,
  },
  emptyText: {
    color: partyTheme.muted,
    fontSize: 16,
    textAlign: 'center',
  },
  trackRow: {
    minHeight: 88,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: partyTheme.card,
    borderColor: partyTheme.border,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  trackRowSelected: {
    backgroundColor: partyTheme.white,
  },
  trackIndex: {
    color: partyTheme.white,
    fontSize: 24,
    fontWeight: '900',
    width: 28,
  },
  trackIndexSelected: {
    color: partyTheme.black,
  },
  trackArtworkMini: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: partyTheme.cardStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackArtworkImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  trackArtworkText: {
    color: partyTheme.white,
    fontSize: 22,
    fontWeight: '900',
  },
  trackArtworkTextSelected: {
    color: partyTheme.black,
  },
  trackTextWrap: {
    flex: 1,
  },
  trackTitle: {
    color: partyTheme.white,
    fontSize: 17,
    fontWeight: '900',
  },
  trackTitleSelected: {
    color: partyTheme.black,
  },
  trackMeta: {
    color: partyTheme.muted,
    fontSize: 14,
    marginTop: 3,
  },
  trackMetaSelected: {
    color: 'rgba(0,0,0,0.55)',
  },
  moreIcon: {
    color: partyTheme.muted,
    fontSize: 28,
    fontWeight: '900',
  },
  moreIconSelected: {
    color: 'rgba(0,0,0,0.55)',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 72,
  },
});
