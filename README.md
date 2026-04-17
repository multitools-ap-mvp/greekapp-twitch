# Greek App Twitch
# V1.3.0 Stable
---

* Advanced Multi-Stream Twitch App
* Multi Stream LIVE & VOD
* Integrated Streamlink & vod-sync
* Fontend React
* Backend NODE.JS
* Selfhost
* Or Connect to our Running App

---

<img width="1024" height="1536" alt="Greeklogo" src="https://github.com/user-attachments/assets/87dfbf0e-303c-4667-b738-f561070a9562" />


# Name --------->  GreekAppTwitch
# Version -------> V1.3.0
# Type ----------->  PWA
# Built With ----> Node.js
# NW.JS
# Javascript
# HTML
# React
# Built By -------->  Multi Tools
# Thanks to -------> 

* Streamlink Twitch GUI 
* twitch-vod-sync
* Streamlink

---

## 📁 File Structure



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

## 🚀 Setup For Selfhost

### 1. Install dependencies
```bash
npm install
```

### 2. Clone twitch-vod-sync
```bash
git clone https://github.com/remram44/twitch-vod-sync.git vod-sync-app
```

### 3. Configure your Streamlink GUI
Set the URL of your Streamlink GUI server (e.g. streamlink-twitch-gui):
```bash
export STREAMLINK_URL=http://your-server:8088
```
Or edit `CONFIG.STREAMLINK_URL` directly in `public/app.html`.

### 4. Start the backend
```bash
npm start
# or for auto-reload during dev:
npm run dev
```

---

## 🌐 URLs

| Page | URL |
|------|-----|
| Landing Page | `http://localhost:3000/landingpage.html` |
| PWA App | `http://localhost:3000/app.html` |
| VOD Sync | `http://localhost:3000/vod-sync` |
| Health Check | `http://localhost:3000/health` |

---

## 📱 Installing the PWA

**Desktop (Chrome/Edge):** Visit the landing page → click "Install Now". Or look for the install icon in the address bar.

**Android:** Visit the landing page → tap "Install Now" → "Add to Home Screen".

**iPhone/iPad:** Visit the landing page → tap Safari's **Share** button → **Add to Home Screen**.

---

## 🔴 Live Multi-Stream (Streamlink)

The "Multi Stream LIVE" button opens your **Streamlink GUI** in a popup window.
You need to be running a Streamlink GUI server (e.g. [streamlink-twitch-gui](https://github.com/streamlink/streamlink-twitch-gui)) on your machine or a server.

Set the URL: edit `CONFIG.STREAMLINK_URL` in `app.html` or set env var `STREAMLINK_URL`.

Users can then select streams in the Streamlink GUI and open them in VLC or any media player.

---

## 🎬 VOD Sync

The "VOD Sync" button opens the `remram44/twitch-vod-sync` app served by your Node backend at `/vod-sync`. This opens in a popup window (not a browser).

---

## Selfhost 🔒 Deployment

For production, point your domain to the Node.js server and optionally use nginx as a reverse proxy with HTTPS. The PWA **requires HTTPS** for full functionality on mobile devices.

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
    }
}
```
---

## GreekApp Toolbar Widget

---

A Optional custom Toolbar for easy navigation between Live/Vod Mode. 

Fetch current results and other data by using Add your own shortcuts.
With auto Icon generation from URLs using favicon service.

Twitch Login function to be able to use Twitch APi to fetch Streams from source. 

---

<img width="997" height="2028" alt="Toolbar" src="https://github.com/user-attachments/assets/2812593d-e646-4679-94eb-2d4653a5229b" />

---

# Preview 

---


**App**
<img width="1080" height="2280" alt="Screenshot_20260416_231725_HTML Viewer" src="https://github.com/user-attachments/assets/1f0b8533-820b-440c-a529-64b763ab9eba" />

**Landingpage**
<img width="1080" height="2280" alt="Screenshot_20260416_231742_HTML Viewer" src="https://github.com/user-attachments/assets/cd9323f5-8253-4368-8fc8-59f501a63294" />
<img width="1080" height="2280" alt="Screenshot_20260416_231753_HTML Viewer" src="https://github.com/user-attachments/assets/2d6cfdd9-fbb5-439a-8d91-0dba62b0b21b" />
<img width="1080" height="2280" alt="Screenshot_20260416_231800_HTML Viewer" src="https://github.com/user-attachments/assets/8c8d1c4a-26da-47dd-b4b0-2c32abdf987d" />
---

# Links To Developers


## - twitch-vod-sync

Repo
https://github.com/remram44/twitch-vod-sync

## - Streamlink Twitch GUI

### GUI
https://streamlink.github.io/streamlink-twitch-gui/

## Streamlink 
https://streamlink.github.io/


# - Apex Multi Tool 
https://github.com/multitools-ap-mvp

---

# Link to WebApp
https://apexmultitools.se/GreekAppTwitch
