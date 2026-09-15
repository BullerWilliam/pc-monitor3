# PC Monitor 3

Electron version of the two-app scaffold from `pc-monitor2`.

It builds two Windows desktop apps:

- `PcMonitor3 Access`: runs on each monitored PC, generates a pairing code, publishes metadata to Firebase, serves an MJPEG screen stream, and shows a visible remote-session indicator when the monitor consent toggle is enabled.
- `PcMonitor3 Monitor`: runs on the admin PC, stores pairing codes, displays live previews and metadata, supports nicknames, includes a multi-view grid, and controls the consent toggle.

Remote mouse/keyboard relay is intentionally still a scaffold, matching `pc-monitor2`; the consent toggle is live and visible.

## Firebase config

Create `firebase_config.json` in the repo root, or place it in `%APPDATA%\PcMonitor3\firebase_config.json`.

```json
{
  "database_url": "https://your-project-default-rtdb.firebaseio.com",
  "auth_token": ""
}
```

## Install

```powershell
npm install
```

## Run from source

Start the access app:

```powershell
npm run start:access
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

- `release\access\access-3.0.0.exe`
- `release\monitor\monitor-3.0.0.exe`
