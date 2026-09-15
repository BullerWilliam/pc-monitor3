# PC Monitor 3

Electron version of the two-app scaffold from `pc-monitor2`.

It builds two Windows desktop apps:

- `PcMonitor3 Access`: runs headless on each monitored PC, generates a pairing code, publishes metadata to Firebase, and serves an MJPEG screen stream.
- `PcMonitor3 Monitor`: runs on the admin PC, stores pairing codes, displays live previews and metadata, supports nicknames, includes a multi-view grid, and controls the consent toggle.

Remote mouse/keyboard relay is intentionally still a scaffold, matching `pc-monitor2`; the monitor consent toggle is live in Firebase.

## Firebase config

Create `firebase_config.json` in the repo root, or place it in `%APPDATA%\PcMonitor3\firebase_config.json`.
When `firebase_config.json` exists in the repo root during packaging, it is embedded into both portable Electron apps. The build also maps `firebase_config(M).json` into the packaged app as `firebase_config.json` when that private file exists.

```json
{
  "database_url": "https://your-project-default-rtdb.firebaseio.com",
  "auth_token": ""
}
```

All Firebase data is stored below the `V3/` root path.

## Install

```powershell
npm install
```

## Run from source

Run the access background process from source:

```powershell
npm run start:access
```

From the packaged access app, run the exe once on the monitored PC:

```powershell
.\release\access\access.exe
```

That starts the headless background agent, adds itself to Startup apps, and installs the `access` command. Open a new Command Prompt window after the first run. Then these commands are available:

```powershell
access help
access code
access remove
```

Start the monitor app:

```powershell
npm run start:monitor
```

## Build

```powershell
npm run dist
```

The portable Windows builds are written to:

- `release\access\access.exe`
- `release\monitor\monitor-3.0.0.exe`
