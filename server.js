/**
 * GreekApp Twitch — Node.js Backend  v1.3.0
 * ============================================
 * All tools served from a single Node process.
 *
 * Endpoints:
 *   /                       → redirect to /app.html
 *   /app.html               → PWA main app
 *   /landingpage.html       → landing / install page
 *   /health                 → JSON health + service status
 *   /vod-sync               → twitch-vod-sync static app
 *   /streamlink             → Streamlink web controller UI  (built-in, no extra files)
 *   /streamlink/api/check   → GET  – is streamlink installed?
 *   /streamlink/api/qualities?url= → GET  – list stream qualities
 *   /streamlink/api/start   → POST – launch a stream in media player
 *   /streamlink/api/sessions → GET  – list sessions
 *   /streamlink/api/sessions/:id/logs → GET  – session logs
 *   /streamlink/api/sessions/:id → DELETE – kill session
 *   /streamlink/api/sessions → DELETE – kill all sessions
 *
 * Setup:
 *   npm install
 *   # Install streamlink on your OS: https://streamlink.github.io/install.html
 *   # Clone vod-sync: git clone https://github.com/remram44/twitch-vod-sync.git vod-sync-app
 *   node server.js
 */

'use strict';

const express              = require('express');
const path                 = require('path');
const { spawn, execFile }  = require('child_process');
const { v4: uuidv4 }       = require('uuid');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────
// CONFIG  (override via environment variables)
// ─────────────────────────────────────────
const PORT           = parseInt(process.env.PORT)  || 3000;
const STREAMLINK_BIN = process.env.STREAMLINK_BIN  || 'streamlink';   // full path if not in $PATH
const DEFAULT_PLAYER = process.env.DEFAULT_PLAYER  || '';              // e.g. 'vlc', 'mpv', leave blank for auto
const VOD_SYNC_PATH  = process.env.VOD_SYNC_PATH   || path.join(__dirname, 'vod-sync-app');
const PUBLIC_PATH    = path.join(__dirname, 'public');

// ─────────────────────────────────────────
// CORS + COMMON HEADERS
// ─────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ─────────────────────────────────────────
// IN-MEMORY SESSION STORE
// session: { id, url, quality, player, pid, process, startedAt, logs[] }
// ─────────────────────────────────────────
const sessions = new Map();

// ─────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────
app.get('/health', async (req, res) => {
    const slOk   = await checkStreamlinkInstalled();
    const vodOk  = require('fs').existsSync(path.join(VOD_SYNC_PATH, 'index.html'));
    res.json({
        status:    'ok',
        version:   '1.3.0',
        timestamp: new Date().toISOString(),
        services: {
            vod_sync:   { path: '/vod-sync',    available: vodOk },
            streamlink: { path: '/streamlink',  installed: slOk, active_sessions: sessions.size }
        }
    });
});

// ─────────────────────────────────────────
// VOD SYNC — serve static build
// ─────────────────────────────────────────
app.use('/vod-sync', express.static(VOD_SYNC_PATH, { index: 'index.html', fallthrough: true }));
app.get('/vod-sync/*', (req, res) => {
    res.sendFile(path.join(VOD_SYNC_PATH, 'index.html'), err => {
        if (err) res.status(404).send(missingAppHtml(
            'VOD Sync', 'vod-sync-app',
            'https://github.com/remram44/twitch-vod-sync'
        ));
    });
});

// ─────────────────────────────────────────
// STREAMLINK — REST API
// ─────────────────────────────────────────

/** GET /streamlink/api/check — is streamlink installed? */
app.get('/streamlink/api/check', async (req, res) => {
    try {
        const version = await getStreamlinkVersion();
        res.json({ installed: true, version });
    } catch (e) {
        res.status(503).json({ installed: false, error: e.message });
    }
});

/** GET /streamlink/api/qualities?url=<url> — list available qualities */
app.get('/streamlink/api/qualities', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param is required' });
    try {
        const qualities = await listQualities(url);
        res.json({ url, qualities });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** POST /streamlink/api/start — launch a stream
 *  Body: { url: string, quality?: string, player?: string }
 */
app.post('/streamlink/api/start', (req, res) => {
    const { url, quality = 'best', player } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const id   = uuidv4().slice(0, 8);
    const args = buildArgs(url, quality, player || DEFAULT_PLAYER);
    const logs = [`[${ts()}] Spawning: ${STREAMLINK_BIN} ${args.join(' ')}`];

    let proc;
    try {
        proc = spawn(STREAMLINK_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        return res.status(500).json({ error: `Failed to spawn streamlink: ${e.message}` });
    }

    const session = {
        id, url, quality,
        player:    player || DEFAULT_PLAYER || 'system default',
        pid:       proc.pid,
        process:   proc,
        startedAt: new Date().toISOString(),
        logs
    };
    sessions.set(id, session);

    proc.stdout.on('data', d => appendLog(session, d.toString()));
    proc.stderr.on('data', d => appendLog(session, d.toString()));
    proc.on('close', code => {
        appendLog(session, `Process exited (code ${code})`);
        session.pid     = null;
        session.process = null;
    });
    proc.on('error', err => appendLog(session, `ERROR: ${err.message}`));

    res.json({ id, url, quality, player: session.player, pid: proc.pid, startedAt: session.startedAt });
});

/** GET /streamlink/api/sessions — list sessions */
app.get('/streamlink/api/sessions', (req, res) => {
    res.json({ sessions: [...sessions.values()].map(safeSession) });
});

/** GET /streamlink/api/sessions/:id/logs — get logs */
app.get('/streamlink/api/sessions/:id/logs', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    res.json({ id: s.id, logs: s.logs });
});

/** DELETE /streamlink/api/sessions/:id — kill one session */
app.delete('/streamlink/api/sessions/:id', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });
    if (s.process) try { s.process.kill('SIGTERM'); } catch (_) {}
    sessions.delete(req.params.id);
    res.json({ killed: req.params.id });
});

/** DELETE /streamlink/api/sessions — kill ALL sessions */
app.delete('/streamlink/api/sessions', (req, res) => {
    for (const s of sessions.values()) {
        if (s.process) try { s.process.kill('SIGTERM'); } catch (_) {}
    }
    const count = sessions.size;
    sessions.clear();
    res.json({ killed: count });
});

// ─────────────────────────────────────────
// STREAMLINK — WEB UI (fully inline, no extra files)
// ─────────────────────────────────────────
app.get(['/streamlink', '/streamlink/'], (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildStreamlinkUI());
});

// ─────────────────────────────────────────
// PWA STATIC FILES  (public/)
// ─────────────────────────────────────────
app.use(express.static(PUBLIC_PATH, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('sw.js')) {
            res.setHeader('Service-Worker-Allowed', '/');
            res.setHeader('Cache-Control', 'no-cache');
        }
        if (filePath.endsWith('manifest.json')) {
            res.setHeader('Content-Type', 'application/manifest+json');
        }
    }
}));

app.get('/', (req, res) => res.redirect('/app.html'));

// ─────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────
function ts() {
    return new Date().toTimeString().slice(0, 8);
}

function appendLog(session, text) {
    text.trim().split('\n').filter(Boolean).forEach(l => {
        session.logs.push(`[${ts()}] ${l.trim()}`);
    });
    // Cap log buffer
    if (session.logs.length > 500) session.logs.splice(0, session.logs.length - 500);
}

function safeSession(s) {
    return {
        id: s.id, url: s.url, quality: s.quality, player: s.player,
        pid: s.pid, alive: !!s.process, startedAt: s.startedAt,
        logCount: s.logs.length
    };
}

function buildArgs(url, quality, player) {
    const args = [];
    if (player) args.push('--player', player);
    args.push(url, quality);
    return args;
}

function getStreamlinkVersion() {
    return new Promise((resolve, reject) => {
        execFile(STREAMLINK_BIN, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(`streamlink not found: ${err.message}`));
            resolve((stdout || stderr).trim());
        });
    });
}

function listQualities(url) {
    return new Promise((resolve, reject) => {
        execFile(STREAMLINK_BIN, [url, '--json'], { timeout: 20000 }, (err, stdout) => {
            if (err && !stdout) return reject(new Error(err.message));
            try {
                const data = JSON.parse(stdout);
                if (data.error) return reject(new Error(data.error));
                const q = Object.keys(data.streams || {});
                resolve(q.length ? q : fallbackQualities());
            } catch {
                resolve(fallbackQualities());
            }
        });
    });
}

function fallbackQualities() {
    return ['best', '1080p60', '1080p', '720p60', '720p', '480p', '360p', '160p', 'worst', 'audio_only'];
}

function checkStreamlinkInstalled() {
    return getStreamlinkVersion().then(() => true).catch(() => false);
}

function missingAppHtml(name, dir, repo) {
    return `<!DOCTYPE html><html><body style="font:16px monospace;padding:40px;background:#0d001f;color:#e0aaff">
    <h2>⚠️ ${name} not found</h2>
    <p style="margin:12px 0">Clone the repo into <code style="background:#1a0033;padding:2px 8px;border-radius:4px">./${dir}</code>:</p>
    <pre style="background:#1a0033;padding:14px;border-radius:8px;margin-top:8px">git clone ${repo} ${dir}</pre>
    <p style="margin-top:16px;color:rgba(157,78,221,.6)">Then restart the server.</p>
    </body></html>`;
}

// ─────────────────────────────────────────
// STREAMLINK WEB UI — inline HTML builder
// Served at GET /streamlink — no external files needed.
// ─────────────────────────────────────────
function buildStreamlinkUI() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Streamlink — GreekApp</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0d001f;--card:rgba(26,0,51,0.96);--border:rgba(157,78,221,0.4);--purple:#9d4edd;--purple-d:#7209b7;--pale:#e0aaff;--blue:#00b4d8;--red:#ff3333;--green:#00ff88;--text:rgba(187,134,252,0.85)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Rajdhani',sans-serif;background:var(--bg);color:var(--pale);min-height:100vh}
.bg{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse 70% 60% at 15% 20%,rgba(114,9,183,.25) 0%,transparent 65%),
             radial-gradient(ellipse 50% 50% at 85% 75%,rgba(0,180,216,.12) 0%,transparent 65%),
             linear-gradient(160deg,#0d001f 0%,#1a0033 60%,#0d001f 100%)}
.wrap{position:relative;z-index:1;max-width:960px;margin:0 auto;padding:24px 20px 60px}
.hdr{display:flex;align-items:center;gap:14px;padding:8px 0 28px;border-bottom:1px solid var(--border);margin-bottom:28px;flex-wrap:wrap}
.hdr-title{font-family:'Cinzel',serif;font-size:22px;font-weight:900;letter-spacing:3px;color:var(--pale);text-shadow:0 0 20px rgba(157,78,221,.5)}
.hdr-title span{display:block;font-size:10px;letter-spacing:5px;color:var(--blue);font-family:'Rajdhani',sans-serif;font-weight:700;margin-top:2px}
.version-pill{padding:4px 12px;background:rgba(157,78,221,.15);border:1px solid var(--border);border-radius:20px;font-size:11px;color:var(--purple);letter-spacing:1px}
.status-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.5px}
.chip-ok{background:rgba(0,255,136,.1);border:1px solid rgba(0,255,136,.3);color:var(--green)}
.chip-err{background:rgba(255,51,51,.1);border:1px solid rgba(255,51,51,.3);color:var(--red)}
.chip-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.ml-auto{margin-left:auto}
.card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:24px;margin-bottom:20px;backdrop-filter:blur(12px)}
.card-title{font-family:'Cinzel',serif;font-size:12px;letter-spacing:2px;color:var(--blue);margin-bottom:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card-title::after{content:'';flex:1;height:1px;background:linear-gradient(to right,rgba(0,180,216,.3),transparent)}
.form-grid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-bottom:12px}
.form-grid-3{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}
.form-group{display:flex;flex-direction:column;gap:6px}
.form-group label{font-size:10px;letter-spacing:3px;font-weight:700;color:var(--blue)}
input,select{background:rgba(0,0,0,.4);border:1px solid var(--border);border-radius:10px;color:var(--pale);font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:500;padding:10px 14px;outline:none;transition:border-color .2s,box-shadow .2s;width:100%}
input:focus,select:focus{border-color:var(--purple);box-shadow:0 0 0 3px rgba(157,78,221,.2)}
input::placeholder{color:rgba(157,78,221,.35)}
select option{background:#1a0033}
.btn{padding:10px 20px;border-radius:10px;border:none;font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:all .2s;white-space:nowrap;display:inline-flex;align-items:center;gap:7px}
.btn-primary{background:linear-gradient(135deg,var(--purple-d),var(--purple));color:#fff}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(157,78,221,.5)}
.btn-primary:disabled{opacity:.4;cursor:not-allowed;transform:none}
.btn-danger{background:rgba(255,51,51,.15);border:1px solid rgba(255,51,51,.4);color:var(--red)}
.btn-danger:hover{background:rgba(255,51,51,.3)}
.btn-sm{padding:6px 12px;font-size:10px;border-radius:7px}
.btn-ghost{background:rgba(157,78,221,.1);border:1px solid var(--border);color:var(--pale)}
.btn-ghost:hover{background:rgba(157,78,221,.25)}
.gap-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.sessions-list{display:flex;flex-direction:column;gap:10px}
.session-item{background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.live-dot{width:10px;height:10px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red);flex-shrink:0;animation:pulse 1.5s ease-in-out infinite}
.dead-dot{width:10px;height:10px;border-radius:50%;background:rgba(157,78,221,.3);flex-shrink:0}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,51,51,.7)}50%{box-shadow:0 0 0 6px rgba(255,51,51,0)}}
.session-info{flex:1;min-width:0}
.session-url{font-size:13px;font-weight:600;color:var(--pale);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.session-meta{font-size:11px;color:var(--text);margin-top:3px;letter-spacing:.3px}
.session-actions{display:flex;gap:7px;flex-shrink:0}
.empty{text-align:center;padding:28px;color:rgba(157,78,221,.4);font-size:13px}
.empty i{font-size:28px;display:block;margin-bottom:8px}
.log-box{background:rgba(0,0,0,.55);border:1px solid rgba(157,78,221,.2);border-radius:10px;padding:14px;height:190px;overflow-y:auto;font-family:monospace;font-size:12px;color:rgba(0,255,136,.8);line-height:1.6;white-space:pre-wrap;word-break:break-all}
.q-badge{display:inline-block;padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(157,78,221,.15);border:1px solid var(--border);color:var(--purple);margin:2px;cursor:pointer;transition:all .15s}
.q-badge:hover,.q-badge.sel{background:rgba(157,78,221,.5);border-color:var(--purple);color:#fff}
.msg{margin-top:10px;font-size:13px;min-height:20px}
@media(max-width:580px){.form-grid,.form-grid-3{grid-template-columns:1fr}.btn{width:100%;justify-content:center}}
</style>
</head>
<body>
<div class="bg"></div>
<div class="wrap">

  <div class="hdr">
    <div>
      <div class="hdr-title">Streamlink<span>GREEKAPP CONTROLLER</span></div>
    </div>
    <span id="sl-status" class="status-chip chip-err"><span class="chip-dot"></span>Checking…</span>
    <span class="version-pill" id="sl-ver">—</span>
    <span class="ml-auto">
      <a href="/app.html" class="btn btn-ghost btn-sm"><i class="fas fa-arrow-left"></i> Back to App</a>
    </span>
  </div>

  <!-- LAUNCH -->
  <div class="card">
    <div class="card-title"><i class="fas fa-broadcast-tower"></i> Launch Stream</div>
    <div class="form-grid" style="margin-bottom:12px">
      <div class="form-group">
        <label>STREAM URL</label>
        <input id="sl-url" type="url" placeholder="https://twitch.tv/channel" autocomplete="off">
      </div>
      <div class="form-group" style="justify-content:flex-end">
        <label>&nbsp;</label>
        <button class="btn btn-ghost btn-sm" onclick="fetchQualities()"><i class="fas fa-list"></i> Fetch Qualities</button>
      </div>
    </div>
    <div class="form-grid-3">
      <div class="form-group">
        <label>QUALITY</label>
        <select id="sl-quality">
          <option value="best">best</option>
          <option value="1080p60">1080p60</option>
          <option value="1080p">1080p</option>
          <option value="720p60">720p60</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
          <option value="360p">360p</option>
          <option value="160p">160p</option>
          <option value="audio_only">audio_only</option>
          <option value="worst">worst</option>
        </select>
      </div>
      <div class="form-group">
        <label>PLAYER (optional)</label>
        <input id="sl-player" placeholder="vlc / mpv / leave blank">
      </div>
      <div class="form-group" style="justify-content:flex-end">
        <label>&nbsp;</label>
        <button class="btn btn-primary" id="launch-btn" onclick="launchStream()">
          <i class="fas fa-play"></i> Launch
        </button>
      </div>
    </div>
    <div id="q-badges" style="margin-top:10px"></div>
    <div id="launch-msg" class="msg"></div>
  </div>

  <!-- SESSIONS -->
  <div class="card">
    <div class="card-title" style="justify-content:space-between">
      <span><i class="fas fa-list-ul"></i> Active Sessions</span>
      <span style="display:flex;gap:8px;align-items:center;margin-left:auto">
        <span id="s-count" style="font-size:11px;color:var(--text)">0 active</span>
        <button class="btn btn-ghost btn-sm" onclick="refreshSessions()"><i class="fas fa-sync"></i></button>
        <button class="btn btn-danger btn-sm" onclick="killAll()"><i class="fas fa-stop"></i> Kill All</button>
      </span>
    </div>
    <div class="sessions-list" id="sessions-list">
      <div class="empty"><i class="fas fa-satellite-dish"></i>No active streams</div>
    </div>
  </div>

  <!-- LOGS -->
  <div class="card">
    <div class="card-title"><i class="fas fa-terminal"></i> Session Logs</div>
    <select id="log-sel" onchange="loadLogs()" style="margin-bottom:10px">
      <option value="">— Select a session —</option>
    </select>
    <div class="log-box" id="log-box"></div>
    <div class="gap-row">
      <button class="btn btn-ghost btn-sm" onclick="loadLogs()"><i class="fas fa-sync"></i> Refresh</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('log-box').textContent=''"><i class="fas fa-trash"></i> Clear</button>
    </div>
  </div>

</div>
<script>
const API = '';

async function checkStatus() {
  try {
    const d = await fetch(API+'/streamlink/api/check').then(r=>r.json());
    const chip = document.getElementById('sl-status');
    if (d.installed) {
      chip.className='status-chip chip-ok';
      chip.innerHTML='<span class="chip-dot"></span>Streamlink Ready';
      document.getElementById('sl-ver').textContent = d.version;
    } else {
      chip.className='status-chip chip-err';
      chip.innerHTML='<span class="chip-dot"></span>Not Installed';
    }
  } catch {}
}

async function fetchQualities() {
  const url = document.getElementById('sl-url').value.trim();
  if (!url) return setMsg('Enter a URL first','orange');
  setMsg('<i class="fas fa-spinner fa-spin"></i> Fetching…','#aaa');
  try {
    const d = await fetch(API+'/streamlink/api/qualities?url='+encodeURIComponent(url)).then(r=>r.json());
    if (d.error) return setMsg('Error: '+d.error,'var(--red)');
    document.getElementById('q-badges').innerHTML =
      d.qualities.map(q=>\`<span class="q-badge" onclick="selQ(this,'\${q}')">\${q}</span>\`).join('');
    setMsg('Found '+d.qualities.length+' qualities','var(--green)');
  } catch(e) { setMsg('Failed: '+e.message,'var(--red)'); }
}

function selQ(el,q){
  document.querySelectorAll('.q-badge').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('sl-quality').value=q;
}

async function launchStream() {
  const url    = document.getElementById('sl-url').value.trim();
  const quality= document.getElementById('sl-quality').value;
  const player = document.getElementById('sl-player').value.trim();
  if (!url) return setMsg('Please enter a stream URL','orange');
  const btn = document.getElementById('launch-btn');
  btn.disabled=true;
  setMsg('<i class="fas fa-spinner fa-spin"></i> Launching…','#aaa');
  try {
    const d = await fetch(API+'/streamlink/api/start',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url,quality,player})
    }).then(r=>r.json());
    if (d.error) setMsg('Error: '+d.error,'var(--red)');
    else { setMsg('✅ Launched! Session: '+d.id+' · PID: '+d.pid,'var(--green)'); refreshSessions(); }
  } catch(e){ setMsg('Failed: '+e.message,'var(--red)'); }
  btn.disabled=false;
}

function setMsg(html,color){ const el=document.getElementById('launch-msg'); el.innerHTML=html; el.style.color=color||'var(--green)'; }

async function refreshSessions(){
  try {
    const d = await fetch(API+'/streamlink/api/sessions').then(r=>r.json());
    renderSessions(d.sessions);
  } catch {}
}

function renderSessions(list){
  document.getElementById('s-count').textContent=list.length+' active';
  const logSel=document.getElementById('log-sel');
  const prev=logSel.value;
  logSel.innerHTML='<option value="">— Select a session —</option>'+
    list.map(s=>\`<option value="\${s.id}">\${s.id} · \${shortUrl(s.url)} [\${s.quality}]</option>\`).join('');
  if(prev) logSel.value=prev;

  const el=document.getElementById('sessions-list');
  if(!list.length){ el.innerHTML='<div class="empty"><i class="fas fa-satellite-dish"></i>No active streams</div>'; return; }
  el.innerHTML=list.map(s=>\`
    <div class="session-item">
      <div class="\${s.alive?'live-dot':'dead-dot'}"></div>
      <div class="session-info">
        <div class="session-url" title="\${s.url}">\${shortUrl(s.url)}</div>
        <div class="session-meta">ID: \${s.id} &nbsp;·&nbsp; \${s.quality} &nbsp;·&nbsp; \${s.player||'default player'} &nbsp;·&nbsp; \${s.alive?'🟢 Live':'⚫ Ended'} &nbsp;·&nbsp; \${s.startedAt.slice(11,19)}</div>
      </div>
      <div class="session-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewLogs('\${s.id}')"><i class="fas fa-terminal"></i> Logs</button>
        <button class="btn btn-danger btn-sm" onclick="killSession('\${s.id}')"><i class="fas fa-stop"></i></button>
      </div>
    </div>
  \`).join('');
}

async function killSession(id){ await fetch(API+'/streamlink/api/sessions/'+id,{method:'DELETE'}); refreshSessions(); }
async function killAll(){ if(!confirm('Kill all sessions?')) return; await fetch(API+'/streamlink/api/sessions',{method:'DELETE'}); refreshSessions(); }

function viewLogs(id){ document.getElementById('log-sel').value=id; loadLogs(); }
async function loadLogs(){
  const id=document.getElementById('log-sel').value;
  const box=document.getElementById('log-box');
  if(!id){box.textContent='';return;}
  try {
    const d=await fetch(API+'/streamlink/api/sessions/'+id+'/logs').then(r=>r.json());
    box.textContent=d.logs.join('\\n');
    box.scrollTop=box.scrollHeight;
  } catch(e){box.textContent='Error: '+e.message;}
}

function shortUrl(url){ try{return new URL(url).pathname.replace('/','').split('/')[0]||url;}catch{return url;} }

checkStatus();
refreshSessions();
setInterval(refreshSessions,5000);
setInterval(checkStatus,30000);
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────
// START
// ─────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n⚡  GreekApp Twitch Backend  v1.3.0`);
    console.log(`─────────────────────────────────────────`);
    console.log(`   Landing page:  http://localhost:${PORT}/landingpage.html`);
    console.log(`   PWA App:       http://localhost:${PORT}/app.html`);
    console.log(`   VOD Sync:      http://localhost:${PORT}/vod-sync`);
    console.log(`   Streamlink UI: http://localhost:${PORT}/streamlink`);
    console.log(`   Health:        http://localhost:${PORT}/health`);
    console.log(`─────────────────────────────────────────`);
    console.log(`   streamlink binary: ${STREAMLINK_BIN}`);
    console.log(`   VOD sync path:     ${VOD_SYNC_PATH}`);
    console.log(`   Public path:       ${PUBLIC_PATH}\n`);
});
