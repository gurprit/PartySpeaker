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
  playbackPositionMs: number;
  transferProgressText: string;
  transferProgress: number;
  playlist: Track[];
  selectedTrackId: string | null;
  setSelectedTrackId: (trackId: string) => void;
  setCurrentTrackName: (name: string) => void;
  addLog: (message: string) => void;
  trackTransferStatus: Record<string, number | undefined>;
  addTrack: () => void;
  addFolder: () => void;
  removeTrackById: (trackId: string) => void;
  moveTrack: (trackId: string, direction: -1 | 1) => void;
  autoSyncAndTransfer: (
    track?: Track,
    playlistSnapshot?: Track[],
    selectedIdSnapshot?: string | null,
  ) => void;
  onTrackSelected: (track: Track) => void;
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
  playbackPositionMs,
  transferProgressText,
  transferProgress,
  playlist,
  selectedTrackId,
  setSelectedTrackId,
  setCurrentTrackName,
  addLog,
  trackTransferStatus,
  addTrack,
  addFolder,
  removeTrackById,
  moveTrack,
  autoSyncAndTransfer,
  onTrackSelected,
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
  const nowPlayingDurationMs = Number(nowPlayingTrack?.metadata?.durationMs || nowPlayingMetadata.durationMs || 0);
  const playbackProgressPercent = nowPlayingDurationMs > 0
    ? Math.max(0, Math.min(100, (playbackPositionMs / nowPlayingDurationMs) * 100))
    : 0;

  const formatDuration = (ms: number) => {
    if (!ms || ms < 0) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

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
                  addLog(`Selected track: ${track.name}`);
                  onTrackSelected(track);
                }}>
                <View style={localStyles.trackMainRow}>
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

                </View>

                <View style={localStyles.rowActions}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={index === 0}
                    onPress={event => {
                      event.stopPropagation();
                      moveTrack(track.id, -1);
                    }}>
                    <Text style={[localStyles.rowActionIcon, index === 0 ? localStyles.rowActionDisabled : null, selected ? localStyles.rowActionSelected : null]}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={index === playlist.length - 1}
                    onPress={event => {
                      event.stopPropagation();
                      moveTrack(track.id, 1);
                    }}>
                    <Text style={[localStyles.rowActionIcon, index === playlist.length - 1 ? localStyles.rowActionDisabled : null, selected ? localStyles.rowActionSelected : null]}>↓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={event => {
                      event.stopPropagation();
                      removeTrackById(track.id);
                    }}>
                    <Text style={[localStyles.binIcon, selected ? localStyles.rowActionSelected : null]}>⌫</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={localStyles.actionsRow}>
        <PartyButton
          title="＋ Track"
          onPress={addTrack}
          variant="secondary"
          style={localStyles.actionButton}
        />

        <PartyButton
          title="＋ Folder"
          onPress={addFolder}
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
                  width: `${playbackProgressPercent}%`,
                },
              ]}
            />
          </View>

          <Text style={localStyles.timeText}>{formatDuration(nowPlayingDurationMs)}</Text>
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
    minHeight: 104,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: partyTheme.card,
    borderColor: partyTheme.border,
    borderWidth: 1,
    gap: 10,
  },
  trackMainRow: {
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
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 18,
    paddingRight: 2,
  },
  rowActionIcon: {
    color: partyTheme.muted,
    fontSize: 22,
    fontWeight: '900',
    minWidth: 30,
    textAlign: 'center',
  },
  binIcon: {
    color: partyTheme.muted,
    fontSize: 22,
    fontWeight: '900',
    minWidth: 30,
    textAlign: 'center',
  },
  rowActionSelected: {
    color: 'rgba(0,0,0,0.62)',
  },
  rowActionDisabled: {
    opacity: 0.22,
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
