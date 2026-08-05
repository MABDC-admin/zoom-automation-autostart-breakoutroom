import http from 'http';
import fs from 'fs';
import path from 'path';
import { createMeeting, listMeetings, getUserProfile, getMeetingDetails, generateSDKSignature } from './zoom-cli.js';
import { triggerMeetingStart, triggerMeetingEnd } from './auto-scheduler.js';

const PORT = 3105;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // API Endpoints
  if (url.pathname === '/api/user' && req.method === 'GET') {
    try {
      const user = await getUserProfile();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(user));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === '/api/meeting-details' && req.method === 'GET') {
    try {
      const meetingId = url.searchParams.get('id') || '83633925074';
      const details = await getMeetingDetails(meetingId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(details));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === '/api/auto-start' && req.method === 'POST') {
    try {
      const result = await triggerMeetingStart();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === '/api/auto-end' && req.method === 'POST') {
    try {
      const result = await triggerMeetingEnd();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Serve Zoom Dashboard with Host Direct Launcher
  if (url.pathname === '/' || url.pathname === '/viewer' || url.pathname === '/index.html') {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MABDC Zoom Live Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #151c2c;
      --accent: #2d8cff;
      --accent-hover: #0b5cff;
      --text: #f0f4f8;
      --text-muted: #8a99ad;
      --border: #232d42;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    html, body { height: 100%; width: 100%; overflow: hidden; background: var(--bg); color: var(--text); }
    
    .viewer-layout { display: flex; height: 100vh; width: 100vw; }
    
    /* Side Panel (10-15% Width) */
    .side-panel {
      width: 340px;
      min-width: 320px;
      background: var(--card-bg);
      border-right: 1px solid var(--border);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
      z-index: 100;
    }
    
    .header-title { font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between; }
    .status-badge { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid var(--success); font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px; }
    
    .info-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.85rem; }
    .info-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-size: 0.9rem; font-weight: 600; margin-top: 0.25rem; display: flex; align-items: center; justify-content: space-between; word-break: break-all; }
    
    .copy-btn { background: var(--border); border: none; color: var(--text); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: background 0.2s; }
    .copy-btn:hover { background: var(--accent); }
    
    .btn-action { width: 100%; color: white; border: none; padding: 0.75rem; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: background 0.2s; margin-top: 0.4rem; text-align: center; text-decoration: none; display: block; }
    .btn-start { background: var(--success); margin-top: 0; }
    .btn-start:hover { background: #059669; }
    .btn-host { background: var(--warning); color: #000; font-weight: 700; }
    .btn-host:hover { background: #d97706; color: #fff; }
    .btn-end { background: var(--danger); }
    .btn-end:hover { background: #dc2626; }

    .rooms-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.5rem; }
    .room-tag { background: var(--bg); border: 1px solid var(--border); padding: 0.4rem; border-radius: 4px; font-size: 0.75rem; text-align: center; }

    /* Main Display (90% Width) */
    .main-display {
      flex: 1;
      height: 100vh;
      background: #000;
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .toolbar-bar {
      height: 40px;
      background: #111827;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
      font-size: 0.85rem;
    }

    .player-area {
      flex: 1;
      position: relative;
      width: 100%;
      height: calc(100vh - 40px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at center, #1a233a 0%, #0b0f19 100%);
      padding: 2rem;
      text-align: center;
    }

    .launch-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .big-btn {
      padding: 1rem 1.5rem;
      font-size: 1.1rem;
      font-weight: 700;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      text-decoration: none;
      transition: transform 0.2s, background 0.2s;
    }
    .big-btn-host { background: var(--warning); color: #000; }
    .big-btn-host:hover { background: #d97706; color: #fff; transform: translateY(-2px); }
    .big-btn-primary { background: var(--accent); color: white; }
    .big-btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="viewer-layout">
    <!-- Side Info Panel (10-15%) -->
    <aside class="side-panel">
      <div class="header-title">
        <span>📹 MABDC Viewer</span>
        <span class="status-badge" id="live-status">ACTIVE</span>
      </div>

      <!-- Meeting Details -->
      <div class="info-card">
        <div class="info-label">Topic</div>
        <div class="info-value" id="meeting-topic">MABDC Zoom Meeting</div>
      </div>

      <div class="info-card">
        <div class="info-label">Meeting ID</div>
        <div class="info-value">
          <span id="meeting-id">83633925074</span>
          <button class="copy-btn" onclick="copyText('83633925074')">Copy</button>
        </div>
      </div>

      <div class="info-card">
        <div class="info-label">Numeric Passcode</div>
        <div class="info-value">
          <span id="meeting-pwd" style="color: var(--success); font-size: 1.1rem; font-weight: 700;">239206</span>
          <button class="copy-btn" onclick="copyText('239206')">Copy</button>
        </div>
      </div>

      <!-- Controls -->
      <div>
        <a href="#" id="side-host-btn" target="_blank" class="btn-action btn-host">🔑 Open Host Session (Broadcast Rooms)</a>
        <button class="btn-action btn-start" onclick="triggerAction('start')">🚀 Start Zoom & Configure Rooms</button>
        <button class="btn-action btn-end" onclick="triggerAction('end')">🚪 Close Rooms & End Zoom</button>
      </div>

      <!-- Grade 1 to 12 Breakout Rooms -->
      <div>
        <div class="info-label">Grade 1 - 12 Breakout Rooms</div>
        <div class="rooms-list">
          ${Array.from({ length: 12 }, (_, i) => `<div class="room-tag">Grade ${i + 1}</div>`).join('')}
        </div>
      </div>
    </aside>

    <!-- Main Display (90% Screen) -->
    <main class="main-display">
      <div class="toolbar-bar">
        <span>📺 MABDC Live Zoom Stream Hub</span>
      </div>

      <div class="player-area">
        <div class="launch-card">
          <h2 style="font-size: 1.4rem;">🔑 Host Session & Breakout Room Opener</h2>
          <p style="color: var(--text-muted); font-size: 0.9rem;">
            To broadcast Grade 1-12 Breakout Rooms to all guests, open as Host below and click <strong>"Open All Rooms"</strong>!
          </p>

          <a id="main-host-btn" href="#" target="_blank" class="big-btn big-btn-host">
            🔑 Launch Host Session (ZAK Authenticated)
          </a>

          <a href="https://zoom.us/wc/83633925074/join?pwd=4quJY4kaA71kjCtju0gPMCAsp6Uswn.1" target="_blank" class="big-btn big-btn-primary">
            🌐 Open Guest Live Stream
          </a>
        </div>
      </div>
    </main>
  </div>

  <script>
    function copyText(text) {
      navigator.clipboard.writeText(text);
      alert('Copied to clipboard: ' + text);
    }

    async function loadDetails() {
      try {
        const res = await fetch('/api/meeting-details?id=83633925074');
        const data = await res.json();
        if (res.ok && data.start_url) {
          document.getElementById('side-host-btn').href = data.start_url;
          document.getElementById('main-host-btn').href = data.start_url;
        }
      } catch (e) {}
    }

    async function triggerAction(action) {
      try {
        const res = await fetch('/api/auto-' + action, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert(action === 'start' ? '✅ Meeting Started & Breakout Rooms Configured!' : '✅ Meeting Closed & Rooms Ended!');
        loadDetails();
      } catch (err) {
        alert('❌ Error: ' + err.message);
      }
    }

    loadDetails();
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`🚀 Zoom Live Viewer Server running at http://localhost:${PORT}`);
});
