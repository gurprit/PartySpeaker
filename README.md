# PartySpeaker 🎉🔊

PartySpeaker is a WiFi-based synchronized speaker system that turns multiple Android devices into a distributed audio network.

One phone acts as the **Host** and other phones join as **Speaker Nodes**. Each node can connect to its own Bluetooth speaker, allowing music to be played across multiple rooms, gardens, festival camps, or event spaces without needing dedicated hardware.

## Current Features

### Host Discovery

* Automatic host discovery over local WiFi
* TCP-based device communication
* Host and Node connection status

### Audio Testing

* Remote beep playback
* Remote test tone playback
* Remote audio clip playback
* Local audio testing tools

### Playback Synchronization

* Countdown-based synchronized playback
* Timestamp scheduling across devices
* Basic latency testing and verification

### Playlist Management

* Add audio files from device storage
* Select tracks
* Play tracks locally
* Stop playback
* Remove tracks

### Playlist Synchronization

* Sync playlist metadata to connected nodes
* Node receives track list
* Sync acknowledgements from nodes
* Playlist status reporting

### Network Features

* WiFi LAN operation
* Automatic host scanning
* Node reconnect support
* Event logging and diagnostics

## Project Status

### Completed

* Host / Node architecture
* WiFi discovery
* TCP messaging
* Remote commands
* Countdown synchronization
* Playlist management
* Playlist metadata synchronization

### In Progress

* Audio file transfer from Host to Nodes
* Local track caching on Nodes
* Synchronized track playback

### Planned

* Multi-track transfer
* Playlist synchronization across devices
* Scheduled playback of transferred tracks
* Improved synchronization accuracy
* Background playback
* Auto reconnect
* Party mode controls

## Long-Term Vision

```text
Host Phone
     │
     ├── WiFi ──► Node Phone ──► Bluetooth Speaker
     │
     ├── WiFi ──► Node Phone ──► Bluetooth Speaker
     │
     └── WiFi ──► Node Phone ──► Bluetooth Speaker
```

The Host controls the playlist while all connected devices receive synchronized playback commands.

This allows a group of phones and Bluetooth speakers to behave like a distributed multi-room audio system.

## Technology Stack

* React Native
* TypeScript
* Android
* Kotlin Native Modules
* TCP Sockets
* UDP Discovery
* Bluetooth Audio Output

## Development Setup

### Clone

```bash
git clone https://github.com/gurprit/PartySpeaker.git
cd PartySpeaker
```

### Install

```bash
npm install
```

### Run Metro

```bash
npx react-native start
```

### Build Android

```bash
cd android
./gradlew assembleDebug
```

## Useful Commands

### Build APK

```bash
partybuild
```

### Run on Device

```bash
npx react-native run-android
```

### Check Connected Devices

```bash
adb devices
```

### Start Emulator

```bash
~/Library/Android/sdk/emulator/emulator @Pixel_8
```

## Roadmap

### Version 0.1

* Basic Host / Node communication ✅

### Version 0.2

* Audio testing and synchronization ✅

### Version 0.3

* Playlist management ✅

### Version 0.4

* Playlist synchronization ✅

### Version 0.5

* Audio file transfer 🚧

### Version 0.6

* Synchronized multi-device playback 🚧

### Version 1.0

* Multi-speaker party audio system 🚀

## License

MIT License

---

Built with React Native and a lot of experimental audio networking.
