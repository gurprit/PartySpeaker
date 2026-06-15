import React from 'react';
import {
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
  playbackLevel?: number;
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
  const selectedTransfer = selectedTrack
    ? trackTransferStatus[selectedTrack.id] || 0
    : 0;

  return (
    <View style={localStyles.container}>
      <SectionLabel>Now Playing</SectionLabel>

      <PartyCard style={localStyles.nowPlayingCard}>
        <NowPlayingArtwork
          title={metadata.title || currentTrackName}
          artworkUri={metadata.artworkUri}
        />

        <TrackInfo metadata={metadata} />

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
          <Text style={localStyles.controlIcon}>↭</Text>
          <Text style={localStyles.controlIcon}>‹‹</Text>

          <TouchableOpacity style={localStyles.playButton} activeOpacity={0.8}>
            <Text style={localStyles.playButtonText}>Ⅱ</Text>
          </TouchableOpacity>

          <Text style={localStyles.controlIcon}>››</Text>
          <Text style={localStyles.controlIcon}>↻</Text>
        </View>

        <Text style={localStyles.statusText}>{nowPlayingText}</Text>
        <Text style={localStyles.statusText}>{transferProgressText}</Text>
      </PartyCard>

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
                  setCurrentTrackName(track.name);
                  addLog(`Selected track: ${track.name}`);
                  autoSyncAndTransfer(track, playlist, track.id);
                }}>
                <Text style={localStyles.trackIndex}>{index + 1}</Text>

                <View style={localStyles.trackArtworkMini}>
                  <Text style={localStyles.trackArtworkText}>
                    {track.name.trim()[0]?.toUpperCase() || '♪'}
                  </Text>
                </View>

                <View style={localStyles.trackTextWrap}>
                  <Text style={localStyles.trackTitle} numberOfLines={1}>
                    {track.name.replace(/\.[^.]+$/, '')}
                  </Text>

                  <Text style={localStyles.trackMeta} numberOfLines={1}>
                    {progress >= 100 ? 'Cached on speakers' : `Loading ${progress}%`}
                  </Text>
                </View>

                <Text style={localStyles.moreIcon}>⋮</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={localStyles.actionsRow}>
        <PartyButton
          title="＋  Add Track"
          onPress={addTrack}
          variant="secondary"
          style={localStyles.actionButton}
        />

        <PartyButton
          title="⌫  Remove Track"
          onPress={removeSelectedTrack}
          variant="secondary"
          style={localStyles.actionButton}
        />
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    gap: 16,
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
  playButtonText: {
    color: partyTheme.black,
    fontSize: 32,
    fontWeight: '900',
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
  trackArtworkMini: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: partyTheme.cardStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackArtworkText: {
    color: partyTheme.white,
    fontSize: 22,
    fontWeight: '900',
  },
  trackTextWrap: {
    flex: 1,
  },
  trackTitle: {
    color: partyTheme.white,
    fontSize: 17,
    fontWeight: '900',
  },
  trackMeta: {
    color: partyTheme.muted,
    fontSize: 14,
    marginTop: 3,
  },
  moreIcon: {
    color: partyTheme.muted,
    fontSize: 28,
    fontWeight: '900',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
  },
});
