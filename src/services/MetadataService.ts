import MetadataNative from '../native/MetadataNative';
import {TrackMetadata} from '../types/TrackMetadata';

export default class MetadataService {
  static async getMetadata(
    trackName: string,
    trackUri?: string,
  ): Promise<TrackMetadata> {
    const fallback = MetadataService.fromFilename(trackName);

    if (!trackUri || !MetadataNative) {
      return fallback;
    }

    try {
      const nativeMetadata = await MetadataNative.read(trackUri);

      return {
        title: nativeMetadata.title?.trim() || fallback.title,
        artist: nativeMetadata.artist?.trim() || fallback.artist,
        album: nativeMetadata.album?.trim() || fallback.album,
        artworkUri: nativeMetadata.artworkUri || undefined,
        durationMs: nativeMetadata.durationMs || undefined,
      };
    } catch (error) {
      console.warn('Metadata read failed:', error);
      return fallback;
    }
  }

  private static fromFilename(trackName: string): TrackMetadata {
    const cleanName = MetadataService.cleanFilename(trackName);
    const parsed = MetadataService.parseArtistAndTitle(cleanName);

    return {
      title: parsed.title,
      artist: parsed.artist,
      album: 'Unknown Album',
      artworkUri: undefined,
      durationMs: undefined,
    };
  }

  private static cleanFilename(trackName: string): string {
    return trackName
      .replace(/\.[^.]+$/, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static parseArtistAndTitle(cleanName: string): {
    artist: string;
    title: string;
  } {
    const separators = [' - ', ' – ', ' — ', ' | '];

    for (const separator of separators) {
      if (cleanName.includes(separator)) {
        const [artistPart, ...titleParts] = cleanName.split(separator);
        const artist = artistPart.trim();
        const title = titleParts.join(separator).trim();

        if (artist && title) {
          return {artist, title};
        }
      }
    }

    return {
      artist: 'Unknown Artist',
      title: cleanName || 'Unknown Track',
    };
  }
}
