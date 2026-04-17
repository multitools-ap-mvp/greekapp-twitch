# GreekApp Twitch PWA — Deployment Guide to Selfhost
> Version 1.3.0 · ApexMultiTools

---

## Overview

GreekApp Twitch is a self-hosted PWA served entirely from a single Node.js process.

 — the backend spawns Streamlink directly and
exposes it through a built-in web controller at `/streamlink`.

```
Browser / PWA
     │
     ▼
Node.js  (server.js, port 3000)
  ├── /                  → redirect → /app.html
  ├── /app.html          → PWA toolbar app
  ├── /landingpage.html  → install landing page
  ├── /manifest.json     → PWA manifest
  ├── /sw.js             → service worker
  ├── /health            → JSON status of all services
  ├── /vod-sync          → twitch-vod-sync (static, cloned locally)
  └── /streamlink        → Streamlink web controller UI + REST API
         ├── GET  /streamlink/api/check
         ├── GET  /streamlink/api/qualities?url=
         ├── POST /streamlink/api/start
         ├── GET  /streamlink/api/sessions
         ├── GET  /streamlink/api/sessions/:id/logs
         └── DELETE /streamlink/api/sessions[/:id]
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js ≥ 18** | [nodejs.org](https://nodejs.org) |
| **Streamlink** | [streamlink.github.io/install](https://streamlink.github.io/install.html) |
| **Media player** | VLC, MPV, or any player Streamlink supports |
| **Git** | To clone vod-sync |

---

## Directory Structure

```
greekapp-twitch/
├── public/                   ← web root, served as static files
│   ├── app.html              ← PWA main app
│   ├── landingpage.html      ← landing / install page
│   ├── manifest.json         ← PWA web manifest
│   ├── sw.js                 ← service worker
│   └── resources/
│       └── Greeklogo.png     ← app icon
├── vod-sync-app/             ← cloned twitch-vod-sync (see step 3)
├── server.js                 ← Node.js backend (everything runs from here)
├── package.json
└── README.md
```

---

## Installation

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install Streamlink

**Windows**
```powershell
winget install streamlink
# or download installer from https://streamlink.github.io/install.html
```

**macOS**
```bash
brew install streamlink
```

**Linux (Debian/Ubuntu)**
```bash
sudo apt install streamlink
# or via pip:
pip install streamlink
```

Verify:
```bash
streamlink --version
```

### 3. Clone VOD Sync app

```bash
git clone https://github.com/remram44/twitch-vod-sync.git vod-sync-app
```

```
public/
├── app.html
├── landingpage.html
├── manifest.json
├── sw.js
└── resources/
    └── Greeklogo.png
```

---

## Running the Server

```bash
# Production
npm start

# Development (auto-restart on file changes)
npm run dev
```

Server console output:
```
⚡  GreekApp Twitch Backend  v1.3.0
─────────────────────────────────────────
   Landing page:  http://localhost:3000/landingpage.html
   PWA App:       http://localhost:3000/app.html
   VOD Sync:      http://localhost:3000/vod-sync
   Streamlink UI: http://localhost:3000/streamlink
   Health:        http://localhost:3000/health
```

---

## Environment Variables

All config can be overridden without editing server.js:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `STREAMLINK_BIN` | `streamlink` | Full path to streamlink binary if not in `$PATH` |
| `DEFAULT_PLAYER` | *(blank)* | Default media player (`vlc`, `mpv`, etc.). Blank = Streamlink decides |
| `VOD_SYNC_PATH` | `./vod-sync-app` | Path to cloned twitch-vod-sync directory |

**Example (Linux/macOS):**
```bash
PORT=8080 STREAMLINK_BIN=/usr/local/bin/streamlink DEFAULT_PLAYER=vlc node server.js
```

**Example (Windows PowerShell):**
```powershell
$env:PORT=8080; $env:DEFAULT_PLAYER="vlc"; node server.js
```

---

## Streamlink Web Controller

Accessible at `http://localhost:3000/streamlink`

The controller opens in a popup window when users click **Multi Stream LIVE** in the PWA.

**Features:**
- **Status indicator** — shows if streamlink is installed and its version
- **Fetch Qualities** — queries available stream qualities for any URL before launching
- **Launch Stream** — spawns `streamlink <url> <quality> --player <player>`
- **Active Sessions** — live list of all running streams, auto-refreshes every 5 seconds
- **Kill controls** — stop individual sessions or all at once
- **Log viewer** — per-session stdout/stderr tail (last 500 lines)

**REST API** (can be called from scripts or other tools):

```bash
# Check if streamlink is installed
GET /streamlink/api/check

# List qualities for a stream
GET /streamlink/api/qualities?url=https://twitch.tv/channel

# Start a stream
POST /streamlink/api/start
Content-Type: application/json
{ "url": "https://twitch.tv/channel", "quality": "best", "player": "vlc" }

# List all sessions
GET /streamlink/api/sessions

# Get logs for a session
GET /streamlink/api/sessions/<id>/logs

# Kill a session
DELETE /streamlink/api/sessions/<id>

# Kill all sessions
DELETE /streamlink/api/sessions
```

---

## VOD Sync

Accessible at `http://localhost:3000/vod-sync`

Served from the cloned `vod-sync-app/` directory as a static site.
The PWA opens this in a popup window when users click **VOD Sync**.

If the directory is missing, visiting `/vod-sync` shows a friendly error with the clone command.

---

## Installing the PWA

**Desktop (Chrome / Edge / Brave):**
Visit `http://yourserver/landingpage.html` → click **Install Now** → browser install prompt appears.
Or click the install icon (⊕) in the browser address bar.

**Android:**
Visit the landing page in Chrome → tap **Install Now** → **Add to Home Screen**.

**iPhone / iPad:**
Visit the landing page in Safari → tap the **Share** button → **Add to Home Screen**.
> PWA install banners are not available on iOS Safari; the landing page shows the share instructions automatically.

> **Important:** PWA install requires **HTTPS** on any real domain. `

---

## Production Deployment (with HTTPS)

Use nginx as a reverse proxy in front of Node:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

Get a free SSL cert with Certbot:
```bash
certbot --nginx -d yourdomain.com
```

Keep the Node process running with PM2:
```bash
npm install -g pm2
pm2 start server.js --name greekapp
pm2 save
pm2 startup
```

---

## Health Check

`GET /health` returns a JSON snapshot of all services:

```json
{
  "status": "ok",
  "version": "1.3.0",
  "timestamp": "2026-04-17T12:00:00.000Z",
  "services": {
    "vod_sync":   { "path": "/vod-sync",   "available": true },
    "streamlink": { "path": "/streamlink", "installed": true, "active_sessions": 2 }
  }
}
```

The PWA app pings this endpoint every 30 seconds to show the backend status indicator.

---

## Troubleshooting

**`streamlink not found` in the controller:**
Make sure streamlink is in your `$PATH`, or set `STREAMLINK_BIN` to the full path.
```bash
which streamlink          # Linux/macOS
where streamlink          # Windows
```

**VOD Sync shows "not found":**
Clone the repo: `git clone https://github.com/remram44/twitch-vod-sync.git vod-sync-app`

**PWA install button doesn't appear:**
The browser's `beforeinstallprompt` event only fires when all PWA criteria are met (HTTPS, manifest, service worker, not already installed). On localhost this works in Chrome/Edge without HTTPS.

**Popup blocked when clicking Live/VOD in the app:**
Allow popups for the site in your browser settings.

---

© 2024–2026 ApexMultiTools · [apexmultitools.se](https://apexmultitools.se)
