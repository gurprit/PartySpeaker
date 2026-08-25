import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  Modal,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

const {PartyStorage} = NativeModules;

type StorageInfo = {
  speakerCacheBytes: number;
  speakerCacheFiles: number;
  driveCacheBytes: number;
  driveCacheFiles: number;
  totalBytes: number;
  totalFiles: number;
};

const EMPTY_INFO: StorageInfo = {
  speakerCacheBytes: 0,
  speakerCacheFiles: 0,
  driveCacheBytes: 0,
  driveCacheFiles: 0,
  totalBytes: 0,
  totalFiles: 0,
};

function formatBytes(bytes: number): string {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(
      value < 10 * 1024 * 1024 ? 1 : 0,
    )} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type StorageButtonProps = {
  style?: ViewStyle;
};

export function StorageButton({style}: StorageButtonProps) {
  const [info, setInfo] = useState<StorageInfo>(EMPTY_INFO);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);

  const refresh = useCallback(async (showLoading = true) => {
    if (!PartyStorage?.getTemporaryStorageInfo) return;
    if (showLoading) setLoading(true);
    try {
      const result = await PartyStorage.getTemporaryStorageInfo();
      setInfo({
        speakerCacheBytes: Number(result?.speakerCacheBytes) || 0,
        speakerCacheFiles: Number(result?.speakerCacheFiles) || 0,
        driveCacheBytes: Number(result?.driveCacheBytes) || 0,
        driveCacheFiles: Number(result?.driveCacheFiles) || 0,
        totalBytes: Number(result?.totalBytes) || 0,
        totalFiles: Number(result?.totalFiles) || 0,
      });
    } catch {
      // Storage UI must never interfere with playback.
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(false);

    // Keep the visible size current as host/Drive downloads land on the phone.
    const timer = setInterval(() => refresh(false), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const open = async () => {
    setVisible(true);
    await refresh(true);
  };

  const purge = () => {
    Alert.alert(
      'Delete temporary audio files?',
      'This removes tracks downloaded to this phone for PartySpeaker and temporary Google Drive audio. The playlist itself is not deleted, but tracks will need to be downloaded again before they can play on this device.\n\nStop playback before clearing files.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete files',
          style: 'destructive',
          onPress: async () => {
            if (!PartyStorage?.purgeTemporaryFiles || purging) return;
            setPurging(true);
            try {
              const result = await PartyStorage.purgeTemporaryFiles();
              const freedBytes = Number(result?.freedBytes) || 0;
              await refresh(false);
              Alert.alert(
                'Temporary files cleared',
                `Freed ${formatBytes(freedBytes)} of storage.`,
              );
            } catch (error) {
              Alert.alert('Could not clear temporary files', String(error));
            } finally {
              setPurging(false);
            }
          },
        },
      ],
    );
  };

  if (!PartyStorage) return null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.82}
        style={[styles.inlineButton, style]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`PartySpeaker storage ${formatBytes(info.totalBytes)}`}>
        <Text style={styles.inlineButtonText} numberOfLines={1}>
          Storage{info.totalBytes > 0 ? ` · ${formatBytes(info.totalBytes)}` : ''}
        </Text>
      </TouchableOpacity>

      <Modal
        transparent
        animationType="fade"
        visible={visible}
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.headerRow}>
              <View style={{flex: 1}}>
                <Text style={styles.eyebrow}>PARTYSPEAKER STORAGE</Text>
                <Text style={styles.title}>{formatBytes(info.totalBytes)}</Text>
                <Text style={styles.subtitle}>
                  {info.totalFiles} temporary {info.totalFiles === 1 ? 'file' : 'files'} on this device
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setVisible(false)}>
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.breakdown}>
              <View style={styles.storageRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.rowTitle}>Speaker cache</Text>
                  <Text style={styles.rowDescription}>
                    Tracks downloaded from a PartySpeaker host
                  </Text>
                </View>
                <View style={styles.valueWrap}>
                  <Text style={styles.rowValue}>
                    {formatBytes(info.speakerCacheBytes)}
                  </Text>
                  <Text style={styles.fileCount}>{info.speakerCacheFiles} files</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.storageRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.rowTitle}>Google Drive temp</Text>
                  <Text style={styles.rowDescription}>
                    Drive tracks materialised for playback or transfer
                  </Text>
                </View>
                <View style={styles.valueWrap}>
                  <Text style={styles.rowValue}>{formatBytes(info.driveCacheBytes)}</Text>
                  <Text style={styles.fileCount}>{info.driveCacheFiles} files</Text>
                </View>
              </View>
            </View>

            <Text style={styles.note}>
              These files are disposable copies. Clearing them does not delete your original music or Google Drive files.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.refreshButton}
              onPress={() => refresh(true)}
              disabled={loading || purging}>
              <Text style={styles.refreshText}>
                {loading ? 'Checking storage…' : 'Refresh size'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.deleteButton,
                (purging || info.totalBytes <= 0) && styles.disabledButton,
              ]}
              onPress={purge}
              disabled={purging || info.totalBytes <= 0}>
              <Text style={styles.deleteText}>
                {purging
                  ? 'Deleting…'
                  : info.totalBytes > 0
                    ? `Delete ${formatBytes(info.totalBytes)} temporary files`
                    : 'No temporary files to delete'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// The old root-level floating storage control is intentionally disabled.
// Storage is now surfaced inline with Host/Node controls via PartyButton.
export default function StorageManager() {
  return null;
}

const styles = StyleSheet.create({
  inlineButton: {
    minHeight: 76,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#202020',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
  },
  inlineButtonText: {
    color: '#f3f3f3',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: 22,
    borderRadius: 30,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  title: {
    color: '#ffffff',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginTop: 5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
    marginTop: 3,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 29,
  },
  breakdown: {
    marginTop: 22,
    padding: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  rowDescription: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  valueWrap: {
    alignItems: 'flex-end',
  },
  rowValue: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  fileCount: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 10,
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 15,
  },
  note: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
  refreshButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  refreshText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteButton: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: '#ffffff',
  },
  disabledButton: {
    opacity: 0.35,
  },
  deleteText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
});
