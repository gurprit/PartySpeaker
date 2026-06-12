import {TrackMetadata} from '../types/TrackMetadata';

export default class MetadataService {
  static async getMetadata(trackName: string): Promise<TrackMetadata> {
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
          return {
            artist,
            title,
          };
        }
      }
    }

    return {
      artist: 'Unknown Artist',
      title: cleanName || 'Unknown Track',
    };
  }
}
