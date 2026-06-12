import {NativeModules} from 'react-native';

export type NativeMetadataResult = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  artworkUri?: string | null;
  durationMs?: number | null;
};

type MetadataModuleType = {
  read: (uri: string) => Promise<NativeMetadataResult>;
};

const {MetadataModule} = NativeModules;

export default MetadataModule as MetadataModuleType | undefined;
