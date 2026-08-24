import {useSyncExternalStore} from 'react';
import {TrackMetadata} from '../../types/TrackMetadata';

const EMPTY_METADATA: TrackMetadata = {
  title: '',
  artist: 'Unknown Artist',
  album: 'Unknown Album',
};

let currentMetadata: TrackMetadata = EMPTY_METADATA;
const listeners = new Set<() => void>();

export function setNowPlayingDisplayMetadata(metadata: TrackMetadata) {
  currentMetadata = metadata;
  listeners.forEach(listener => listener());
}

export function useNowPlayingDisplayMetadata() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentMetadata,
    () => currentMetadata,
  );
}
