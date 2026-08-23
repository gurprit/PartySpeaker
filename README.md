# PartySpeaker 🎉🔊

PartySpeaker is an Android multi-speaker audio system that synchronizes music playback across multiple phones over a local WiFi network.

One Android device acts as the **Host**, controlling the playlist and playback. Other Android devices join as **Speaker Nodes** and can each output audio through their own phone speaker or connected Bluetooth speaker.

The goal is to turn hardware people already own into a synchronized, distributed sound system for parties, gardens, homes, festival camps and other shared spaces.

## How It Works

```text
                         ┌──► Node Phone ──► Bluetooth Speaker
                         │
Music ──► Host Phone ────┼──► Node Phone ──► Bluetooth Speaker
                         │
                         └──► Node Phone ──► Bluetooth Speaker
```

The Host manages the playlist, distributes audio to the Speaker Nodes and coordinates playback.

Tracks are cached locally before playback so each device can play from its own local copy rather than relying on real-time audio streaming across the network.

This allows PartySpeaker to focus network traffic on synchronization rather than continuously transmitting audio during playback.

---

## Current Features

### 📱 Host & Speaker Nodes

* One Android device acts as the Host
* Multiple Android devices can join as Speaker Nodes
* Automatic Host discovery over local WiFi
* TCP-based communication between devices
* UDP Host discovery
* Connection status and diagnostics
* Node reconnect support
* Host-controlled playback

### 🎵 Playlist Management

The Host can:

* Add individual audio tracks
* Import entire folders of music
* Reorder playlist tracks
* Remove tracks
* Select any track in the playlist
* Play / pause
* Previous / next track
* Automatically advance through the playlist
* Display track metadata and artwork where available

### 📱 Device Music

Music can be imported directly from Android storage.

**+ Track**

```text
+ Track
   └── Device File
```

Selects an individual audio file.

**+ Folder**

```text
+ Folder
   └── Device Folder
```

Imports supported audio files from a selected folder.

---

## ☁️ Google Drive Integration

PartySpeaker can also use music stored in Google Drive.

The Host can choose between local device storage and Google Drive from the playlist controls:

```text
+ Track
   ├── Device File
   └── Google Drive

+ Folder
   ├── Device Folder
   └── Google Drive
```

### Drive Tracks

Selecting **Google Drive** from `+ Track` opens Google's Drive Picker.

The selected track is temporarily downloaded to the Host and passed through PartySpeaker's normal caching and synchronization system.

### Drive Folders

Selecting **Google Drive** from `+ Folder` allows an entire Drive folder to be added to the playlist.

PartySpeaker scans the selected folder for supported audio files and adds them to the playlist.

The user's entire Drive music library is **not permanently copied to the phones**.

### On-Demand Drive Caching

Large Drive playlists do not need to be completely downloaded before playback.

PartySpeaker prioritizes music based on what is actually needed:

```text
Selected Track
      │
      ▼
Download to Host cache
      │
      ▼
Transfer to Speaker Nodes
      │
      ▼
Prepare on all devices
      │
      ▼
Synchronized playback
```

Upcoming tracks are prefetched so they can be ready before the current track finishes.

If the user jumps to a track much further down the playlist, that track is reprioritized instead of waiting for every earlier track to download first.

For example:

```text
Playing: Track 2

User selects Track 59

Priority becomes:

Track 59  ← selected
Track 60  ← upcoming/prewarm
Others    ← background / deferred
```

Temporary Drive files are cleaned up automatically rather than becoming a permanent duplicate music library.

---

## 🔄 Audio Distribution & Caching

Audio playback uses a **cache-first architecture**.

The Host obtains the source audio and transfers the required track to connected Speaker Nodes.

Each Node stores a temporary local copy.

```text
                 ┌──► Node cache ──► Playback
                 │
Host cache ──────┼──► Node cache ──► Playback
                 │
                 └──► Node cache ──► Playback
```

This means playback does not depend on continuously streaming the audio file across WiFi.

### Sequential Caching

Tracks are transferred in a controlled sequence rather than flooding the network with an entire playlist simultaneously.

### Standby Prewarming

While one track is playing, PartySpeaker prepares upcoming music in advance.

The next track can be:

* downloaded to the Host if required
* transferred to Nodes
* cached locally
* decoder-prepared

before the current song ends.

This reduces delays between tracks while avoiding unnecessary full-playlist transfers.

---

## ⏱️ Synchronized Playback

PartySpeaker uses scheduled playback rather than simply sending `PLAY` to every device at the same moment.

Before playback begins:

1. The Host identifies the participating Speaker Nodes.
2. The required track is cached on every expected Node.
3. Every Node prepares its local audio decoder.
4. The Host prepares its own decoder.
5. Device timing is calibrated.
6. The Host chooses a future playback timestamp.
7. The start command is distributed.
8. Every device waits for that timestamp.
9. Playback begins across all devices.
10. Drift correction handles remaining timing discrepancies.

### Strict Transition Quorum

Playlist transitions use a strict readiness barrier.

If three devices are participating:

```text
Host
Node A
Node B
```

then **all three must be ready before the next track starts**.

If a Node temporarily disconnects or is still caching:

```text
Host       READY
Node A     READY
Node B     LOADING

            ↓

         WAIT
```

The Host does not simply start playback and allow the missing Node to catch up later.

Once every expected device is ready:

```text
Host       READY
Node A     READY
Node B     READY

            ↓

     SCHEDULE START

            ↓

     synchronized playback
```

A short wait is preferred over starting different speakers at noticeably different times.

---

## 📡 Network Architecture

PartySpeaker currently operates over a local WiFi network.

The system uses:

* UDP for Host discovery
* TCP sockets for device communication
* local audio caching
* scheduled playback commands
* readiness acknowledgements
* reconnect handling
* playback position synchronization
* drift correction

Internet access is not required for locally stored music once the devices are connected to the same network.

Google Drive imports naturally require internet access while Drive tracks are being retrieved.

---

## 🧪 Diagnostics

PartySpeaker includes development and diagnostic tools for testing the distributed audio system.

These include:

* Host / Node connection status
* Event logging
* Audio test tools
* Transfer progress
* Cache status
* Playback readiness
* Timing diagnostics
* Synchronization testing
* Node delay calibration

These tools have been particularly useful for testing PartySpeaker across different Android manufacturers and hardware.

---

## Tested Devices

Development and multi-device testing has included devices such as:

* Samsung Galaxy S25
* Google Pixel Fold
* Xiaomi / Redmi Android devices
* Motorola Android devices
* Android Emulator

Testing across different Android hardware is important because networking, Bluetooth audio latency and Android power-management behaviour can vary considerably between manufacturers.

---

## Technology Stack

* React Native
* TypeScript
* Android
* Kotlin native modules
* TCP sockets
* UDP discovery
* Android audio APIs
* Bluetooth audio output
* Google Drive API
* Google Identity / Google Drive Picker

---

## Development Setup

### Clone

```bash
git clone https://github.com/gurprit/PartySpeaker.git
cd PartySpeaker
```

### Install Dependencies

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

---

## Development APK Build

A debug bundle/APK can be built manually with:

```bash
mkdir -p android/app/src/main/assets

rm -f android/app/src/main/assets/index.android.bundle

npx react-native bundle \
  --platform android \
  --dev true \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

cd android

rm -rf app/build app/.cxx

./gradlew assembleDebug

adb install -r app/build/outputs/apk/debug/app-debug.apk

cd ../
```

---

## Useful Commands

### Run on Android

```bash
npx react-native run-android
```

### Check Connected Devices

```bash
adb devices
```

### Start Pixel Emulator

```bash
~/Library/Android/sdk/emulator/emulator @Pixel_8
```

---

## Project Status

PartySpeaker has moved beyond its original proof-of-concept stage.

### ✅ Working

* Host / Node architecture
* Automatic WiFi Host discovery
* TCP device communication
* Multi-device connectivity
* Playlist management
* Playlist metadata synchronization
* Audio file transfer
* Node-side temporary caching
* Multi-device synchronized playback
* Scheduled playback
* Playback drift correction
* Pause / next / previous controls
* Automatic playlist progression
* Folder imports
* Sequential caching
* Upcoming-track prewarming
* Strict Node readiness before playback
* Google Drive authentication
* Google Drive track import
* Google Drive folder import
* On-demand Drive caching
* Drive playlist reprioritization
* Temporary Drive cache cleanup

### 🔬 Continuing Development

* Further synchronization accuracy improvements
* More extensive testing across Android manufacturers
* Network interruption / recovery improvements
* Cache lifecycle optimisation
* Large-playlist performance
* Bluetooth latency handling
* UI and diagnostics refinement

### 🔮 Future Exploration

The current system deliberately prioritizes reliable local caching before playback.

Potential future work includes:

* Progressive audio downloading
* Buffered playback
* Streaming-oriented transfer
* Smarter predictive caching
* Additional cloud music sources
* Improved background operation
* Larger multi-speaker networks

Any streaming implementation will need to preserve PartySpeaker's most important requirement: **all participating speakers should remain synchronized**.

---

## Long-Term Vision

PartySpeaker aims to make multi-speaker audio possible without requiring a proprietary ecosystem of dedicated smart speakers.

Instead:

```text
Phones + WiFi + speakers you already own
                    │
                    ▼
          synchronized sound system
```

A collection of Android phones and Bluetooth speakers can become one distributed audio system controlled from a single Host.

---

## License

MIT License

---

Built with React Native, Android, WiFi, Bluetooth, Google Drive and an unreasonable amount of synchronization testing. 🎶📡
