import PanelHeader from './src/components/common/PanelHeader';
import NodeDelayCalibration from './src/components/node/NodeDelayCalibration';
import NodeStatusPanel from './src/components/node/NodeStatusPanel';
import PlaylistPanel from './src/components/host/PlaylistPanel';
import EventLog from './src/components/host/EventLog';
import NowPlayingArtwork from './src/components/visualiser/NowPlayingArtwork';
import TrackInfo from './src/components/visualiser/TrackInfo';
import AudioVisualiser from './src/components/visualiser/AudioVisualiser';
import {TrackMetadata} from './src/types/TrackMetadata';
import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
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
};

type DiscoveredHost = {
  ip: string;
  port: number;
  lastSeen: number;
};

const {PartyAudio} = NativeModules;

const TCP_PORT = 5050;
const UDP_PORT = 5051;
const START_BUFFER_MS = 5000;
const BLUETOOTH_LATENCY_COMPENSATION_MS = 0;
const DISCOVERY_MESSAGE = 'PARTYSPEAKER_HOST';


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
  const [captureStatus, setCaptureStatus] = useState('Not running');
  const [captureLevel, setCaptureLevel] = useState(0);
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
  const [nowPlayingText, setNowPlayingText] = useState('Nothing playing');
  const [nodePlaybackDelayMs, setNodePlaybackDelayMs] = useState(0);

  const serverRef = useRef<any>(null);
  const clientsRef = useRef<any[]>([]);
  const clientRef = useRef<any>(null);
  const udpHostRef = useRef<any>(null);
  const broadcastTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);
  const playbackUiTimerRef = useRef<any>(null);
  const nowPlayingBroadcastTimerRef = useRef<any>(null);
  const nowPlayingRef = useRef<{trackId: string; trackName: string; startedAtHostMs: number} | null>(null);
  const currentlyPlayingTrackRef = useRef<string | null>(null);
  const transferBuffersRef = useRef<Record<string, {name: string; chunks: string[]}>>({});
  const cachedTracksRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    refreshHostAddress();

    const eventEmitter = new NativeEventEmitter(PartyAudio);

    const levelSub = eventEmitter.addListener('partyAudioCaptureLevel', event => {
      setCaptureLevel(event.level || 0);
    });

    const statusSub = eventEmitter.addListener('partyAudioCaptureStatus', event => {
      setCaptureStatus(event.status || 'Unknown');
    });

    return () => {
      levelSub.remove();
      statusSub.remove();
    };
  }, []);

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString();
    setLog(previous => [`${time}  ${message}`, ...previous].slice(0, 14));
  };

  const writeSocket = (socket: any, message: string) => {
    socket.write(`${message}\n`);
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

  const getNodeHostNowMs = () => Date.now() + hostClockOffsetMs;

  const getPlaybackDelayCompensationMs = () => {
    return nodePlaybackDelayMs;
  };

  const startPlaybackUiClock = (trackName: string, startedAtHostMs: number) => {
    if (playbackUiTimerRef.current) {
      clearInterval(playbackUiTimerRef.current);
    }

    setNowPlayingText(trackName);

    playbackUiTimerRef.current = setInterval(() => {
      const hostNow = mode === 'host' ? Date.now() : getNodeHostNowMs();
      const positionMs = hostNow - startedAtHostMs;
      setPlaybackPositionText(formatMs(positionMs));
    }, 500);
  };

  const stopPlaybackUiClock = () => {
    if (playbackUiTimerRef.current) {
      clearInterval(playbackUiTimerRef.current);
      playbackUiTimerRef.current = null;
    }

    currentlyPlayingTrackRef.current = null;
    setPlaybackPositionText('0:00');
    setNowPlayingText('Nothing playing');
  };

  const sendTimeSyncToNode = (socket: any) => {
    writeSocket(socket, `SYNC_TIME|${Date.now()}`);
  };

  const broadcastNowPlaying = () => {
    if (!nowPlayingRef.current || clientsRef.current.length === 0) {
      return;
    }

    const payload = {
      ...nowPlayingRef.current,
      hostNowMs: Date.now(),
    };

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

  const autoSyncAndTransfer = (track?: Track, playlistSnapshot?: Track[], selectedIdSnapshot?: string | null) => {
    setTimeout(() => {
      if (playlistSnapshot) {
        syncPlaylistSnapshotToNodes(
          playlistSnapshot,
          selectedIdSnapshot === undefined ? selectedTrackId : selectedIdSnapshot,
        );
      } else {
        syncPlaylistToNodes();
      }

      if (track) {
        transferSelectedTrackToNodes(track);
      }
    }, 100);
  };

  const addTrack = async () => {
    try {
      const result = await PartyAudio.pickAudioFile();

      const track: Track = {
        id: `${Date.now()}-${Math.random()}`,
        name: result.name || 'Selected audio',
        uri: result.uri,
      };

      const nextPlaylist = [...playlist, track];

      setPlaylist(nextPlaylist);
      setSelectedTrackId(track.id);
      setCurrentTrackName(track.name);
      setTrackProgress(track.id, 0);
      addLog(`Added track: ${track.name}`);
      autoSyncAndTransfer(track, nextPlaylist, track.id);
    } catch (error) {
      addLog(`Add track cancelled/error: ${String(error)}`);
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
    } else {
      setSelectedTrackId(null);
      setCurrentTrackName('None');
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

  const startAudioCaptureTest = async () => {
    try {
      await PartyAudio.startAudioCaptureTest();
      setCaptureStatus('Capture starting...');
      addLog('Audio capture test started');
    } catch (error) {
      addLog(`Capture error: ${String(error)}`);
      Alert.alert('Capture error', String(error));
    }
  };

  const stopAudioCaptureTest = async () => {
    try {
      await PartyAudio.stopAudioCaptureTest();
      setCaptureStatus('Capture stopped');
      setCaptureLevel(0);
      addLog('Audio capture test stopped');
    } catch (error) {
      addLog(`Stop capture error: ${String(error)}`);
      Alert.alert('Stop capture error', String(error));
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
        syncPlaylistSnapshotToNodes(playlist, selectedTrackId);
        broadcastNowPlaying();
      }, 300);

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

          if (message === 'PLAYLIST_RECEIVED') {
            setPlaylistSyncedNodeCount(previous => previous + 1);
            addLog('Node confirmed playlist sync');
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

            addLog(`Node cached track: ${trackName}`);
          }

          if (message.startsWith('PLAY_TRACK_SCHEDULED|')) {
            const trackId = message.split('|')[1];
            addLog(`Node scheduled track playback: ${trackId}`);
          }
        });
      });

      socket.on('close', () => {
        clientsRef.current = clientsRef.current.filter(item => item !== socket);
        setNodeCount(clientsRef.current.length);
        setStatus('Node disconnected');
        addLog('Node disconnected');
      });

      (socket as any).on('error', (error: any) => {
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
            '192.168.0.255',
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

    setSelectedTrackId(nextTrack.id);
    setCurrentTrackName(nextTrack.name);
    addLog(`Selected track: ${nextTrack.name}`);
    autoSyncAndTransfer(nextTrack, playlist, nextTrack.id);

    setTimeout(() => {
      playSelectedTrackOnAllSpeakers(nextTrack);
    }, 1000);
  };

  const isTrackCachedOnAllNodes = (trackId: string) => {
    if (clientsRef.current.length === 0) {
      return false;
    }

    return clientsRef.current.every(socket => {
      const key = socket.remoteAddress || 'unknown';
      return cachedTracksRef.current[key]?.includes(trackId);
    });
  };

  const waitForTrackCachedOnAllNodes = async (track: Track, timeoutMs = 45000) => {
    const startedAt = Date.now();

    while (!isTrackCachedOnAllNodes(track.id)) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for nodes to cache ${track.name}`);
      }

      setStatus(`Waiting for nodes to cache: ${track.name}`);
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

    try {
      if (!isTrackCachedOnAllNodes(selected.id)) {
        addLog(`Selected track not cached everywhere. Transferring first: ${selected.name}`);
        await transferSelectedTrackToNodes(selected);
        await waitForTrackCachedOnAllNodes(selected);
      }
    } catch (error) {
      addLog(`Cannot play yet: ${String(error)}`);
      Alert.alert('Track not ready', String(error));
      return;
    }

    const targetTimeMs = Date.now() + START_BUFFER_MS;
    const payload = {
      id: selected.id,
      name: selected.name,
      targetTimeMs,
      hostNowMs: Date.now(),
    };

    nowPlayingRef.current = {
      trackId: selected.id,
      trackName: selected.name,
      startedAtHostMs: targetTimeMs,
    };

    clientsRef.current.forEach(socket => {
      sendTimeSyncToNode(socket);
      writeSocket(socket, `PLAY_TRACK_AT|${JSON.stringify(payload)}`);
    });

    if (nowPlayingBroadcastTimerRef.current) {
      clearInterval(nowPlayingBroadcastTimerRef.current);
    }

    nowPlayingBroadcastTimerRef.current = setInterval(broadcastNowPlaying, 3000);

    startPlaybackUiClock(selected.name, targetTimeMs);
    addLog(`Play on all speakers scheduled: ${selected.name}`);
    setStatus(`Playing on all speakers in ${Math.round(START_BUFFER_MS / 1000)}s`);
  };

  const transferSelectedTrackToNodes = async (trackOverride?: Track) => {
    const selected = trackOverride || getSelectedTrack();

    if (!selected) {
      Alert.alert('No track selected', 'Add and select a track first.');
      return;
    }

    if (clientsRef.current.length === 0) {
      addLog('No nodes connected');
      setStatus('No nodes connected');
      return;
    }

    try {

      const allNodesHaveTrack = clientsRef.current.every(socket => {
        const key = socket.remoteAddress || 'unknown';
        return cachedTracksRef.current[key]?.includes(selected.id);
      });

      if (clientsRef.current.length > 0 && allNodesHaveTrack) {
        addLog(`Skipping transfer. All nodes already cached ${selected.name}`);
        setStatus(`Already cached on all nodes`);
        setTransferProgressText(`Cached: ${selected.name}`);
        setTransferProgress(100);
        setTrackProgress(selected.id, 100);
        return;
      }

      setTransferProgress(0);
      setTrackProgress(selected.id, 0);
      setTransferProgressText(`Preparing: ${selected.name}`);
      setStatus('Reading selected track...');
      addLog(`Reading track for transfer: ${selected.name}`);

      const base64: string = await PartyAudio.readAudioUriAsBase64(selected.uri);
      const chunkSize = 24000;
      const chunks: string[] = [];

      for (let i = 0; i < base64.length; i += chunkSize) {
        chunks.push(base64.slice(i, i + chunkSize));
      }

      const startPayload = {
        id: selected.id,
        name: selected.name,
        chunks: chunks.length,
      };

      clientsRef.current.forEach(socket => {
        writeSocket(socket, `TRACK_TRANSFER_START|${JSON.stringify(startPayload)}`);
      });

      for (let i = 0; i < chunks.length; i++) {
        clientsRef.current.forEach(socket => {
          writeSocket(socket, `TRACK_TRANSFER_CHUNK|${selected.id}|${i}|${chunks[i]}`);
        });

        if (i % 10 === 0) {
          const percent = Math.round(((i + 1) / chunks.length) * 100);
          setTransferProgress(percent);
          setTrackProgress(selected.id, percent);
          setTransferProgressText(`Transferring ${selected.name}: ${percent}%`);
          setStatus(`Transferring ${selected.name}: ${i + 1}/${chunks.length}`);
          await new Promise<void>(resolve => setTimeout(() => resolve(), 5));
        }
      }

      clientsRef.current.forEach(socket => {
        writeSocket(socket, `TRACK_TRANSFER_END|${selected.id}`);
      });

      setTransferProgress(100);
      setTrackProgress(selected.id, 100);
      setTransferProgressText(`Transferred: ${selected.name}`);
      setStatus('Track transfer sent');
      addLog(`Track transfer sent: ${selected.name} (${chunks.length} chunks)`);
    } catch (error) {
      addLog(`Track transfer error: ${String(error)}`);
      Alert.alert('Track transfer error', String(error));
    }
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

    if (clientRef.current) {
      setStatus('Already connected');
      return;
    }

    setStatus(`Connecting to ${ipToUse}:${TCP_PORT}...`);
    addLog(`Connecting to ${ipToUse}:${TCP_PORT}`);

    const client = TcpSocket.createConnection(
      {host: ipToUse, port: TCP_PORT},
      () => {
        setStatus('Node connected');
        addLog('Connected to host');
        writeSocket(client, 'NODE_CONNECTED');
      },
    );

    const handleHostMessage = async (message: string) => {
      const isTransferChunk = message.startsWith('TRACK_TRANSFER_CHUNK|');

      if (!isTransferChunk) {
        setLastMessage(message);
        addLog(`Host says: ${message}`);
      }

      if (message.startsWith('SYNC_TIME|')) {
        const hostNow = Number(message.split('|')[1]);
        if (!Number.isNaN(hostNow)) {
          const offset = hostNow - Date.now();
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

            startPlaybackUiClock(payload.trackName, payload.startedAtHostMs);

            const alreadyPlayingThisTrack =
              currentlyPlayingTrackRef.current === payload.trackId;

            if (!alreadyPlayingThisTrack) {
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
          }));

          setPlaylist(syncedTracks);
          setSelectedTrackId(payload.selectedTrackId || null);

          const selected = syncedTracks.find(track => track.id === payload.selectedTrackId);
          setCurrentTrackName(selected ? selected.name : 'None');

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
          if (index % 10 === 0) {
            const percent = Math.round(((index + 1) / buffer.chunks.length) * 100);
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
            const base64 = buffer.chunks.join('');
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

      if (message.startsWith('PLAY_TRACK_AT|')) {
        try {
          const payload = JSON.parse(message.replace('PLAY_TRACK_AT|', ''));

          if (!payload.id || !payload.name || !payload.targetTimeMs) {
            addLog('Ignored broken PLAY_TRACK_AT message');
            return;
          }

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

    client.on('error', error => {
      setStatus(`Connection error: ${String(error)}`);
      Alert.alert('Connection error', String(error));
      clientRef.current = null;
    });

    client.on('close', () => {
      setStatus('Connection closed');
      clientRef.current = null;
    });

    clientRef.current = client;
  };

  const disconnectFromHost = () => {
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
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
      const safePosition = Math.max(0, positionMs + getPlaybackDelayCompensationMs());
      await PartyAudio.playCachedTrackFrom(trackId, trackName, safePosition);
      currentlyPlayingTrackRef.current = trackId;
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

    setTimeout(async () => {
      try {
        await PartyAudio.playCachedTrack(trackId, trackName);
        currentlyPlayingTrackRef.current = trackId;
        addLog(`Playing scheduled cached track: ${trackName}`);
        setStatus(`Playing: ${trackName}`);
      } catch (error) {
        addLog(`Scheduled cached track error: ${String(error)}`);
        Alert.alert('Scheduled playback error', String(error));
      }
    }, delay);
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

  const renderStatusPanel = () => (
    <View style={styles.panel}>
      {renderPanelHeader('Party Code')}
      <Text style={styles.partyCode}>{partyCode || '...'}</Text>
      <Text style={styles.status}>{hostLocalIp}:5050</Text>
      <Text style={styles.status}>Status: {status}</Text>
      <Text style={styles.status}>Nodes: {nodeCount}</Text>
    </View>
  );

  const renderConnectedSpeakersPanel = () => (
    <View style={styles.panel}>
      {renderPanelHeader('Connected Speakers')}

      <View
        style={{
          marginTop: 10,
          padding: 16,
          borderRadius: 22,
          backgroundColor: 'rgba(57, 255, 20, 0.06)',
          borderWidth: 1,
          borderColor: 'rgba(57, 255, 20, 0.18)',
        }}>
        <Text
          style={{
            color: '#39ff14',
            fontSize: 42,
            fontWeight: '800',
            textAlign: 'center',
          }}>
          {nodeCount}
        </Text>

        <Text
          style={{
            color: '#d7ffe1',
            textAlign: 'center',
            fontSize: 15,
            marginTop: 2,
          }}>
          {nodeCount === 1 ? 'speaker connected' : 'speakers connected'}
        </Text>

        <View
          style={{
            height: 8,
            borderRadius: 999,
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.08)',
            marginTop: 16,
          }}>
          <View
            style={{
              height: '100%',
              width: `${Math.min(100, nodeCount * 25)}%`,
              backgroundColor: '#39ff14',
            }}
          />
        </View>

        <Text
          style={{
            color: '#8fcf9e',
            textAlign: 'center',
            marginTop: 12,
            fontSize: 12,
          }}>
          Add more phones to make the party louder.
        </Text>
      </View>
    </View>
  );

  const renderPlaylistPanel = () => (
    <PlaylistPanel
      styles={styles}
      currentTrackName={currentTrackName}
      nowPlayingText={nowPlayingText}
      playbackPositionText={playbackPositionText}
      transferProgressText={transferProgressText}
      transferProgress={transferProgress}
      playlist={playlist}
      selectedTrackId={selectedTrackId}
      trackTransferStatus={trackTransferStatus}
      addTrack={addTrack}
      removeSelectedTrack={removeSelectedTrack}
      setSelectedTrackId={setSelectedTrackId}
      setCurrentTrackName={setCurrentTrackName}
      addLog={addLog}
      autoSyncAndTransfer={autoSyncAndTransfer}
      onMetadataChange={setCurrentTrackMetadata}
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
      <TouchableOpacity
        style={styles.debugToggle}
        onPress={() => setShowDebugTools(previous => !previous)}>
        <Text style={styles.debugToggleText}>
          {showDebugTools ? 'Hide Debug Tools ▲' : 'Show Debug Tools ▼'}
        </Text>
      </TouchableOpacity>

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
          <Text style={styles.title}>🎛️ Party Host</Text>
          <Text style={styles.text}>Control the playlist and speakers.</Text>

          {renderStatusPanel()}
          {renderConnectedSpeakersPanel()}

          <TouchableOpacity style={styles.button} onPress={startHostServer}>
            <Text style={styles.buttonText}>Start Host Server</Text>
          </TouchableOpacity>

          {renderPlaylistPanel()}
          {renderPartyControls()}

          <TouchableOpacity style={styles.secondaryButton} onPress={stopHostServer}>
            <Text style={styles.secondaryButtonText}>Stop Host Server</Text>
          </TouchableOpacity>

          {renderDebugTools()}

          <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('home')}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'node') {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>🔊 Speaker Node</Text>
          <Text style={styles.text}>This phone connects to the host.</Text>

          <Text style={styles.label}>Enter Party Code</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 225"
            placeholderTextColor="#6d8f7b"
            value={partyCode}
            onChangeText={setPartyCode}
            autoCapitalize="none"
            keyboardType="number-pad"
          />

          <Text style={styles.hint}>
            Use the number shown on the host screen.
          </Text>

          <TouchableOpacity style={styles.button} onPress={connectWithPartyCode}>
            <Text style={styles.buttonText}>Join With Party Code</Text>
          </TouchableOpacity>



          <View style={styles.panel}>
            {renderPanelHeader('Now Playing')}

            <View
              style={{
                marginTop: 18,
                marginBottom: 24,
                borderRadius: 30,
                padding: 22,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                shadowColor: '#39ff14',
                shadowOpacity: 0.15,
                shadowRadius: 20,
                elevation: 8,
              }}>
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

              <Text style={styles.status}>Playback: {nowPlayingText}</Text>
              <Text style={styles.status}>Position: {playbackPositionText}</Text>

              <AudioVisualiser
                isActive={
                  currentTrackName.trim().length > 0 &&
                  currentTrackName !== 'No track selected'
                }
                label={
                  currentTrackName.trim().length > 0 && currentTrackName !== 'No track selected'
                    ? 'Visualiser synced to playback clock'
                    : 'Waiting for host playback'
                }
                playbackPositionText={playbackPositionText}
              />
            </View>
          </View>

          <View style={styles.panel}>
            {renderPanelHeader('Synced Playlist Preview')}
            {playlist.length === 0 ? (
              <Text style={styles.logText}>No playlist received yet</Text>
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
                    }}>
                    <Text style={selected ? styles.trackTextSelected : styles.trackText}>
                      {index + 1}. {track.name}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <NodeStatusPanel
            styles={styles}
            status={status}
            nowPlayingText={nowPlayingText}
            playbackPositionText={playbackPositionText}
            hostClockOffsetMs={hostClockOffsetMs}
            nodePlaybackDelayMs={nodePlaybackDelayMs}
            subnetPrefix={subnetPrefix}
            lastMessage={lastMessage}
          />

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setShowNodeDebugTools(previous => !previous)}>
            <Text style={styles.secondaryButtonText}>
              {showNodeDebugTools ? 'Hide Developer Tools ▲' : 'Developer Tools ▼'}
            </Text>
          </TouchableOpacity>

          {showNodeDebugTools ? (
            <View style={styles.panel}>
              {renderPanelHeader('Developer Tools')}

          <NodeDelayCalibration
            styles={styles}
            nodePlaybackDelayMs={nodePlaybackDelayMs}
            adjustNodeDelay={adjustNodeDelay}
            resetNodeDelay={resetNodeDelay}
          />



              <Text style={styles.label}>Developer Manual Host IP</Text>
              <TextInput
                style={styles.input}
                placeholder="Host IP address"
                placeholderTextColor="#6d8f7b"
                value={hostIp}
                onChangeText={setHostIp}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() =>
                  discoveredHost ? connectToHost(discoveredHost.ip) : connectToHost()
                }>
                <Text style={styles.secondaryButtonText}>Connect Using Manual IP</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={scanSubnetForHost}>
                <Text style={styles.secondaryButtonText}>
                  {isScanning ? 'Scanning...' : 'Fallback Scan'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.button} onPress={sendAliveToHost}>
                <Text style={styles.buttonText}>Send I'm Alive</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity style={styles.secondaryButton} onPress={disconnectFromHost}>
            <Text style={styles.secondaryButtonText}>Disconnect</Text>
          </TouchableOpacity>

          {renderLog()}

          <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('home')}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.homeContent}>
        <Text style={styles.title}>PartySpeaker</Text>
        <Text style={styles.text}>One host. Many phones. Many speakers.</Text>

        <TouchableOpacity style={styles.button} onPress={() => setMode('host')}>
          <Text style={styles.buttonText}>Start Party</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={() => setMode('node')}>
          <Text style={styles.buttonText}>Join Party</Text>
        </TouchableOpacity>
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
