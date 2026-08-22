import PanelHeader from './src/components/common/PanelHeader';
import NodeDelayCalibration from './src/components/node/NodeDelayCalibration';
import NodeStatusPanel from './src/components/node/NodeStatusPanel';
import PlaylistPanel from './src/components/host/PlaylistPanel';
import EventLog from './src/components/host/EventLog';
import NowPlayingArtwork from './src/components/visualiser/NowPlayingArtwork';
import TrackInfo from './src/components/visualiser/TrackInfo';
import PartyCard from './src/components/ui/PartyCard';
import PartyButton from './src/components/ui/PartyButton';
import SectionLabel from './src/components/ui/SectionLabel';
import {partyTheme} from './src/components/ui/PartyTheme';
import {TrackMetadata} from './src/types/TrackMetadata';
import MetadataService from './src/services/MetadataService';
import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  AppState,
  Image,
  NativeEventEmitter,
  NativeModules,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  TextInput,
  ScrollView,
} from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import dgram from 'react-native-udp';

type PartySocketBuffer = {
  _partyBuffer?: string;
};


type Mode = 'home' | 'host' | 'node';

type Track = {
  id: string;
  name: string;
  uri: string;
  metadata?: TrackMetadata;
};

type DiscoveredHost = {
  ip: string;
  port: number;
  lastSeen: number;
};

const {PartyAudio} = NativeModules;

const TCP_PORT = 5050;
const UDP_PORT = 5051;
const TRANSFER_PORT = 5052;
const START_BUFFER_MS = 5000;
const BLUETOOTH_LATENCY_COMPENSATION_MS = 0;
const DISCOVERY_MESSAGE = 'PARTYSPEAKER_HOST';
const TRANSFER_CHUNK_SIZE = 12000;
const TRANSFER_BATCH_SIZE = 4;
const TRANSFER_BATCH_PAUSE_MS = 12;
const TRACK_CACHE_TIMEOUT_MS = 120000;
const DRIFT_CHECK_INTERVAL_MS = 500;
const DRIFT_INITIAL_CHECK_MS = 180;
const DRIFT_HARD_RESYNC_MS = 60;
const DRIFT_INITIAL_RESYNC_MS = 35;
const DRIFT_LOG_THRESHOLD_MS = 30;
const DRIFT_FIRST_PLAY_RESYNC_MS = 15;
const CLOCK_CALIBRATION_SAMPLES = 5;
const CLOCK_CALIBRATION_SPACING_MS = 90;
const CLOCK_CALIBRATION_SETTLE_MS = 650;
const METADATA_HEAD_START_MS = 500;
const TRANSFER_ACK_EVERY_CHUNKS = 8;
const TRANSFER_ACK_TIMEOUT_MS = 8000;


export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [hostIp, setHostIp] = useState('127.0.0.1');
  const [status, setStatus] = useState('Idle');
  const [lastMessage, setLastMessage] = useState('None yet');
  const [nodeCount, setNodeCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [discoveredHost, setDiscoveredHost] = useState<DiscoveredHost | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [countdownText, setCountdownText] = useState('Not scheduled');
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [showNodeDebugTools, setShowNodeDebugTools] = useState(false);
  const [hostLocalIp, setHostLocalIp] = useState('Unknown');
  const [subnetPrefix, setSubnetPrefix] = useState('192.168.0');
  const [partyCode, setPartyCode] = useState('');
  const [playlistSyncedNodeCount, setPlaylistSyncedNodeCount] = useState(0);
  const [lastPlaylistSyncTime, setLastPlaylistSyncTime] = useState('Never');

  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [currentTrackName, setCurrentTrackName] = useState('None');

  const [currentTrackMetadata, setCurrentTrackMetadata] = useState<TrackMetadata>({
    title: '',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
  });
  const [transferProgressText, setTransferProgressText] = useState('No transfer yet');
  const [transferProgress, setTransferProgress] = useState(0);
  const [trackTransferStatus, setTrackTransferStatus] = useState<Record<string, number>>({});
  const [hostClockOffsetMs, setHostClockOffsetMs] = useState(0);
  const [playbackPositionText, setPlaybackPositionText] = useState('0:00');
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0);
  const [nowPlayingText, setNowPlayingText] = useState('Nothing playing');
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [nowPlayingTrackId, setNowPlayingTrackId] = useState<string | null>(null);
  const [nodePlaybackDelayMs, setNodePlaybackDelayMs] = useState(0);
  const hostClockOffsetRef = useRef(0);
  const nodePlaybackDelayRef = useRef(0);
  const bestClockSampleRef = useRef<{rttMs: number; offsetMs: number} | null>(null);

  const serverRef = useRef<any>(null);
  const transferServerRef = useRef<any>(null);
  const clientsRef = useRef<any[]>([]);
  const transferClientsRef = useRef<any[]>([]);
  const clientRef = useRef<any>(null);
  const transferClientRef = useRef<any>(null);
  const udpHostRef = useRef<any>(null);
  const broadcastTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);
  const playbackUiTimerRef = useRef<any>(null);
  const nowPlayingBroadcastTimerRef = useRef<any>(null);
  const nodeHeartbeatTimerRef = useRef<any>(null);
  const nodeDriftTimerRef = useRef<any>(null);
  const nodeReconnectTimerRef = useRef<any>(null);
  const nodeReconnectAttemptRef = useRef(0);
  const nodeReconnectScheduledRef = useRef(false);
  const nodeManualDisconnectRef = useRef(false);
  const lastHostIpRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const nowPlayingRef = useRef<{trackId: string; trackName: string; startedAtHostMs: number} | null>(null);
  const currentlyPlayingTrackRef = useRef<string | null>(null);
  const transferBuffersRef = useRef<Record<string, {name: string; chunks: string[]}>>({});
  const cachedTracksRef = useRef<Record<string, string[]>>({});
  const nodeCachedTrackIdsRef = useRef<Set<string>>(new Set());
  const activeTransferIdsRef = useRef<Set<string>>(new Set());
  const trackNodeProgressRef = useRef<Record<string, Record<string, number>>>({});
  const playlistRef = useRef<Track[]>([]);
  const selectedTrackIdRef = useRef<string | null>(null);
  const transferAckRef = useRef<Record<string, number>>({});
  const autoAdvancedTrackRef = useRef<string | null>(null);
  const pendingScheduledPlaybackRef = useRef<{trackId: string; targetTimeMs: number} | null>(null);
  const strictPrepareTransactionRef = useRef<string | null>(null);
  const strictPreparedNodesRef = useRef<Set<string>>(new Set());
  const preloadQueueRef = useRef<Track[]>([]);
  const preloadQueueRunningRef = useRef(false);

  useEffect(() => {
    refreshHostAddress();
  }, []);

  useEffect(() => {
    hostClockOffsetRef.current = hostClockOffsetMs;
  }, [hostClockOffsetMs]);

  useEffect(() => {
    nodePlaybackDelayRef.current = nodePlaybackDelayMs;
  }, [nodePlaybackDelayMs]);

  useEffect(() => {
    const emitter = new NativeEventEmitter(PartyAudio);
    const subscription = emitter.addListener('TrackDownloadProgress', (event: any) => {
      const trackId = String(event?.trackId || '');
      const percent = Math.max(1, Math.min(99, Math.round(Number(event?.percent) || 1)));
      if (!trackId) return;

      if (nodeCachedTrackIdsRef.current.has(trackId)) {
        setTrackProgress(trackId, 100);
        return;
      }

      setTrackProgress(trackId, percent);

      if (mode === 'node' && isSocketUsable(clientRef.current)) {
        writeSocket(clientRef.current, `TRACK_DOWNLOAD_PROGRESS|${trackId}|${percent}`);
      }
    });

    return () => subscription.remove();
  }, [mode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (mode === 'host' && (previousState === 'background' || previousState === 'inactive') && nextState === 'active') {
        clientsRef.current = clientsRef.current.filter(isSocketUsable);
        setNodeCount(clientsRef.current.length);
        activeTransferIdsRef.current.clear();
        addLog('Host resumed; waiting for speakers to reconnect before retrying transfer');

        setTimeout(() => {
          syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);
          preloadPlaylistToNodes(playlistRef.current);
        }, 1500);
        return;
      }

      if (mode !== 'node') return;

      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {
        addLog('Node returned to foreground; requesting live resync');
        stopNodeDriftMonitor();
        currentlyPlayingTrackRef.current = null;

        if (isSocketUsable(clientRef.current)) {
          writeSocket(clientRef.current, 'NODE_RESUMED');
          writeSocket(
            clientRef.current,
            `NODE_CACHE_STATE|${JSON.stringify(Array.from(nodeCachedTrackIdsRef.current))}`,
          );
        }
      }

      if (nextState === 'background' || nextState === 'inactive') {
        addLog('Node moved to background');
      }
    });

    return () => subscription.remove();
  }, [mode]);

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString();
    setLog(previous => [`${time}  ${message}`, ...previous].slice(0, 14));
  };

  const isSocketUsable = (socket: any) => {
    return Boolean(socket) && socket.destroyed !== true && socket.writable !== false;
  };

  const pruneHostSocket = (socket: any, reason = 'socket unavailable') => {
    const before = clientsRef.current.length;
    clientsRef.current = clientsRef.current.filter(item => item !== socket && isSocketUsable(item));

    if (clientsRef.current.length !== before) {
      setNodeCount(clientsRef.current.length);
      addLog(`Pruned speaker (${reason}); ${clientsRef.current.length} connected`);
    }
  };

  const writeSocket = (socket: any, message: string) => {
    if (!isSocketUsable(socket)) {
      pruneHostSocket(socket, 'write skipped: closed');
      return false;
    }

    try {
      socket.write(`${message}\n`);
      return true;
    } catch (error) {
      pruneHostSocket(socket, `write failed: ${String(error)}`);
      addLog(`Socket write ignored: ${String(error)}`);
      return false;
    }
  };

  const refreshHostAddress = async () => {
    try {
      const ip = await PartyAudio.getLocalIpAddress();
      setHostLocalIp(ip || 'Unknown');

      if (ip && typeof ip === 'string' && ip.includes('.')) {
        const parts = ip.split('.');

        if (parts.length === 4) {
          const detectedPrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;

          // Android emulator usually reports 10.0.2.x, but the real host phone
          // is on the physical LAN. Keep our known working LAN prefix for emulator testing.
          if (detectedPrefix === '10.0.2') {
            setSubnetPrefix('192.168.0');
          } else {
            setSubnetPrefix(detectedPrefix);
          }

          setPartyCode(parts[3]);
        }
      }

      return ip;
    } catch (error) {
      addLog(`Could not get host IP: ${String(error)}`);
      return 'Unknown';
    }
  };

  const formatMs = (ms: number) => {
    const safeMs = Math.max(0, ms);
    const totalSeconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const getNodeHostNowMs = () => Date.now() + hostClockOffsetRef.current;

  const getPlaybackDelayCompensationMs = () => {
    return nodePlaybackDelayRef.current;
  };

  const startPlaybackUiClock = (trackName: string, startedAtHostMs: number) => {
    if (playbackUiTimerRef.current) {
      clearInterval(playbackUiTimerRef.current);
    }

    setNowPlayingText(trackName);

    playbackUiTimerRef.current = setInterval(() => {
      const hostNow = mode === 'host' ? Date.now() : getNodeHostNowMs();
      const positionMs = Math.max(0, hostNow - startedAtHostMs);
      setPlaybackPositionMs(positionMs);
      setPlaybackPositionText(formatMs(positionMs));
    }, 500);
  };

  const stopNodeDriftMonitor = () => {
    if (nodeDriftTimerRef.current) {
      clearInterval(nodeDriftTimerRef.current);
      nodeDriftTimerRef.current = null;
    }
  };

  const correctNodePlaybackDrift = async (label = 'periodic', thresholdMs = DRIFT_HARD_RESYNC_MS) => {
    if (mode !== 'node' || appStateRef.current !== 'active') return;
    if (!nowPlayingRef.current || !currentlyPlayingTrackRef.current) return;

    try {
      const actualPosition = Number(await PartyAudio.getCurrentPlaybackPosition());
      if (!Number.isFinite(actualPosition) || actualPosition < 0) return;

      const expectedPosition = Math.max(
        0,
        getNodeHostNowMs() - nowPlayingRef.current.startedAtHostMs + getPlaybackDelayCompensationMs(),
      );
      const driftMs = actualPosition - expectedPosition;

      if (Math.abs(driftMs) >= DRIFT_LOG_THRESHOLD_MS) {
        addLog(`Playback drift (${label}): ${Math.round(driftMs)}ms`);
      }

      const resyncThreshold = label === 'initial'
        ? DRIFT_INITIAL_RESYNC_MS
        : DRIFT_HARD_RESYNC_MS;

      if (Math.abs(driftMs) >= resyncThreshold) {
        await PartyAudio.seekCurrentPlayback(expectedPosition);
        addLog(`Playback resynced (${label}) by ${Math.round(-driftMs)}ms`);
      }
    } catch (error) {
      addLog(`Drift check skipped: ${String(error)}`);
    }
  };

  const startNodeDriftMonitor = () => {
    stopNodeDriftMonitor();

    [DRIFT_INITIAL_CHECK_MS, 420, 850, 1400].forEach((delayMs, index) => {
      setTimeout(() => {
        correctNodePlaybackDrift(`startup-${index + 1}`, DRIFT_FIRST_PLAY_RESYNC_MS);
      }, delayMs);
    });

    nodeDriftTimerRef.current = setInterval(() => {
      correctNodePlaybackDrift('periodic', DRIFT_HARD_RESYNC_MS);
    }, DRIFT_CHECK_INTERVAL_MS);
  };

  const stopPlaybackUiClock = () => {
    if (playbackUiTimerRef.current) {
      clearInterval(playbackUiTimerRef.current);
      playbackUiTimerRef.current = null;
    }

    stopNodeDriftMonitor();
    currentlyPlayingTrackRef.current = null;
    setPlaybackPositionMs(0);
    setPlaybackPositionText('0:00');
    setNowPlayingText('Nothing playing');
    setPlaybackState('idle');
  };

  const sendTimeSyncToNode = (socket: any) => {
    writeSocket(socket, `SYNC_TIME|${Date.now()}`);
  };

  const calibrateNodeClocksBeforePlayback = async () => {
    // Never reuse an old "best" sample. Wi-Fi scheduling and device clocks can
    // shift while the picker/background cycle is happening. Every Play gets a
    // fresh calibration window.
    bestClockSampleRef.current = null;
    const liveSockets = clientsRef.current.filter(isSocketUsable);
    if (liveSockets.length === 0) return;

    // The useful best-sample state lives on each node, not on the host. Reset
    // it explicitly so every Play uses a genuinely fresh calibration window.
    liveSockets.forEach(socket => writeSocket(socket, 'SYNC_RESET'));
    await new Promise<void>(resolve => setTimeout(resolve, 80));

    addLog(`Clock calibration burst: ${CLOCK_CALIBRATION_SAMPLES} samples`);

    for (let sample = 0; sample < CLOCK_CALIBRATION_SAMPLES; sample += 1) {
      const requestId = `${Date.now()}-${sample}-${Math.random()}`;
      liveSockets.forEach(socket => {
        writeSocket(socket, `SYNC_REQUEST|${requestId}`);
      });

      if (sample < CLOCK_CALIBRATION_SAMPLES - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, CLOCK_CALIBRATION_SPACING_MS));
      }
    }

    await new Promise<void>(resolve => setTimeout(resolve, CLOCK_CALIBRATION_SETTLE_MS));
  };

  const broadcastNowPlaying = () => {
    if (!nowPlayingRef.current || clientsRef.current.length === 0) {
      return;
    }

    const payload = {
      ...nowPlayingRef.current,
      hostNowMs: Date.now(),
    };

    clientsRef.current = clientsRef.current.filter(isSocketUsable);
    setNodeCount(clientsRef.current.length);
    clientsRef.current.forEach(socket => {
      writeSocket(socket, `NOW_PLAYING|${JSON.stringify(payload)}`);
    });
  };

  const getSelectedTrack = () => {
    return playlist.find(track => track.id === selectedTrackId) || null;
  };

  const setTrackProgress = (trackId: string, percent: number) => {
    setTrackTransferStatus(previous => ({
      ...previous,
      [trackId]: Math.max(0, Math.min(100, percent)),
    }));
  };

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId]);

  const getLatestSelectedTrack = () => {
    const id = selectedTrackIdRef.current;
    return id ? playlistRef.current.find(track => track.id === id) || null : null;
  };

  const preloadPlaylistToNodes = (tracksSnapshot = playlistRef.current) => {
    // Folder imports can contain dozens of songs. Queue them instead of firing
    // every native download at once, which makes the phones and Wi-Fi fight over
    // bandwidth and leaves progress states looking chaotic.
    tracksSnapshot.forEach(track => {
      const alreadyQueued = preloadQueueRef.current.some(item => item.id === track.id);
      if (!alreadyQueued && !isTrackCachedOnAllNodes(track.id)) {
        preloadQueueRef.current.push(track);
      }
    });

    if (preloadQueueRunningRef.current) return;
    preloadQueueRunningRef.current = true;

    const runQueue = async () => {
      try {
        while (preloadQueueRef.current.length > 0) {
          const track = preloadQueueRef.current.shift();
          if (!track || isTrackCachedOnAllNodes(track.id)) continue;

          addLog(`Queue upload starting: ${track.name}`);
          activeTransferIdsRef.current.delete(track.id);
          await transferSelectedTrackToNodes(track);

          try {
            await waitForTrackCachedOnAllNodes(track);
            addLog(`Queue upload complete: ${track.name}`);
          } catch (error) {
            addLog(`Queue upload timed out/skipped: ${track.name} (${String(error)})`);
          }
        }
      } finally {
        preloadQueueRunningRef.current = false;

        // A reconnect or another folder import may have appended work while the
        // previous item was finishing. Pick it up automatically.
        if (preloadQueueRef.current.length > 0) {
          preloadPlaylistToNodes([]);
        }
      }
    };

    runQueue();
  };

  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {
    // Control-plane messages go first so playlist/metadata updates are never
    // trapped behind megabytes of audio data in the same TCP socket.
    setTimeout(() => {
      if (playlistSnapshot) {
        syncPlaylistSnapshotToNodes(
          playlistSnapshot,
          selectedIdSnapshot === undefined ? selectedTrackId : selectedIdSnapshot,
        );
      } else {
        syncPlaylistToNodes();
      }
    }, 50);

    if (track) {
      setTimeout(() => {
        transferSelectedTrackToNodes(track);
      }, METADATA_HEAD_START_MS);
    }
  };

  const addTrack = async () => {
    try {
      const result = await PartyAudio.pickAudioFile();
      const trackName = result.name || 'Selected audio';
      const metadata = await MetadataService.getMetadata(trackName, result.uri);

      const track: Track = {
        id: `${Date.now()}-${Math.random()}`,
        name: trackName,
        uri: result.uri,
        metadata,
      };

      await PartyAudio.registerTrackForTransfer(track.id, track.uri);

      const nextPlaylist = [...playlistRef.current, track];
      playlistRef.current = nextPlaylist;
      setPlaylist(nextPlaylist);
      setPlaybackState(previous => previous);
      setTrackProgress(track.id, 0);
      setTransferProgress(0);
      setTransferProgressText(`Waiting for speakers: ${track.name}`);
      addLog(`Added track + metadata: ${track.name}`);

      // Metadata/playlist goes out first on the tiny control channel.
      syncPlaylistSnapshotToNodes(nextPlaylist, selectedTrackIdRef.current);

      // Give the control message a moment to render, then ask nodes to download
      // the binary file natively. No Base64 crosses the JS bridge.
      setTimeout(() => transferSelectedTrackToNodes(track), 150);
    } catch (error) {
      addLog(`Add track cancelled/error: ${String(error)}`);
    }
  };

  const addFolder = async () => {
    try {
      const picked = await PartyAudio.pickAudioFolder();
      const items = Array.isArray(picked) ? picked : [];
      if (items.length === 0) {
        Alert.alert('No music found', 'No supported audio files were found in that folder.');
        return;
      }

      addLog(`Importing ${items.length} track(s) from folder`);
      const imported: Track[] = [];

      for (const item of items) {
        const name = String(item?.name || 'Selected audio');
        const uri = String(item?.uri || '');
        if (!uri) continue;

        try {
          const metadata = await MetadataService.getMetadata(name, uri);
          const track: Track = {
            id: `${Date.now()}-${Math.random()}`,
            name,
            uri,
            metadata,
          };
          await PartyAudio.registerTrackForTransfer(track.id, track.uri);
          imported.push(track);
        } catch (error) {
          addLog(`Skipped ${name}: ${String(error)}`);
        }
      }

      if (imported.length === 0) return;

      const nextPlaylist = [...playlistRef.current, ...imported];
      playlistRef.current = nextPlaylist;
      setPlaylist(nextPlaylist);
      imported.forEach(track => setTrackProgress(track.id, 0));
      syncPlaylistSnapshotToNodes(nextPlaylist, selectedTrackIdRef.current);
      setTimeout(() => preloadPlaylistToNodes(imported), 250);
      setStatus(`Added ${imported.length} track(s) from folder`);
      addLog(`Folder import complete: ${imported.length} track(s)`);
    } catch (error) {
      addLog(`Folder import cancelled/error: ${String(error)}`);
    }
  };

  const removeSelectedTrack = () => {
    const selected = getSelectedTrack();

    if (!selected) {
      addLog('No selected track to remove');
      return;
    }

    const nextPlaylist = playlist.filter(track => track.id !== selected.id);
    setPlaylist(nextPlaylist);

    if (nextPlaylist.length > 0) {
      setSelectedTrackId(nextPlaylist[0].id);
      setCurrentTrackName(nextPlaylist[0].name);
      setPlaybackState('idle');
    } else {
      setSelectedTrackId(null);
      setCurrentTrackName('None');
      setPlaybackState('idle');
    }

    addLog(`Removed track: ${selected.name}`);
    setTrackTransferStatus(previous => {
      const updated = {...previous};
      delete updated[selected.id];
      return updated;
    });
    setTimeout(() => {
      syncPlaylistSnapshotToNodes(nextPlaylist, nextPlaylist[0]?.id || null);
    }, 100);
  };

  const playSelectedTrackLocal = async () => {
    const selected = getSelectedTrack();

    if (!selected) {
      Alert.alert('No track selected', 'Add and select a track first.');
      return;
    }

    try {
      await PartyAudio.playAudioUri(selected.uri);
      setCurrentTrackName(selected.name);
      addLog(`Playing locally: ${selected.name}`);
    } catch (error) {
      addLog(`Play selected track error: ${String(error)}`);
      Alert.alert('Playback error', String(error));
    }
  };

  const stopSelectedTrackLocal = async () => {
    try {
      await PartyAudio.stopAudioUri();
      addLog('Stopped local track');
    } catch (error) {
      addLog(`Stop track error: ${String(error)}`);
    }
  };

  const playLocalBeep = async () => {
    try {
      await PartyAudio.playBeep();
      addLog('Played local beep');
    } catch (error) {
      addLog(`Beep error: ${String(error)}`);
      Alert.alert('Beep error', String(error));
    }
  };

  const playLocalTestTone = async () => {
    try {
      await PartyAudio.playTestTone();
      addLog('Played local test tone');
    } catch (error) {
      addLog(`Test tone error: ${String(error)}`);
      Alert.alert('Test tone error', String(error));
    }
  };

  const playLocalPartyClip = async () => {
    try {
      await PartyAudio.playPartyClip();
      addLog('Played local party clip');
    } catch (error) {
      addLog(`Party clip error: ${String(error)}`);
      Alert.alert('Party clip error', String(error));
    }
  };

  const playPartyClipAt = (targetTimeMs: number) => {
    const nodeHostNow = getNodeHostNowMs();
    const delay = Math.max(0, targetTimeMs - nodeHostNow + getPlaybackDelayCompensationMs());
    addLog(`Clip scheduled in ${delay}ms`);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    const updateCountdown = () => {
      const remainingMs = targetTimeMs - Date.now();

      if (remainingMs <= 0) {
        setCountdownText('Playing now');

        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }

        setTimeout(() => setCountdownText('Not scheduled'), 2000);
        return;
      }

      setCountdownText(`Playing in ${Math.ceil(remainingMs / 1000)}s`);
    };

    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 200);

    setTimeout(() => {
      playLocalPartyClip();
    }, delay);
  };

  const startHostServer = async () => {
    await refreshHostAddress();
    await PartyAudio.startTrackTransferServer(TRANSFER_PORT);

    if (serverRef.current) {
      setStatus('Host server already running');
      return;
    }

    const server = TcpSocket.createServer(socket => {
      clientsRef.current.push(socket);
      setNodeCount(clientsRef.current.length);
      setStatus('Node connected');
      addLog('Node connected');

      writeSocket(socket, 'WELCOME_FROM_HOST');
      sendTimeSyncToNode(socket);

      setTimeout(() => {
        syncPlaylistSnapshotToNodes(playlistRef.current, selectedTrackIdRef.current);
        broadcastNowPlaying();

        preloadPlaylistToNodes(playlistRef.current);
      }, 500);

      socket.on('data', data => {
        (socket as unknown as PartySocketBuffer)._partyBuffer = `${(socket as unknown as PartySocketBuffer)._partyBuffer || ''}${data.toString()}`;
        const lines = ((socket as unknown as PartySocketBuffer)._partyBuffer || '').split('\n');
        (socket as unknown as PartySocketBuffer)._partyBuffer = lines.pop() || '';

        lines.forEach((message: string) => {
          if (!message.trim()) return;

          const isTransferChunk = message.startsWith('TRACK_TRANSFER_CHUNK|');

          if (!isTransferChunk) {
            setLastMessage(message);
            addLog(`Node says: ${message}`);
          }

          if (message === "I'M_ALIVE") {
            return;
          }

          if (message.startsWith('SYNC_PING|')) {
            const parts = message.split('|');
            const requestId = parts[1];
            const clientSentMs = Number(parts[2]);
            if (requestId && Number.isFinite(clientSentMs)) {
              const hostReceivedMs = Date.now();
              const hostSentMs = Date.now();
              writeSocket(
                socket,
                `SYNC_PONG|${requestId}|${clientSentMs}|${hostReceivedMs}|${hostSentMs}`,
              );
            }
            return;
          }

          if (message === 'PLAYLIST_RECEIVED') {
            setPlaylistSyncedNodeCount(previous => previous + 1);
            addLog('Node confirmed playlist sync');
          }

          if (message === 'NODE_RESUMED') {
            addLog('Speaker resumed; sending fresh clock + playback state');
            sendTimeSyncToNode(socket);

            const playlistPayload = {
              tracks: playlistRef.current.map(track => ({
                id: track.id,
                name: track.name,
                metadata: track.metadata,
              })),
              selectedTrackId: selectedTrackIdRef.current,
            };

            writeSocket(socket, `PLAYLIST_SYNC|${JSON.stringify(playlistPayload)}`);

            if (nowPlayingRef.current) {
              writeSocket(
                socket,
                `NOW_PLAYING|${JSON.stringify({
                  ...nowPlayingRef.current,
                  hostNowMs: Date.now(),
                })}`,
              );
            }
            return;
          }

          if (message.startsWith('NODE_CACHE_STATE|')) {
            try {
              const cachedIds = JSON.parse(message.replace('NODE_CACHE_STATE|', ''));
              const key = socket.remoteAddress || 'unknown';
              cachedTracksRef.current[key] = Array.isArray(cachedIds) ? cachedIds : [];
              addLog(`Speaker cache restored: ${cachedTracksRef.current[key].length} track(s)`);

              const selected = getLatestSelectedTrack();
              if (selected) {
                const liveSockets = clientsRef.current.filter(isSocketUsable);
                const readyCount = liveSockets.filter(clientSocket => {
                  const clientKey = clientSocket.remoteAddress || 'unknown';
                  return cachedTracksRef.current[clientKey]?.includes(selected.id);
                }).length;

                if (liveSockets.length > 0 && readyCount === liveSockets.length) {
                  setTrackProgress(selected.id, 100);
                  setTransferProgress(100);
                  setTransferProgressText(`Ready: ${selected.name}`);
                  setStatus(`Ready on all speakers: ${selected.name}`);
                }
              }
            } catch (error) {
              addLog(`Invalid cache-state message: ${String(error)}`);
            }
            return;
          }

          if (message.startsWith('TRACK_DOWNLOAD_PROGRESS|')) {
            const [, trackId, rawPercent] = message.split('|');
            const percent = Math.max(1, Math.min(99, Math.round(Number(rawPercent) || 1)));
            const key = socket.remoteAddress || 'unknown';

            if (cachedTracksRef.current[key]?.includes(trackId)) {
              return;
            }

            if (!trackNodeProgressRef.current[trackId]) {
              trackNodeProgressRef.current[trackId] = {};
            }
            trackNodeProgressRef.current[trackId][key] = percent;

            const liveSockets = clientsRef.current.filter(isSocketUsable);
            const progressValues = liveSockets.map(clientSocket => {
              const clientKey = clientSocket.remoteAddress || 'unknown';
              return cachedTracksRef.current[clientKey]?.includes(trackId)
                ? 100
                : trackNodeProgressRef.current[trackId]?.[clientKey] || 0;
            });
            const allCached = progressValues.length > 0 && progressValues.every(value => value >= 100);
            const overallProgress = allCached
              ? 100
              : progressValues.length > 0
                ? Math.max(1, Math.min(99, Math.min(...progressValues)))
                : percent;

            setTrackProgress(trackId, overallProgress);
            if (selectedTrackIdRef.current === trackId) {
              setTransferProgress(overallProgress);
              setTransferProgressText(`Uploading to speakers: ${overallProgress}%`);
            }
            return;
          }

          if (message.startsWith('TRACK_PRIMED|')) {
            const [, transactionId, trackId] = message.split('|');
            if (transactionId && trackId && strictPrepareTransactionRef.current === transactionId) {
              const key = socket.remoteAddress || 'unknown';
              strictPreparedNodesRef.current.add(key);
              const liveSockets = clientsRef.current.filter(isSocketUsable);
              setStatus(`Preparing speakers: ${strictPreparedNodesRef.current.size}/${liveSockets.length} ready`);
              addLog(`Speaker primed: ${key} (${strictPreparedNodesRef.current.size}/${liveSockets.length})`);
            }
            return;
          }

          if (message.startsWith('TRACK_RECEIVED|')) {
            const parts = message.split('|');
            const trackId = parts[1];
            const trackName = parts[2] || '';

            const key = socket.remoteAddress || 'unknown';

            if (!cachedTracksRef.current[key]) {
              cachedTracksRef.current[key] = [];
            }

            if (!cachedTracksRef.current[key].includes(trackId)) {
              cachedTracksRef.current[key].push(trackId);
            }

            if (!trackNodeProgressRef.current[trackId]) {
              trackNodeProgressRef.current[trackId] = {};
            }
            trackNodeProgressRef.current[trackId][key] = 100;

            const liveSockets = clientsRef.current.filter(isSocketUsable);
            const cachedCount = liveSockets.filter(clientSocket => {
              const clientKey = clientSocket.remoteAddress || 'unknown';
              return cachedTracksRef.current[clientKey]?.includes(trackId);
            }).length;

            addLog(`Node cached track: ${trackName} (${cachedCount}/${liveSockets.length})`);

            const isSelectedTrack = selectedTrackIdRef.current === trackId;

            if (liveSockets.length > 0 && cachedCount === liveSockets.length) {
              activeTransferIdsRef.current.delete(trackId);
              setTrackProgress(trackId, 100);

              if (isSelectedTrack) {
                setTransferProgress(100);
                setTransferProgressText(`Ready: ${trackName}`);
                setStatus(`Ready on all speakers: ${trackName}`);
              }
            } else if (isSelectedTrack) {
              setTransferProgressText(`Caching ${trackName}: ${cachedCount}/${liveSockets.length} active speakers ready`);
            }
          }

          if (message.startsWith('TRACK_DOWNLOAD_FAILED|')) {
            const [, trackId, detail] = message.split('|');
            activeTransferIdsRef.current.delete(trackId);
            addLog(`Speaker download failed for ${trackId}: ${detail || 'unknown error'}`);
            if (selectedTrackIdRef.current === trackId) {
              setStatus('A speaker failed to download the track');
            }
          }

          if (message.startsWith('PLAY_TRACK_SCHEDULED|')) {
            const trackId = message.split('|')[1];
            addLog(`Node scheduled track playback: ${trackId}`);
          }
        });
      });

      socket.on('close', () => {
        activeTransferIdsRef.current.clear();
        clientsRef.current = clientsRef.current.filter(item => item !== socket);
        setNodeCount(clientsRef.current.length);
        setStatus('Node disconnected');
        addLog('Node disconnected');
      });

      (socket as any).on('error', (error: any) => {
        pruneHostSocket(socket, String(error));
        setStatus(`Socket error: ${String(error)}`);
        addLog(`Socket error: ${String(error)}`);
      });
    });

    server.listen({port: TCP_PORT, host: '0.0.0.0'}, () => {
      setStatus(`Host server running on port ${TCP_PORT}`);
      addLog(`Host server running on port ${TCP_PORT}`);
      startDiscoveryBroadcast();
    });

    server.on('error', error => {
      setStatus(`Server error: ${String(error)}`);
      addLog(`Server error: ${String(error)}`);
    });

    serverRef.current = server;
  };

  const startDiscoveryBroadcast = () => {
    if (udpHostRef.current) {
      return;
    }

    const socket = dgram.createSocket({type: 'udp4'});

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        addLog('Discovery broadcast started');

        broadcastTimerRef.current = setInterval(() => {
          const message = `${DISCOVERY_MESSAGE}|${TCP_PORT}`;

          socket.send(
            message,
            undefined,
            undefined,
            UDP_PORT,
            `${subnetPrefix}.255`,
            error => {
              if (error) {
                addLog(`Discovery send error: ${String(error)}`);
              }
            },
          );
        }, 2000);
      } catch (error) {
        addLog(`Discovery setup error: ${String(error)}`);
      }
    });

    (socket as any).on('error', (error: any) => {
      addLog(`UDP host error: ${String(error)}`);
    });

    udpHostRef.current = socket;
  };

  const stopDiscoveryBroadcast = () => {
    if (broadcastTimerRef.current) {
      clearInterval(broadcastTimerRef.current);
      broadcastTimerRef.current = null;
    }

    if (udpHostRef.current) {
      udpHostRef.current.close();
      udpHostRef.current = null;
    }

    addLog('Discovery broadcast stopped');
  };

  const scanSubnetForHost = async () => {
    if (isScanning) {
      return;
    }

    setIsScanning(true);
    setStatus('Scanning subnet for PartySpeaker host...');
    addLog(`Starting TCP subnet scan on ${subnetPrefix}.x`);

    let found = false;

    for (let i = 1; i <= 254; i++) {
      if (found) {
        break;
      }

      const ip = `${subnetPrefix}.${i}`;
      setStatus(`Scanning ${ip}:${TCP_PORT}`);

      await new Promise<void>(resolve => {
        let finished = false;

        const finish = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };

        const socket = TcpSocket.createConnection(
          {host: ip, port: TCP_PORT},
          () => {
            found = true;
            socket.destroy();

            setDiscoveredHost({ip, port: TCP_PORT, lastSeen: Date.now()});
            setHostIp(ip);
            setStatus(`Found host: ${ip}:${TCP_PORT}`);
            addLog(`Found host by TCP scan: ${ip}:${TCP_PORT}`);

            finish();
          },
        );

        socket.on('error', () => {
          socket.destroy();
          finish();
        });

        socket.on('timeout', () => {
          socket.destroy();
          finish();
        });

        setTimeout(() => {
          socket.destroy();
          finish();
        }, 300);
      });
    }

    if (!found) {
      setStatus('No PartySpeaker host found');
      addLog('TCP subnet scan finished. No host found.');
    }

    setIsScanning(false);
  };

  const stopHostServer = () => {
    stopDiscoveryBroadcast();

    clientsRef.current.forEach(socket => socket.destroy());
    clientsRef.current = [];
    setNodeCount(0);

    if (serverRef.current) {
      serverRef.current.close();
      serverRef.current = null;
    }

    PartyAudio.stopTrackTransferServer().catch(() => {});


    if (nowPlayingBroadcastTimerRef.current) {
      clearInterval(nowPlayingBroadcastTimerRef.current);
      nowPlayingBroadcastTimerRef.current = null;
    }

    nowPlayingRef.current = null;
    stopPlaybackUiClock();

    setStatus('Host server stopped');
    addLog('Host server stopped');
  };

  const sendMessageToNodes = (message: string) => {
    if (clientsRef.current.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    clientsRef.current.forEach(socket => {
      writeSocket(socket, message);
    });

    addLog(`Sent ${message} to ${clientsRef.current.length} node(s)`);
    setStatus(`${message} sent`);
  };

  const pauseAllSpeakers = () => {
    sendMessageToNodes('PAUSE_TRACK');
    stopSelectedTrackLocal();
    nowPlayingRef.current = null;
    stopPlaybackUiClock();

    if (nowPlayingBroadcastTimerRef.current) {
      clearInterval(nowPlayingBroadcastTimerRef.current);
      nowPlayingBroadcastTimerRef.current = null;
    }

    setPlaybackState('paused');
    setStatus('Pause sent to all speakers');
  };

  const selectTrackByOffset = (offset: number) => {
    if (playlist.length === 0) {
      return;
    }

    const currentIndex = playlist.findIndex(track => track.id === selectedTrackId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + offset + playlist.length) % playlist.length;
    const nextTrack = playlist[nextIndex];

    selectedTrackIdRef.current = nextTrack.id;
    setSelectedTrackId(nextTrack.id);
    addLog(`Selected track: ${nextTrack.name}`);
    autoSyncAndTransfer(nextTrack, playlist, nextTrack.id);

    setTimeout(() => {
      playSelectedTrackOnAllSpeakers(nextTrack);
    }, 1000);
  };

  useEffect(() => {
    if (mode !== 'host' || playbackState !== 'playing' || !nowPlayingTrackId) return;

    const currentIndex = playlistRef.current.findIndex(track => track.id === nowPlayingTrackId);
    if (currentIndex < 0) return;

    const current = playlistRef.current[currentIndex];
    const durationMs = Number(current.metadata?.durationMs || 0);
    if (!durationMs || playbackPositionMs < durationMs - 350) return;
    if (autoAdvancedTrackRef.current === current.id) return;

    autoAdvancedTrackRef.current = current.id;
    const nextTrack = playlistRef.current[currentIndex + 1];

    if (!nextTrack) {
      nowPlayingRef.current = null;
      setNowPlayingTrackId(null);
      setPlaybackState('idle');
      stopPlaybackUiClock();
      setStatus('Playlist finished');
      return;
    }

    selectedTrackIdRef.current = nextTrack.id;
    setSelectedTrackId(nextTrack.id);
    syncPlaylistSnapshotToNodes(playlistRef.current, nextTrack.id);
    setTimeout(() => playSelectedTrackOnAllSpeakers(nextTrack), 120);
  }, [mode, playbackState, nowPlayingTrackId, playbackPositionMs]);

  useEffect(() => {
    if (nowPlayingTrackId) autoAdvancedTrackRef.current = null;
  }, [nowPlayingTrackId]);

  const isTrackCachedOnAllNodes = (trackId: string) => {
    const liveSockets = clientsRef.current.filter(isSocketUsable);
    if (liveSockets.length === 0) {
      return false;
    }

    return liveSockets.every(socket => {
      const key = socket.remoteAddress || 'unknown';
      return cachedTracksRef.current[key]?.includes(trackId);
    });
  };

  const waitForTrackCachedOnAllNodes = async (track: Track, timeoutMs = TRACK_CACHE_TIMEOUT_MS) => {
    const startedAt = Date.now();

    while (!isTrackCachedOnAllNodes(track.id)) {
      const cachedCount = clientsRef.current.filter(socket => {
        const key = socket.remoteAddress || 'unknown';
        return cachedTracksRef.current[key]?.includes(track.id);
      }).length;

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for speakers to cache ${track.name} (${cachedCount}/${clientsRef.current.length} ready)`);
      }

      setStatus(`Caching ${track.name}: ${cachedCount}/${clientsRef.current.length} speakers ready`);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
    }
  };

  const playSelectedTrackOnAllSpeakers = async (trackOverride?: Track) => {
    const looksLikeTrack =
      trackOverride &&
      typeof trackOverride === 'object' &&
      typeof (trackOverride as any).id === 'string' &&
      typeof (trackOverride as any).name === 'string';

    const selected = looksLikeTrack ? trackOverride : getSelectedTrack();

    if (!selected) {
      Alert.alert('No track selected', 'Add and select a track first.');
      return;
    }

    if (clientsRef.current.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    if (!isTrackCachedOnAllNodes(selected.id)) {
      const readyCount = clientsRef.current.filter(socket => {
        const key = socket.remoteAddress || 'unknown';
        return cachedTracksRef.current[key]?.includes(selected.id);
      }).length;
      const message = `Still downloading to speakers (${readyCount}/${clientsRef.current.length} ready)`;
      addLog(message);
      setStatus(message);
      Alert.alert('Track still downloading', message);
      return;
    }

    await calibrateNodeClocksBeforePlayback();

    const liveSockets = clientsRef.current.filter(isSocketUsable);
    if (liveSockets.length === 0) {
      setStatus('No connected speakers');
      return;
    }

    // Phase 1: every speaker prepares/decodes the same cached track, but nobody
    // is allowed to play yet. This removes first-play decoder speed from sync.
    const transactionId = `${selected.id}-${Date.now()}-${Math.random()}`;
    strictPrepareTransactionRef.current = transactionId;
    strictPreparedNodesRef.current = new Set();
    setStatus(`Preparing speakers: 0/${liveSockets.length} ready`);

    const preparePayload = {
      id: selected.id,
      name: selected.name,
      transactionId,
    };

    liveSockets.forEach(socket => {
      writeSocket(socket, `PREPARE_TRACK|${JSON.stringify(preparePayload)}`);
    });

    // Prime the host as a speaker too. This promise resolves only once ExoPlayer
    // is STATE_READY, so the host participates in the same readiness barrier.
    try {
      await PartyAudio.primeAudioUri(selected.uri);
    } catch (error) {
      strictPrepareTransactionRef.current = null;
      setStatus('Host could not prepare track');
      Alert.alert('Playback preparation failed', String(error));
      return;
    }

    const prepareStartedAt = Date.now();
    const PREPARE_TIMEOUT_MS = 12000;

    while (true) {
      const currentSockets = clientsRef.current.filter(isSocketUsable);
      const allReady =
        currentSockets.length > 0 &&
        currentSockets.every(socket =>
          strictPreparedNodesRef.current.has(socket.remoteAddress || 'unknown'),
        );

      if (allReady) break;

      if (Date.now() - prepareStartedAt > PREPARE_TIMEOUT_MS) {
        const readyCount = currentSockets.filter(socket =>
          strictPreparedNodesRef.current.has(socket.remoteAddress || 'unknown'),
        ).length;
        strictPrepareTransactionRef.current = null;
        setStatus(`Playback cancelled: only ${readyCount}/${currentSockets.length} speakers became ready`);
        Alert.alert(
          'Speakers not ready',
          `Playback was not started because only ${readyCount} of ${currentSockets.length} speakers were ready.`,
        );
        return;
      }

      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }

    // Phase 2: once EVERY live node and the host are primed, give them a fresh
    // common start point. The 1.5s runway is only scheduling time now, not decode time.
    await calibrateNodeClocksBeforePlayback();
    const targetTimeMs = Date.now() + 1500;
    const startPayload = {
      id: selected.id,
      name: selected.name,
      transactionId,
      targetTimeMs,
    };

    nowPlayingRef.current = {
      trackId: selected.id,
      trackName: selected.name,
      startedAtHostMs: targetTimeMs,
    };
    setNowPlayingTrackId(selected.id);
    setCurrentTrackName(selected.name);
    if (selected.metadata) setCurrentTrackMetadata(selected.metadata);

    liveSockets.forEach(socket => {
      writeSocket(socket, `START_PRIMED_AT|${JSON.stringify(startPayload)}`);
    });

    try {
      await PartyAudio.startPrimedTrackAt(targetTimeMs);
    } catch (error) {
      addLog(`Host primed start error: ${String(error)}`);
    }

    strictPrepareTransactionRef.current = null;

    if (nowPlayingBroadcastTimerRef.current) {
      clearInterval(nowPlayingBroadcastTimerRef.current);
    }
    nowPlayingBroadcastTimerRef.current = setInterval(broadcastNowPlaying, 3000);

    startPlaybackUiClock(selected.name, targetTimeMs);
    setPlaybackState('playing');
    addLog(`Strict synchronized start: ${selected.name}`);
    setStatus('All speakers ready • synchronized start scheduled');
  };

  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {
    const selected = trackOverride || getLatestSelectedTrack();
    if (!selected || clientsRef.current.length === 0) return;

    const liveSockets = clientsRef.current.filter(isSocketUsable);
    const missingSockets = liveSockets.filter(socket => {
      const key = socket.remoteAddress || 'unknown';
      return !cachedTracksRef.current[key]?.includes(selected.id);
    });

    if (missingSockets.length === 0) {
      activeTransferIdsRef.current.delete(selected.id);
      setTrackProgress(selected.id, 100);
      if (selectedTrackIdRef.current === selected.id) {
        setTransferProgress(100);
        setTransferProgressText(`Ready: ${selected.name}`);
        setStatus(`Ready on all speakers: ${selected.name}`);
      }
      return;
    }

    if (activeTransferIdsRef.current.has(selected.id)) {
      addLog(`Transfer already active: ${selected.name}`);
      return;
    }

    activeTransferIdsRef.current.add(selected.id);
    await PartyAudio.registerTrackForTransfer(selected.id, selected.uri);
    const payload = {id: selected.id, name: selected.name};
    let successfulWrites = 0;
    missingSockets.forEach(socket => {
      if (writeSocket(socket, `DOWNLOAD_TRACK|${JSON.stringify(payload)}`)) {
        successfulWrites += 1;
      }
    });

    if (successfulWrites === 0) {
      activeTransferIdsRef.current.delete(selected.id);
      addLog(`Download command could not reach any speaker; retrying ${selected.name}`);
      setTimeout(() => transferSelectedTrackToNodes(selected), 1500);
      return;
    }

    setTrackProgress(selected.id, 1);
    if (selectedTrackIdRef.current === selected.id) {
      setTransferProgress(1);
      setTransferProgressText(`Downloading on ${missingSockets.length} speaker(s): ${selected.name}`);
      setStatus(`Waiting for ${missingSockets.length} speaker download(s)`);
    }
    addLog(`Native download requested: ${selected.name}`);
  };

  const syncPlaylistSnapshotToNodes = (tracksSnapshot: Track[], selectedIdSnapshot: string | null) => {
    if (clientsRef.current.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    const payload = {
      tracks: tracksSnapshot.map(track => ({
        id: track.id,
        name: track.name,
        metadata: track.metadata,
      })),
      selectedTrackId: selectedIdSnapshot,
    };

    const message = `PLAYLIST_SYNC|${JSON.stringify(payload)}`;

    setPlaylistSyncedNodeCount(0);
    setLastPlaylistSyncTime(new Date().toLocaleTimeString());

    clientsRef.current.forEach(socket => {
      writeSocket(socket, message);
    });

    addLog(`Auto-synced playlist to ${clientsRef.current.length} node(s)`);
    setStatus('Playlist synced');
  };

  const syncPlaylistToNodes = () => {
    if (clientsRef.current.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    const payload = {
      tracks: playlist.map(track => ({
        id: track.id,
        name: track.name,
        metadata: track.metadata,
      })),
      selectedTrackId,
    };

    const message = `PLAYLIST_SYNC|${JSON.stringify(payload)}`;

    setPlaylistSyncedNodeCount(0);
    setLastPlaylistSyncTime(new Date().toLocaleTimeString());

    clientsRef.current.forEach(socket => {
      writeSocket(socket, message);
    });

    addLog(`Sent playlist sync to ${clientsRef.current.length} node(s)`);
    setStatus('Playlist sync sent');
  };

  const sendScheduledClipToNodes = () => {
    if (clientsRef.current.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    const targetTimeMs = Date.now() + 3000;
    const message = `PLAY_CLIP_AT|${targetTimeMs}`;

    clientsRef.current.forEach(socket => {
      writeSocket(socket, message);
    });

    addLog(`Scheduled clip for ${new Date(targetTimeMs).toLocaleTimeString()}`);
    setStatus('Scheduled clip sent');
  };

  const connectWithPartyCode = () => {
    const cleanCode = partyCode.trim();

    if (!cleanCode) {
      Alert.alert('Missing party code', 'Enter the number shown on the host.');
      return;
    }

    if (cleanCode.includes('.')) {
      setHostIp(cleanCode);
      connectToHost(cleanCode);
      return;
    }

    const numericCode = Number(cleanCode);

    if (Number.isNaN(numericCode) || numericCode < 1 || numericCode > 254) {
      Alert.alert('Invalid party code', 'Use a number from 1 to 254, or enter the full host IP.');
      return;
    }

    const ip = `${subnetPrefix}.${numericCode}`;
    setHostIp(ip);
    connectToHost(ip);
  };

  const connectToHost = (ipOverride?: string) => {
    const ipToUse = ipOverride || hostIp;
    lastHostIpRef.current = ipToUse;
    nodeManualDisconnectRef.current = false;
    nodeReconnectScheduledRef.current = false;

    if (nodeReconnectTimerRef.current) {
      clearTimeout(nodeReconnectTimerRef.current);
      nodeReconnectTimerRef.current = null;
    }

    if (clientRef.current) {
      addLog('Closing stale connection before reconnecting');
      try {
        clientRef.current.destroy();
      } catch {}
      clientRef.current = null;
    }

    setStatus(`Connecting to ${ipToUse}:${TCP_PORT}...`);
    addLog(`Connecting to ${ipToUse}:${TCP_PORT}`);

    const client = TcpSocket.createConnection(
      {host: ipToUse, port: TCP_PORT},
      () => {
        nodeReconnectAttemptRef.current = 0;
        nodeReconnectScheduledRef.current = false;
        setStatus('Node connected');
        addLog('Connected to host');
        writeSocket(client, 'NODE_CONNECTED');
        writeSocket(client, `NODE_CACHE_STATE|${JSON.stringify(Array.from(nodeCachedTrackIdsRef.current))}`);

        if (nodeHeartbeatTimerRef.current) {
          clearInterval(nodeHeartbeatTimerRef.current);
        }

        nodeHeartbeatTimerRef.current = setInterval(() => {
          if (clientRef.current) {
            const sent = writeSocket(clientRef.current, "I'M_ALIVE");
            if (!sent) {
              addLog('Heartbeat detected a dead connection');
              try { clientRef.current?.destroy(); } catch {}
            }
          }
        }, 5000);
      },
    );

    const handleHostMessage = async (message: string, responseSocket: any = clientRef.current) => {
      const isTransferChunk = message.startsWith('TRACK_TRANSFER_CHUNK|');

      if (!isTransferChunk) {
        setLastMessage(message);
        addLog(`Host says: ${message}`);
      }


      if (message.startsWith('DOWNLOAD_TRACK|')) {
        try {
          const payload = JSON.parse(message.replace('DOWNLOAD_TRACK|', ''));
          if (!payload.id || !payload.name) return;

          setStatus(`Downloading: ${payload.name}`);
          setTrackProgress(payload.id, 1);
          addLog(`Native download started: ${payload.name}`);

          await PartyAudio.downloadTrackFromHost(
            ipToUse,
            TRANSFER_PORT,
            payload.id,
            payload.name,
          );

          nodeCachedTrackIdsRef.current.add(payload.id);
          setTrackProgress(payload.id, 100);
          setStatus(`Track cached: ${payload.name}`);
          addLog(`Native download complete: ${payload.name}`);
          writeSocket(responseSocket || clientRef.current, `TRACK_RECEIVED|${payload.id}|${payload.name}`);
        } catch (error) {
          setStatus('Track download failed');
          addLog(`Native download error: ${String(error)}`);
          try {
            const payload = JSON.parse(message.replace('DOWNLOAD_TRACK|', ''));
            writeSocket(responseSocket || clientRef.current, `TRACK_DOWNLOAD_FAILED|${payload.id}|${String(error)}`);
          } catch {}
        }
        return;
      }

      if (message === 'SYNC_RESET') {
        bestClockSampleRef.current = null;
        return;
      }

      if (message.startsWith('SYNC_REQUEST|')) {
        const requestId = message.split('|')[1];
        if (requestId) {
          writeSocket(client, `SYNC_PING|${requestId}|${Date.now()}`);
        }
        return;
      }

      if (message.startsWith('SYNC_PONG|')) {
        const parts = message.split('|');
        const clientSentMs = Number(parts[2]);
        const hostReceivedMs = Number(parts[3]);
        const hostSentMs = Number(parts[4]);
        const clientReceivedMs = Date.now();

        if ([clientSentMs, hostReceivedMs, hostSentMs].every(Number.isFinite)) {
          const rttMs = Math.max(0, (clientReceivedMs - clientSentMs) - (hostSentMs - hostReceivedMs));
          const offsetMs = Math.round(((hostReceivedMs - clientSentMs) + (hostSentMs - clientReceivedMs)) / 2);
          const best = bestClockSampleRef.current;

          if (!best || rttMs < best.rttMs) {
            bestClockSampleRef.current = {rttMs, offsetMs};
            hostClockOffsetRef.current = offsetMs;
            setHostClockOffsetMs(offsetMs);
            addLog(`Clock calibrated: ${offsetMs}ms offset, ${rttMs}ms RTT`);
          }
        }
        return;
      }

      if (message.startsWith('SYNC_TIME|')) {
        const hostNow = Number(message.split('|')[1]);
        if (!Number.isNaN(hostNow) && !bestClockSampleRef.current) {
          const offset = hostNow - Date.now();
          hostClockOffsetRef.current = offset;
          setHostClockOffsetMs(offset);
          addLog(`Clock sync offset: ${offset}ms`);
        }
      }

      if (message.startsWith('METADATA|')) {
        try {
          const metadata = JSON.parse(message.replace('METADATA|', '')) as TrackMetadata;
          setCurrentTrackMetadata(metadata);
          addLog(`Metadata received: ${metadata.title}`);
        } catch (error) {
          addLog(`Metadata parse error: ${String(error)}`);
        }
        return;
      }

      if (message.startsWith('NOW_PLAYING|')) {
        try {
          const payload = JSON.parse(message.replace('NOW_PLAYING|', ''));

          if (payload.trackId && payload.trackName && payload.startedAtHostMs) {
            nowPlayingRef.current = {
              trackId: payload.trackId,
              trackName: payload.trackName,
              startedAtHostMs: payload.startedAtHostMs,
            };
            setNowPlayingTrackId(payload.trackId);
            setCurrentTrackName(payload.trackName);

            startPlaybackUiClock(payload.trackName, payload.startedAtHostMs);

            const alreadyPlayingThisTrack =
              currentlyPlayingTrackRef.current === payload.trackId;
            const pending = pendingScheduledPlaybackRef.current;
            const sameTrackStillScheduled =
              pending?.trackId === payload.trackId &&
              getNodeHostNowMs() < (pending?.targetTimeMs ?? 0) + 1500;

            // NOW_PLAYING is a state heartbeat, not a second playback command.
            // While a prewarmed start is pending, never let catch-up playback
            // replace the prepared ExoPlayer instance.
            if (!alreadyPlayingThisTrack && !sameTrackStillScheduled) {
              const hostNow = getNodeHostNowMs();
              const positionMs = hostNow - payload.startedAtHostMs;

              if (positionMs > 750) {
                await playCachedTrackFromPosition(payload.trackId, payload.trackName, positionMs);
              }
            }

            setStatus(`Now playing: ${payload.trackName}`);
          }
        } catch (error) {
          addLog(`NOW_PLAYING parse error: ${String(error)}`);
        }
      }

      if (message === 'PING') {
        writeSocket(client, 'PONG');
      }

      if (message === 'BEEP') {
        playLocalBeep();
        writeSocket(client, 'BEEP_PLAYED');
      }

      if (message === 'TEST_TONE') {
        playLocalTestTone();
        writeSocket(client, 'TEST_TONE_PLAYED');
      }

      if (message === 'PAUSE_TRACK') {
        try {
          await PartyAudio.stopAudioUri();
        } catch (error) {
          addLog(`Pause error: ${String(error)}`);
        }

        pendingScheduledPlaybackRef.current = null;
        nowPlayingRef.current = null;
        stopPlaybackUiClock();
        setStatus('Paused');
        writeSocket(client, 'TRACK_PAUSED');
      }

      if (message === 'PLAY_CLIP') {
        playLocalPartyClip();
        writeSocket(client, 'CLIP_PLAYED');
      }

      if (message.startsWith('PLAYLIST_SYNC|')) {
        try {
          const rawJson = message.replace('PLAYLIST_SYNC|', '');
          const payload = JSON.parse(rawJson);

          const syncedTracks: Track[] = (payload.tracks || []).map((track: any) => ({
            id: track.id,
            name: track.name,
            uri: '',
            metadata: track.metadata,
          }));

          setPlaylist(syncedTracks);
          setSelectedTrackId(payload.selectedTrackId || null);

          const selected = syncedTracks.find(track => track.id === payload.selectedTrackId);
          if (selected?.metadata && !nowPlayingRef.current) {
            // Keep queued/selected metadata separate from the Now Playing identity.
          }

          writeSocket(client, 'PLAYLIST_RECEIVED');
          addLog(`Synced playlist received: ${syncedTracks.length} track(s)`);
        } catch (error) {
          addLog(`Playlist sync parse error: ${String(error)}`);
        }
      }

      if (message.startsWith('TRACK_TRANSFER_START|')) {
        try {
          const payload = JSON.parse(message.replace('TRACK_TRANSFER_START|', ''));
          transferBuffersRef.current[payload.id] = {
            name: payload.name,
            chunks: new Array(payload.chunks).fill(''),
          };
          setTrackProgress(payload.id, 0);
          addLog(`Receiving track: ${payload.name} (${payload.chunks} chunks)`);
        } catch (error) {
          addLog(`Track start parse error: ${String(error)}`);
        }
      }

      if (message.startsWith('TRACK_TRANSFER_CHUNK|')) {
        const parts = message.split('|');
        const trackId = parts[1];
        const index = Number(parts[2]);
        const chunk = parts.slice(3).join('|');

        const buffer = transferBuffersRef.current[trackId];
        if (buffer && !Number.isNaN(index)) {
          buffer.chunks[index] = chunk;
          if ((index + 1) % TRANSFER_ACK_EVERY_CHUNKS === 0 || index === buffer.chunks.length - 1) {
            if (responseSocket) {
              writeSocket(responseSocket, `TRANSFER_ACK|${trackId}|${index}`);
            }
          }

          if (index % TRANSFER_BATCH_SIZE === 0 || index === buffer.chunks.length - 1) {
            const percent = Math.min(99, Math.round(((index + 1) / buffer.chunks.length) * 100));
            setTrackProgress(trackId, percent);
            setStatus(`Receiving ${buffer.name}: ${percent}%`);
          }
        }
      }

      if (message.startsWith('TRACK_TRANSFER_END|')) {
        const trackId = message.split('|')[1];
        const buffer = transferBuffersRef.current[trackId];

        if (buffer) {
          try {
            const missingChunks = buffer.chunks.reduce<number[]>((missing, chunk, index) => {
              if (!chunk) missing.push(index);
              return missing;
            }, []);

            if (missingChunks.length > 0) {
              throw new Error(`Incomplete transfer: missing ${missingChunks.length} chunk(s)`);
            }

            const base64 = buffer.chunks.join('');
            setStatus(`Finalising ${buffer.name}…`);
            await PartyAudio.saveBase64Track(trackId, buffer.name, base64);
            delete transferBuffersRef.current[trackId];

            setStatus(`Track cached: ${buffer.name}`);
            setTrackProgress(trackId, 100);
            addLog(`Track cached: ${buffer.name}`);
            writeSocket(client, `TRACK_RECEIVED|${trackId}|${buffer.name}`);
          } catch (error) {
            addLog(`Save transferred track error: ${String(error)}`);
          }
        }
      }

      if (message.startsWith('PREPARE_TRACK|')) {
        try {
          const payload = JSON.parse(message.replace('PREPARE_TRACK|', ''));
          if (!payload.id || !payload.name || !payload.transactionId) return;

          pendingScheduledPlaybackRef.current = {trackId: payload.id, targetTimeMs: Number.MAX_SAFE_INTEGER};
          currentlyPlayingTrackRef.current = null;
          await PartyAudio.primeCachedTrack(payload.id, payload.name);

          // Only acknowledge if this preparation is still the active one.
          if (pendingScheduledPlaybackRef.current?.trackId === payload.id) {
            writeSocket(clientRef.current || client, `TRACK_PRIMED|${payload.transactionId}|${payload.id}`);
            setStatus(`Ready to play: ${payload.name}`);
            addLog(`Primed and waiting: ${payload.name}`);
          }
        } catch (error) {
          addLog(`Track prepare error: ${String(error)}`);
          setStatus('Could not prepare track');
        }
        return;
      }

      if (message.startsWith('START_PRIMED_AT|')) {
        try {
          const payload = JSON.parse(message.replace('START_PRIMED_AT|', ''));
          if (!payload.id || !payload.name || !payload.targetTimeMs) return;

          const localTargetTimeMs =
            Date.now() +
            Math.max(0, payload.targetTimeMs - getNodeHostNowMs()) +
            getPlaybackDelayCompensationMs();

          pendingScheduledPlaybackRef.current = {
            trackId: payload.id,
            targetTimeMs: payload.targetTimeMs,
          };
          nowPlayingRef.current = {
            trackId: payload.id,
            trackName: payload.name,
            startedAtHostMs: payload.targetTimeMs,
          };
          setNowPlayingTrackId(payload.id);
          startPlaybackUiClock(payload.name, payload.targetTimeMs);

          await PartyAudio.startPrimedTrackAt(localTargetTimeMs);
          pendingScheduledPlaybackRef.current = null;
          currentlyPlayingTrackRef.current = payload.id;
          startNodeDriftMonitor();
          setStatus(`Playing: ${payload.name}`);
          addLog(`Strict primed start scheduled: ${payload.name}`);
        } catch (error) {
          pendingScheduledPlaybackRef.current = null;
          addLog(`Primed start error: ${String(error)}`);
        }
        return;
      }

      if (message.startsWith('PLAY_TRACK_AT|')) {
        try {
          const payload = JSON.parse(message.replace('PLAY_TRACK_AT|', ''));

          if (!payload.id || !payload.name || !payload.targetTimeMs) {
            addLog('Ignored broken PLAY_TRACK_AT message');
            return;
          }

          const existingPending = pendingScheduledPlaybackRef.current;
          if (
            existingPending?.trackId === payload.id &&
            Math.abs((existingPending?.targetTimeMs ?? 0) - payload.targetTimeMs) < 250
          ) {
            addLog(`Ignored duplicate scheduled playback: ${payload.name}`);
            return;
          }

          pendingScheduledPlaybackRef.current = {
            trackId: payload.id,
            targetTimeMs: payload.targetTimeMs,
          };
          currentlyPlayingTrackRef.current = null;

          nowPlayingRef.current = {
            trackId: payload.id,
            trackName: payload.name,
            startedAtHostMs: payload.targetTimeMs,
          };

          startPlaybackUiClock(payload.name, payload.targetTimeMs);

          const hostNow = getNodeHostNowMs();
          const positionMs = hostNow - payload.targetTimeMs;

          if (positionMs > 750) {
            await playCachedTrackFromPosition(payload.id, payload.name, positionMs);
            writeSocket(client, `PLAY_TRACK_CATCHUP|${payload.id}|${Math.round(positionMs)}`);
          } else {
            playCachedTrackAt(payload.id, payload.name, payload.targetTimeMs);
            writeSocket(client, `PLAY_TRACK_SCHEDULED|${payload.id}`);
          }

          addLog(`Scheduled cached track from host: ${payload.name}`);
        } catch (error) {
          addLog(`PLAY_TRACK_AT parse error: ${String(error)}`);
        }
      }

      if (message.startsWith('PLAY_CLIP_AT|')) {
        const parts = message.split('|');
        const targetTimeMs = Number(parts[1]);

        if (!Number.isNaN(targetTimeMs)) {
          playPartyClipAt(targetTimeMs);
          writeSocket(client, 'CLIP_SCHEDULED');
        }
      }
    };

    client.on('data', data => {
      (client as unknown as PartySocketBuffer)._partyBuffer = `${(client as unknown as PartySocketBuffer)._partyBuffer || ''}${data.toString()}`;
      const lines = ((client as unknown as PartySocketBuffer)._partyBuffer || '').split('\n');
      (client as unknown as PartySocketBuffer)._partyBuffer = lines.pop() || '';

      lines.forEach((message: string) => {
        if (message.trim()) {
          handleHostMessage(message);
        }
      });
    });

    const scheduleReconnect = (reason: string) => {
      if (nodeManualDisconnectRef.current || nodeReconnectScheduledRef.current) return;
      const ip = lastHostIpRef.current;
      if (!ip) return;

      nodeReconnectScheduledRef.current = true;
      const attempt = nodeReconnectAttemptRef.current + 1;
      nodeReconnectAttemptRef.current = attempt;
      const delay = Math.min(10000, 1000 * Math.pow(2, Math.min(attempt - 1, 3)));

      setStatus(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s…`);
      addLog(`Connection lost (${reason}); reconnect attempt ${attempt} in ${delay}ms`);

      nodeReconnectTimerRef.current = setTimeout(() => {
        nodeReconnectTimerRef.current = null;
        nodeReconnectScheduledRef.current = false;
        connectToHost(ip);
      }, delay);
    };

    client.on('error', error => {
      addLog(`Connection error: ${String(error)}`);
      if (nodeHeartbeatTimerRef.current) {
        clearInterval(nodeHeartbeatTimerRef.current);
        nodeHeartbeatTimerRef.current = null;
      }
      if (clientRef.current === client) clientRef.current = null;
      scheduleReconnect(String(error));
    });

    client.on('close', () => {
      if (nodeHeartbeatTimerRef.current) {
        clearInterval(nodeHeartbeatTimerRef.current);
        nodeHeartbeatTimerRef.current = null;
      }
      if (clientRef.current === client) clientRef.current = null;
      if (!nodeManualDisconnectRef.current) {
        scheduleReconnect('socket closed');
      } else {
        setStatus('Disconnected from host');
      }
    });

    clientRef.current = client;
  };

  const disconnectFromHost = () => {
    nodeManualDisconnectRef.current = true;
    nodeReconnectScheduledRef.current = false;
    nodeReconnectAttemptRef.current = 0;

    if (nodeReconnectTimerRef.current) {
      clearTimeout(nodeReconnectTimerRef.current);
      nodeReconnectTimerRef.current = null;
    }

    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;

      if (nodeHeartbeatTimerRef.current) {
        clearInterval(nodeHeartbeatTimerRef.current);
        nodeHeartbeatTimerRef.current = null;
      }

      setStatus('Disconnected from host');
      addLog('Disconnected from host');
    }
  };

  const sendAliveToHost = () => {
    if (!clientRef.current) {
      setStatus('Not connected');
      return;
    }

    writeSocket(clientRef.current, "I'M_ALIVE");
    addLog("Sent I'M_ALIVE to host");
  };

  const playCachedTrackFromPosition = async (trackId: string, trackName: string, positionMs: number) => {
    try {
      pendingScheduledPlaybackRef.current = null;
      const safePosition = Math.max(0, positionMs + getPlaybackDelayCompensationMs());
      await PartyAudio.playCachedTrackFrom(trackId, trackName, safePosition);
      currentlyPlayingTrackRef.current = trackId;
      startNodeDriftMonitor();
      addLog(`Catch-up playing ${trackName} from ${formatMs(safePosition)}`);
      setStatus(`Playing: ${trackName}`);
      setNowPlayingText(trackName);
    } catch (error) {
      addLog(`Catch-up playback error: ${String(error)}`);
      Alert.alert('Catch-up playback error', String(error));
    }
  };

  const playCachedTrackAt = (trackId: string, trackName: string, targetTimeMs: number) => {
    const nodeHostNow = getNodeHostNowMs();
    const delay = Math.max(0, targetTimeMs - nodeHostNow + getPlaybackDelayCompensationMs());

    addLog(`Cached track scheduled in ${delay}ms: ${trackName}`);
    setStatus(`Scheduled: ${trackName}`);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    const updateCountdown = () => {
      const remainingMs = targetTimeMs - Date.now();

      if (remainingMs <= 0) {
        setCountdownText('Playing now');

        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }

        setTimeout(() => setCountdownText('Not scheduled'), 2000);
        return;
      }

      setCountdownText(`Playing in ${Math.ceil(remainingMs / 1000)}s`);
    };

    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 200);

    // Prepare/prime ExoPlayer immediately, while we still have several seconds
    // before the shared target time. Starting preparation at the target itself
    // makes first play depend on decoder/file-cache warmup and creates audible
    // device-to-device skew. Native code waits until this local wall-clock target
    // before actually starting the already-prepared player.
    const localTargetTimeMs = Date.now() + delay;

    PartyAudio.prepareCachedTrackAt(trackId, trackName, localTargetTimeMs)
      .then(() => {
        if (pendingScheduledPlaybackRef.current?.trackId === trackId) {
          pendingScheduledPlaybackRef.current = null;
        }
        currentlyPlayingTrackRef.current = trackId;
        startNodeDriftMonitor();
        addLog(`Playing prewarmed cached track: ${trackName}`);
        setStatus(`Playing: ${trackName}`);
      })
      .catch((error: unknown) => {
        const detail = String(error);
        if (pendingScheduledPlaybackRef.current?.trackId === trackId) {
          pendingScheduledPlaybackRef.current = null;
        }
        addLog(`Prewarmed scheduled track error: ${detail}`);
        if (!detail.includes('PREWARM_CANCELLED') && !detail.includes('Prepared player was replaced')) {
          Alert.alert('Scheduled playback error', detail);
        }
      });
  };

  const playCachedSelectedTrack = async () => {
    const selected = getSelectedTrack();

    if (!selected) {
      Alert.alert('No cached track selected', 'Sync the playlist and select a track first.');
      return;
    }

    try {
      await PartyAudio.playCachedTrack(selected.id, selected.name);
      addLog(`Playing cached track: ${selected.name}`);
      setStatus(`Playing cached track: ${selected.name}`);
    } catch (error) {
      addLog(`Play cached track error: ${String(error)}`);
      Alert.alert('Play cached track error', String(error));
    }
  };

  const adjustNodeDelay = (amount: number) => {
    setNodePlaybackDelayMs(previous => {
      const next = Math.max(-1000, Math.min(1000, previous + amount));
      addLog(`Node delay set to ${next}ms`);
      return next;
    });
  };

  const resetNodeDelay = () => {
    setNodePlaybackDelayMs(0);
    addLog('Node delay reset to 0ms');
  };

  const clearLog = () => setLog([]);

  useEffect(() => {
    if (mode !== 'host') {
      return;
    }

    if (!currentTrackMetadata.title) {
      return;
    }

    clientsRef.current.forEach(socket => {
      writeSocket(socket, `METADATA|${JSON.stringify(currentTrackMetadata)}`);
    });
  }, [currentTrackMetadata, mode]);


  const renderPanelHeader = (title: string, subtitle?: string) => (
    <PanelHeader
      title={title}
      subtitle={subtitle}
      styles={styles}
    />
  );

  const renderStatusPanel = () => {
    const isHosting =
      status.toLowerCase().includes('hosting') ||
      status.toLowerCase().includes('server') ||
      status.toLowerCase().includes('listening');

    return (
      <View style={{width: '100%', gap: 18}}>
        <SectionLabel>Party Code</SectionLabel>

        <Text
          style={{
            color: partyTheme.white,
            fontSize: 112,
            lineHeight: 116,
            fontWeight: '900',
            letterSpacing: -6,
            textAlign: 'center',
          }}>
          {partyCode || '...'}
        </Text>

        <PartyCard
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 18,
          }}>
          <Text style={{color: partyTheme.muted, fontSize: 16}}>
            📡 {hostLocalIp}:5050
          </Text>

          <Text style={{color: partyTheme.muted, fontSize: 16}}>
            👤 {nodeCount} {nodeCount === 1 ? 'speaker' : 'speakers'}
          </Text>
        </PartyCard>

        <PartyButton
          title={isHosting ? '✅  Hosting Active' : '📡  Start Hosting'}
          onPress={startHostServer}
        />

        <PartyCard
          style={{
            paddingVertical: 14,
            backgroundColor: isHosting
              ? 'rgba(255,255,255,0.075)'
              : 'rgba(255,255,255,0.045)',
          }}>
          <Text
            style={{
              color: isHosting ? partyTheme.white : partyTheme.muted,
              fontSize: 15,
              fontWeight: '700',
              textAlign: 'center',
            }}>
            {isHosting
              ? `Ready for speakers to join${nodeCount > 0 ? ` • ${nodeCount} connected` : ''}`
              : 'Tap Start Hosting to open the party'}
          </Text>

          <Text
            style={{
              color: partyTheme.faint,
              fontSize: 12,
              marginTop: 6,
              textAlign: 'center',
            }}>
            {status}
          </Text>
        </PartyCard>
      </View>
    );
  };

  const selectedTrackReadyForPlayback =
    !!selectedTrackId &&
    (
      trackTransferStatus[selectedTrackId] >= 100 ||
      isTrackCachedOnAllNodes(selectedTrackId)
    );

  const renderPlaylistPanel = () => (
    <PlaylistPanel
      styles={styles}
      currentTrackName={currentTrackName}
      nowPlayingText={nowPlayingText}
      playbackPositionText={playbackPositionText}
      playbackPositionMs={playbackPositionMs}
      transferProgressText={transferProgressText}
      transferProgress={transferProgress}
      playlist={playlist}
      selectedTrackId={selectedTrackId}
      trackTransferStatus={trackTransferStatus}
      addTrack={addTrack}
      addFolder={addFolder}
      removeSelectedTrack={removeSelectedTrack}
      setSelectedTrackId={setSelectedTrackId}
      setCurrentTrackName={setCurrentTrackName}
      addLog={addLog}
      autoSyncAndTransfer={autoSyncAndTransfer}
      onTrackSelected={(track: Track) => {
        selectedTrackIdRef.current = track.id;
        setSelectedTrackId(track.id);
        syncPlaylistSnapshotToNodes(playlistRef.current, track.id);
        if (isTrackCachedOnAllNodes(track.id)) {
          playSelectedTrackOnAllSpeakers(track);
        } else {
          transferSelectedTrackToNodes(track);
        }
      }}
      onMetadataChange={setCurrentTrackMetadata}
      selectedTrackReady={selectedTrackReadyForPlayback}
      playbackState={playbackState}
      nowPlayingTrackId={nowPlayingTrackId}
      onPlayPause={() => {
        if (playbackState === 'playing') {
          pauseAllSpeakers();
        } else {
          playSelectedTrackOnAllSpeakers();
        }
      }}
      selectPreviousTrack={() => selectTrackByOffset(-1)}
      selectNextTrack={() => selectTrackByOffset(1)}
    />
  );

  const renderPartyControls = () => (
    <View style={styles.panel}>
      {renderPanelHeader('Speaker Controls')}
      <TouchableOpacity style={styles.button} onPress={() => playSelectedTrackOnAllSpeakers()}>
        <Text style={styles.buttonText}>Play On All Speakers ▶</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={pauseAllSpeakers}>
        <Text style={styles.secondaryButtonText}>Pause On All Speakers ⏸</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <TouchableOpacity style={styles.halfSecondaryButton} onPress={() => selectTrackByOffset(-1)}>
          <Text style={styles.secondaryButtonText}>Previous</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.halfSecondaryButton} onPress={() => selectTrackByOffset(1)}>
          <Text style={styles.secondaryButtonText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );



  const renderLog = () => (
    <EventLog
      styles={styles}
      log={log}
      clearLog={clearLog}
    />
  );

  const renderDebugTools = () => (
    <View style={styles.panel}>
      <PartyButton
        title={showDebugTools ? 'Hide Debug Tools ▲' : 'Show Debug Tools ▼'}
        onPress={() => setShowDebugTools(previous => !previous)}
        variant="secondary"
        style={{width: '100%'}}
      />

      {showDebugTools ? (
        <>
          <TouchableOpacity style={styles.button} onPress={syncPlaylistToNodes}>
            <Text style={styles.buttonText}>Manual Sync Playlist 📡</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => transferSelectedTrackToNodes()}>
            <Text style={styles.buttonText}>Manual Transfer Selected 📦</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => sendMessageToNodes('PING')}>
            <Text style={styles.buttonText}>Send PING</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => sendMessageToNodes('BEEP')}>
            <Text style={styles.buttonText}>Send BEEP 🔊</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => sendMessageToNodes('TEST_TONE')}>
            <Text style={styles.buttonText}>Send Test Tone 🎵</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => sendMessageToNodes('PLAY_CLIP')}>
            <Text style={styles.buttonText}>Send Clip 🎶</Text>
          </TouchableOpacity>


          <TouchableOpacity style={styles.secondaryButton} onPress={playLocalBeep}>
            <Text style={styles.secondaryButtonText}>Test Local Beep</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={playLocalTestTone}>
            <Text style={styles.secondaryButtonText}>Test Local Tone</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={playLocalPartyClip}>
            <Text style={styles.secondaryButtonText}>Test Local Clip</Text>
          </TouchableOpacity>

          {renderLog()}
        </>
      ) : null}
    </View>
  );

  if (mode === 'host') {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderStatusPanel()}
          {renderPlaylistPanel()}

          <PartyButton
            title="Stop Hosting"
            onPress={stopHostServer}
            variant="secondary"
            style={{width: '100%', marginTop: 18}}
          />


          <PartyButton
            title="Back"
            onPress={() => setMode('home')}
            variant="secondary"
            style={{width: '100%', marginTop: 28}}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'node') {
    const isConnected = !!clientRef.current && !status.toLowerCase().includes('closed') && !status.toLowerCase().includes('error');

    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          <PartyCard style={{width: '100%', gap: 16}}>
            <SectionLabel>Join a Party</SectionLabel>

            <TextInput
              style={[
                styles.input,
                {
                  width: '100%',
                  minHeight: 76,
                  fontSize: 30,
                  textAlign: 'center',
                  backgroundColor: 'rgba(255,255,255,0.055)',
                  borderColor: partyTheme.border,
                  color: partyTheme.white,
                },
              ]}
              placeholder="Enter party code"
              placeholderTextColor="#777"
              value={partyCode}
              onChangeText={setPartyCode}
              autoCapitalize="none"
              keyboardType="number-pad"
            />

            <PartyButton
              title={isConnected ? '✅ Connected' : '↪ Join Party'}
              onPress={connectWithPartyCode}
            />

            <Text style={{color: partyTheme.muted, textAlign: 'center'}}>
              {isConnected ? 'You are connected to the party' : 'Use the code shown on the host screen'}
            </Text>
          </PartyCard>

          <PartyCard style={{width: '100%', marginTop: 18}}>
            <SectionLabel>Speaker Status</SectionLabel>

            <Text style={{color: partyTheme.white, fontSize: 34, fontWeight: '900'}}>
              {isConnected ? 'Connected' : 'Not Connected'}
            </Text>

            <Text style={{color: partyTheme.muted, marginTop: 6}}>
              {status}
            </Text>
          </PartyCard>

          <View style={{width: '100%', marginTop: 24}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <SectionLabel>Playlist</SectionLabel>
              <Text style={{color: partyTheme.muted, fontWeight: '800'}}>
                {playlist.length} {playlist.length === 1 ? 'Track' : 'Tracks'}
              </Text>
            </View>

            {playlist.length === 0 ? (
              <PartyCard>
                <Text style={{color: partyTheme.muted, textAlign: 'center'}}>
                  No playlist received yet
                </Text>
              </PartyCard>
            ) : (
              <View style={{gap: 10}}>
                {playlist.map((track, index) => {
                  const selected = selectedTrackId === track.id;
                  const progress = trackTransferStatus[track.id] || 0;

                  return (
                    <TouchableOpacity
                      key={track.id}
                      activeOpacity={0.82}
                      style={{
                        minHeight: 86,
                        borderRadius: 22,
                        paddingHorizontal: 18,
                        paddingVertical: 14,
                        backgroundColor: selected ? partyTheme.white : partyTheme.card,
                        borderColor: partyTheme.border,
                        borderWidth: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                      }}
                      onPress={() => {
                        setSelectedTrackId(track.id);
                        setCurrentTrackName(track.name);
                      }}>
                      <Text style={{
                        color: selected ? partyTheme.black : partyTheme.white,
                        fontSize: 24,
                        fontWeight: '900',
                        width: 28,
                      }}>
                        {index + 1}
                      </Text>

                      <View style={{
                        width: 56,
                        height: 56,
                        borderRadius: 16,
                        overflow: 'hidden',
                        backgroundColor: selected ? 'rgba(0,0,0,0.12)' : partyTheme.cardStrong,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        {track.metadata?.artworkUri ? (
                          <Image
                            source={{uri: track.metadata.artworkUri}}
                            style={{width: '100%', height: '100%'}}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={{
                            color: selected ? partyTheme.black : partyTheme.white,
                            fontSize: 24,
                            fontWeight: '900',
                          }}>
                            {track.name.trim()[0]?.toUpperCase() || '♪'}
                          </Text>
                        )}
                      </View>

                      <View style={{flex: 1}}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: selected ? partyTheme.black : partyTheme.white,
                            fontSize: 18,
                            fontWeight: '900',
                          }}>
                          {track.name.replace(/\.[^.]+$/, '')}
                        </Text>

                        <Text
                          numberOfLines={1}
                          style={{
                            color: selected ? 'rgba(0,0,0,0.55)' : partyTheme.muted,
                            fontSize: 14,
                            marginTop: 3,
                          }}>
                          {progress >= 100
                            ? 'Cached locally'
                            : progress > 0
                              ? `Downloading ${progress}%`
                              : 'Queued from host'}
                        </Text>
                      </View>

                      <Text style={{color: selected ? partyTheme.black : partyTheme.muted, fontSize: 28}}>
                        ⋮
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <PartyCard style={{width: '100%', marginTop: 24}}>
            <SectionLabel>Now Playing</SectionLabel>

            <NowPlayingArtwork
              title={currentTrackMetadata.title || currentTrackName}
              artworkUri={currentTrackMetadata.artworkUri}
            />

            <TrackInfo
              metadata={{
                title: currentTrackMetadata.title || currentTrackName || 'Waiting for track',
                artist: currentTrackMetadata.artist || 'Waiting for metadata',
                album: currentTrackMetadata.album || 'Speaker Node',
                artworkUri: currentTrackMetadata.artworkUri,
                durationMs: currentTrackMetadata.durationMs,
              }}
            />

            <Text style={{color: partyTheme.muted, textAlign: 'center', marginTop: 8}}>
              {nowPlayingText}
            </Text>

            <Text style={{color: partyTheme.faint, textAlign: 'center', marginTop: 4}}>
              {playbackPositionText}
            </Text>
          </PartyCard>

          <View style={{width: '100%', flexDirection: 'row', gap: 12, marginTop: 22}}>
            <PartyButton
              title="Disconnect"
              onPress={disconnectFromHost}
              variant="secondary"
              style={{flex: 1}}
            />

            <PartyButton
              title="Back"
              onPress={() => setMode('home')}
              variant="secondary"
              style={{flex: 1}}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.homeContent, {alignItems: 'stretch', paddingHorizontal: 24}]}>
        <Text style={{
          color: partyTheme.white,
          fontSize: 54,
          lineHeight: 58,
          fontWeight: '900',
          letterSpacing: -2,
          textAlign: 'center',
          marginBottom: 10,
        }}>
          PartySpeaker
        </Text>

        <Text style={{
          color: partyTheme.muted,
          fontSize: 18,
          lineHeight: 26,
          textAlign: 'center',
          marginBottom: 34,
        }}>
          One host. Many phones. One louder little universe.
        </Text>

        <PartyCard style={{gap: 14}}>
          <PartyButton title="Start Party" onPress={() => setMode('host')} />
          <PartyButton title="Join Party" onPress={() => setMode('node')} variant="secondary" />
        </PartyCard>

        <Text style={{
          color: partyTheme.faint,
          fontSize: 13,
          lineHeight: 19,
          textAlign: 'center',
          marginTop: 22,
        }}>
          Host controls the playlist. Speaker nodes join using the party code.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050505',
  },
  homeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 48,
  },
  scrollContent: {
    alignItems: 'center',
    padding: 18,
    paddingTop: 56,
    paddingBottom: 40,
  },
  title: {
    color: '#00ff88',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  text: {
    color: '#d7ffe9',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  panel: {
    backgroundColor: '#101a14',
    borderColor: '#00ff88',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    width: '92%',
    marginBottom: 14,
  },
  debugPanel: {
    backgroundColor: '#08110c',
    borderColor: '#145f3b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginTop: 12,
  },
  panelHeader: {
    marginBottom: 8,
  },
  panelTitle: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: '#b8ffd7',
    fontSize: 12,
    marginTop: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  halfButton: {
    backgroundColor: '#00ff88',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 10,
    flex: 1,
  },
  halfSecondaryButton: {
    borderColor: '#00ff88',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 10,
    flex: 1,
  },
  meterOuter: {
    width: '100%',
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#00ff88',
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 10,
  },
  meterInner: {
    height: '100%',
    backgroundColor: '#00ff88',
  },
  playlistBox: {
    marginTop: 12,
    borderColor: '#145f3b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    maxHeight: 220,
  },
  trackRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  trackSelected: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#00ff88',
  },
  trackText: {
    color: '#d7ffe9',
    fontSize: 13,
  },
  trackTextSelected: {
    color: '#050505',
    fontSize: 13,
    fontWeight: '800',
  },
  trackMeta: {
    color: '#b8ffd7',
    fontSize: 11,
    marginTop: 4,
  },
  trackMetaSelected: {
    color: '#05220f',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
  },
  trackMeterOuter: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#145f3b',
    overflow: 'hidden',
    marginTop: 5,
  },
  trackMeterOuterSelected: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#05220f',
    overflow: 'hidden',
    marginTop: 5,
  },
  trackMeterInner: {
    height: '100%',
    backgroundColor: '#00ff88',
  },
  debugToggle: {
    paddingVertical: 6,
  },
  debugToggleText: {
    color: '#00ff88',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  hint: {
    color: '#b8ffd7',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  logPanel: {
    backgroundColor: '#08110c',
    borderColor: '#145f3b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginTop: 12,
    maxHeight: 190,
  },
  logBox: {
    maxHeight: 110,
    marginBottom: 8,
  },
  logText: {
    color: '#b8ffd7',
    fontSize: 12,
    marginBottom: 4,
  },
  label: {
    color: '#00ff88',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 3,
  },
  status: {
    color: '#d7ffe9',
    fontSize: 15,
  },
  partyCode: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 4,
  },
  countdown: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#101a14',
    color: '#d7ffe9',
    borderColor: '#00ff88',
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    width: '92%',
    fontSize: 18,
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#00ff88',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 10,
    width: '82%',
  },
  buttonText: {
    color: '#050505',
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    borderColor: '#00ff88',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 10,
    width: '82%',
  },
  secondaryButtonText: {
    color: '#00ff88',
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  smallButton: {
    borderColor: '#145f3b',
    borderWidth: 1,
    paddingVertical: 7,
    borderRadius: 8,
  },
  smallButtonText: {
    color: '#00ff88',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
});
