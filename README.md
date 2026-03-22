# obs-remote

Web dashboard to remotely control OBS Studio over WebSocket from another machine on your local network.

## Features

- **Live Preview** — Screenshot-based preview of OBS output at configurable FPS (1/2/5)
- **Stream & Recording controls** — Start/stop stream and recording, pause/resume, live timecodes
- **Scene switching** — Switch between OBS scenes
- **Source management** — Toggle source visibility, mute/unmute audio, adjust volume with sliders
- **Performance stats** — CPU, FPS, RAM, disk space, dropped frames
- **Twitch Chat** — Live chat feed with user colors
- **Ding notifications** — Browser audio notification on new chat messages (toggleable)
- **Dashboard layout** — Full-screen grid layout optimized for 1920x1080

## Requirements

- [Node.js](https://nodejs.org/) 18+
- OBS Studio 28+ (includes obs-websocket v5)

## Setup

1. **Enable WebSocket in OBS**: `Tools` > `WebSocket Server Settings` > Enable, set a password

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure** (edit `server.js` or use env vars):
   ```bash
   OBS_HOST="ws://YOUR_OBS_IP:4455" OBS_PASSWORD="your_password" TWITCH_CHANNEL="your_channel" node server.js
   ```

4. **Open** `http://localhost:3000` (or `http://YOUR_MAC_IP:3000` from another machine)

## Tech Stack

- **obs-websocket-js** — OBS WebSocket v5 client
- **tmi.js** — Twitch chat (IRC)
- **Express** — Web server
- **Web Audio API** — Ding notifications (no sound files needed)
