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
const DISCOVERY_MESSAGE = 'PARTYSPEAKER_HOST';
const SUBNET_PREFIX = '192.168.0';

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
  const [playlistSyncedNodeCount, setPlaylistSyncedNodeCount] = useState(0);
  const [lastPlaylistSyncTime, setLastPlaylistSyncTime] = useState('Never');

  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [currentTrackName, setCurrentTrackName] = useState('None');

  const serverRef = useRef<any>(null);
  const clientsRef = useRef<any[]>([]);
  const clientRef = useRef<any>(null);
  const udpHostRef = useRef<any>(null);
  const broadcastTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);

  useEffect(() => {
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

  const getSelectedTrack = () => {
    return playlist.find(track => track.id === selectedTrackId) || null;
  };

  const addTrack = async () => {
    try {
      const result = await PartyAudio.pickAudioFile();

      const track: Track = {
        id: `${Date.now()}-${Math.random()}`,
        name: result.name || 'Selected audio',
        uri: result.uri,
      };

      setPlaylist(previous => [...previous, track]);
      setSelectedTrackId(track.id);
      setCurrentTrackName(track.name);
      addLog(`Added track: ${track.name}`);
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
    const delay = Math.max(0, targetTimeMs - Date.now());
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

  const startHostServer = () => {
    if (serverRef.current) {
      setStatus('Host server already running');
      return;
    }

    const server = TcpSocket.createServer(socket => {
      clientsRef.current.push(socket);
      setNodeCount(clientsRef.current.length);
      setStatus('Node connected');
      addLog('Node connected');

      socket.write('WELCOME_FROM_HOST');

      socket.on('data', data => {
        const message = data.toString();
        setLastMessage(message);
        addLog(`Node says: ${message}`);

        if (message === 'PLAYLIST_RECEIVED') {
          setPlaylistSyncedNodeCount(previous => previous + 1);
          addLog('Node confirmed playlist sync');
        }
      });

      socket.on('close', () => {
        clientsRef.current = clientsRef.current.filter(item => item !== socket);
        setNodeCount(clientsRef.current.length);
        setStatus('Node disconnected');
        addLog('Node disconnected');
      });

      socket.on('error', error => {
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

    socket.on('error', error => {
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
    addLog(`Starting TCP subnet scan on ${SUBNET_PREFIX}.x`);

    let found = false;

    for (let i = 1; i <= 254; i++) {
      if (found) {
        break;
      }

      const ip = `${SUBNET_PREFIX}.${i}`;
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
          {host: ip, port: TCP_PORT, timeout: 250},
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
      socket.write(message);
    });

    addLog(`Sent ${message} to ${clientsRef.current.length} node(s)`);
    setStatus(`${message} sent`);
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
      socket.write(message);
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
      socket.write(message);
    });

    addLog(`Scheduled clip for ${new Date(targetTimeMs).toLocaleTimeString()}`);
    setStatus('Scheduled clip sent');
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
        client.write('NODE_CONNECTED');
      },
    );

    client.on('data', data => {
      const message = data.toString();
      setLastMessage(message);
      addLog(`Host says: ${message}`);

      if (message === 'PING') {
        client.write('PONG');
      }

      if (message === 'BEEP') {
        playLocalBeep();
        client.write('BEEP_PLAYED');
      }

      if (message === 'TEST_TONE') {
        playLocalTestTone();
        client.write('TEST_TONE_PLAYED');
      }

      if (message === 'PLAY_CLIP') {
        playLocalPartyClip();
        client.write('CLIP_PLAYED');
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

          client.write('PLAYLIST_RECEIVED');
          addLog(`Synced playlist received: ${syncedTracks.length} track(s)`);
        } catch (error) {
          addLog(`Playlist sync parse error: ${String(error)}`);
        }
      }

      if (message.startsWith('PLAY_CLIP_AT|')) {
        const parts = message.split('|');
        const targetTimeMs = Number(parts[1]);

        if (!Number.isNaN(targetTimeMs)) {
          playPartyClipAt(targetTimeMs);
          client.write('CLIP_SCHEDULED');
        }
      }
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

    clientRef.current.write("I'M_ALIVE");
    addLog("Sent I'M_ALIVE to host");
  };

  const clearLog = () => setLog([]);

  const renderPanelHeader = (title: string, subtitle?: string) => (
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{title}</Text>
      {subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}
    </View>
  );

  const renderStatusPanel = () => (
    <View style={styles.panel}>
      {renderPanelHeader('Party Status')}
      <Text style={styles.label}>Status</Text>
      <Text style={styles.status}>{status}</Text>

      <Text style={styles.label}>Connected nodes</Text>
      <Text style={styles.status}>{nodeCount}</Text>

      <Text style={styles.label}>Last message</Text>
      <Text style={styles.status}>{lastMessage}</Text>
    </View>
  );

  const renderPlaylistPanel = () => (
    <View style={styles.panel}>
      {renderPanelHeader('Host Playlist', 'Add tracks and control playback from here')}
      <Text style={styles.status}>Current: {currentTrackName}</Text>
      <Text style={styles.status}>
        Playlist sync: {playlistSyncedNodeCount}/{nodeCount} node(s)
      </Text>
      <Text style={styles.status}>Last sync: {lastPlaylistSyncTime}</Text>

      <TouchableOpacity style={styles.button} onPress={addTrack}>
        <Text style={styles.buttonText}>Add Track ＋</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <TouchableOpacity style={styles.halfButton} onPress={playSelectedTrackLocal}>
          <Text style={styles.buttonText}>Play ▶</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.halfSecondaryButton} onPress={stopSelectedTrackLocal}>
          <Text style={styles.secondaryButtonText}>Stop</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.secondaryButton} onPress={removeSelectedTrack}>
        <Text style={styles.secondaryButtonText}>Remove Selected Track</Text>
      </TouchableOpacity>

      <View style={styles.playlistBox}>
        {playlist.length === 0 ? (
          <Text style={styles.logText}>No tracks added yet</Text>
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
    </View>
  );

  const renderPartyControls = () => (
    <View style={styles.panel}>
      {renderPanelHeader('Party Controls', 'These will become synced playlist controls')}
      <TouchableOpacity style={styles.button} onPress={syncPlaylistToNodes}>
        <Text style={styles.buttonText}>Sync Playlist to Nodes 📡</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Confirmed by {playlistSyncedNodeCount}/{nodeCount} connected node(s).
      </Text>

      <TouchableOpacity style={styles.button} onPress={sendScheduledClipToNodes}>
        <Text style={styles.buttonText}>Countdown Sync Test ⏱️</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        Next step: this button will schedule the selected playlist track on every node.
      </Text>
    </View>
  );

  const renderCapturePanel = () => {
    const percent = Math.round(captureLevel * 100);
    const barWidth = `${Math.min(100, percent)}%`;

    return (
      <View style={styles.debugPanel}>
        {renderPanelHeader('Audio Capture Test')}
        <Text style={styles.status}>Status: {captureStatus}</Text>
        <Text style={styles.status}>Level: {percent}%</Text>

        <View style={styles.meterOuter}>
          <View style={[styles.meterInner, {width: barWidth}]} />
        </View>

        <TouchableOpacity style={styles.button} onPress={startAudioCaptureTest}>
          <Text style={styles.buttonText}>Start Audio Capture Test</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={stopAudioCaptureTest}>
          <Text style={styles.secondaryButtonText}>Stop Audio Capture Test</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderLog = () => (
    <View style={styles.logPanel}>
      <Text style={styles.label}>Event log</Text>
      <ScrollView style={styles.logBox}>
        {log.length === 0 ? (
          <Text style={styles.logText}>No events yet</Text>
        ) : (
          log.map((item, index) => (
            <Text key={`${item}-${index}`} style={styles.logText}>
              {item}
            </Text>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.smallButton} onPress={clearLog}>
        <Text style={styles.smallButtonText}>Clear Log</Text>
      </TouchableOpacity>
    </View>
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

          {renderCapturePanel()}

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
          <Text style={styles.text}>Playlist control centre.</Text>

          {renderStatusPanel()}

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

          <TextInput
            style={styles.input}
            placeholder="Host IP address"
            placeholderTextColor="#6d8f7b"
            value={hostIp}
            onChangeText={setHostIp}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />

          <View style={styles.panel}>
            {renderPanelHeader('Node Status')}
            <Text style={styles.label}>Status</Text>
            <Text style={styles.status}>{status}</Text>

            <Text style={styles.label}>Discovered host</Text>
            <Text style={styles.status}>
              {discoveredHost ? `${discoveredHost.ip}:${discoveredHost.port}` : 'None yet'}
            </Text>

            <Text style={styles.label}>Countdown Sync Test</Text>
            <Text style={styles.countdown}>{countdownText}</Text>

            <Text style={styles.label}>Last message</Text>
            <Text style={styles.status}>{lastMessage}</Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={scanSubnetForHost}>
            <Text style={styles.buttonText}>
              {isScanning ? 'Scanning...' : 'Scan for Party Host'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              discoveredHost ? connectToHost(discoveredHost.ip) : connectToHost()
            }>
            <Text style={styles.buttonText}>Join Found Party</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={sendAliveToHost}>
            <Text style={styles.buttonText}>Send I'm Alive</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={disconnectFromHost}>
            <Text style={styles.secondaryButtonText}>Disconnect</Text>
          </TouchableOpacity>

          <View style={styles.panel}>
            {renderPanelHeader('Synced Playlist', 'Received from host')}
            {playlist.length === 0 ? (
              <Text style={styles.logText}>No playlist received yet</Text>
            ) : (
              playlist.map((track, index) => {
                const selected = selectedTrackId === track.id;

                return (
                  <View
                    key={track.id}
                    style={selected ? styles.trackSelected : styles.trackRow}>
                    <Text style={selected ? styles.trackTextSelected : styles.trackText}>
                      {index + 1}. {track.name}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

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
