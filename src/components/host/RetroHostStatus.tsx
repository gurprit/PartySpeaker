import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import AudioVisualiser from '../visualiser/AudioVisualiser';
import {partyTheme} from '../ui/PartyTheme';

type Props = {
  partyCode: string;
  hostLocalIp: string;
  nodeCount: number;
  status: string;
  isHosting: boolean;
  onStartHosting: () => void;
};

export default function RetroHostStatus({
  partyCode,
  hostLocalIp,
  nodeCount,
  status,
  isHosting,
  onStartHosting,
}: Props) {
  return (
    <View style={styles.deck}>
      <View style={styles.topRail}>
        <View>
          <Text style={styles.brand}>PARTYSPEAKER</Text>
          <Text style={styles.tagline}>MUSIC TOGETHER</Text>
        </View>
        <View style={styles.modePill}>
          <View style={[styles.led, isHosting && styles.ledOn]} />
          <Text style={styles.modeText}>HOST MODE</Text>
        </View>
      </View>

      <View style={styles.display}>
        <View style={styles.displayHeader}>
          <Text style={styles.displayLabel}>PARTY CODE</Text>
          <Text style={styles.speakerText}>
            {String(nodeCount).padStart(2, '0')} SPEAKER{nodeCount === 1 ? '' : 'S'}
          </Text>
        </View>

        <Text style={styles.code}>{partyCode || '---'}</Text>

        <View style={styles.divider} />

        <View style={styles.connectionRow}>
          <View>
            <Text style={styles.microLabel}>HOST SIGNAL</Text>
            <Text style={styles.ipText}>{hostLocalIp}:5050</Text>
          </View>
          <View style={styles.connectionRight}>
            <Text style={styles.microLabel}>STATUS</Text>
            <Text style={[styles.statusText, isHosting && styles.statusLive]}>
              {isHosting ? 'TRANSMITTING' : 'STANDBY'}
            </Text>
          </View>
        </View>

        <AudioVisualiser />
      </View>

      <View style={styles.hardwareStrip}>
        <View style={styles.screw} />
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={onStartHosting}
          style={[styles.hardwareButton, isHosting && styles.hardwareButtonActive]}>
          <View style={[styles.buttonLamp, isHosting && styles.buttonLampOn]} />
          <Text style={[styles.hardwareButtonText, isHosting && styles.hardwareButtonTextActive]}>
            {isHosting ? 'HOSTING ACTIVE' : 'START HOSTING'}
          </Text>
        </TouchableOpacity>
        <View style={styles.screw} />
      </View>

      <View style={styles.messagePanel}>
        <Text style={styles.messageTitle}>
          {isHosting
            ? nodeCount > 0
              ? `${nodeCount} SPEAKER${nodeCount === 1 ? '' : 'S'} CONNECTED`
              : 'READY FOR SPEAKERS'
            : 'PARTY OFFLINE'}
        </Text>
        <Text style={styles.messageSub} numberOfLines={2}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    width: '100%',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: '#242424',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 10,
  },
  topRail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  brand: {
    color: '#ff334f',
    fontFamily: 'monospace',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 1.8,
    textShadowColor: 'rgba(255,25,70,0.7)',
    textShadowRadius: 9,
  },
  tagline: {
    color: '#777',
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 3.1,
    marginTop: 2,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#333',
  },
  led: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#3c161b'},
  ledOn: {
    backgroundColor: '#ff2947',
    shadowColor: '#ff2947',
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  modeText: {
    color: '#b7b7b7',
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  display: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#050607',
    borderWidth: 1,
    borderColor: '#32151b',
    shadowColor: '#ff173c',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
    overflow: 'hidden',
  },
  displayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayLabel: {
    color: '#8c454e',
    fontFamily: 'monospace',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 2.2,
  },
  speakerText: {
    color: '#ff3853',
    fontFamily: 'monospace',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.3,
  },
  code: {
    color: '#ff2947',
    textAlign: 'center',
    fontFamily: 'monospace',
    fontWeight: '900',
    fontSize: 92,
    lineHeight: 100,
    letterSpacing: 9,
    marginVertical: 2,
    textShadowColor: 'rgba(255,20,60,0.9)',
    textShadowRadius: 18,
  },
  divider: {height: 1, backgroundColor: '#2c1318', marginBottom: 12},
  connectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  connectionRight: {alignItems: 'flex-end'},
  microLabel: {
    color: '#61363d',
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  ipText: {
    color: '#ad7e84',
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 4,
  },
  statusText: {
    color: '#76545a',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 4,
  },
  statusLive: {color: '#ff334f'},
  hardwareStrip: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#292929',
  },
  screw: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#444',
  },
  hardwareButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 6,
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: '#343434',
    borderBottomWidth: 4,
    borderBottomColor: '#030303',
  },
  hardwareButtonActive: {
    backgroundColor: '#17090c',
    borderColor: '#63202c',
  },
  buttonLamp: {width: 9, height: 9, borderRadius: 5, backgroundColor: '#34151a'},
  buttonLampOn: {
    backgroundColor: '#ff2947',
    shadowColor: '#ff2947',
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  hardwareButtonText: {
    color: '#989898',
    fontFamily: 'monospace',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1.4,
  },
  hardwareButtonTextActive: {color: '#ff455f'},
  messagePanel: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#0b0b0b',
    borderWidth: 1,
    borderColor: '#202020',
  },
  messageTitle: {
    color: '#d4d4d4',
    fontFamily: 'monospace',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  messageSub: {
    color: partyTheme.faint,
    fontFamily: 'monospace',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },
});
