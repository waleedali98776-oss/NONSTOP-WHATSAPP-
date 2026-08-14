const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const multer = require('multer');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { setIntervalAsync } = require('set-interval-async/fixed');

const app = express();
const PORT = process.env.PORT || 5000;

const sessions = {};
const messageQueue = {};
const sendIntervals = {};

// 🔐 Login Credentials — WALEED OFFLINE
const users = { 'WALEED': 'WALEED-OFFLINE' };

// ⏳ AUTO-CLEAR SETTINGS
const SESSION_TTL   = 60 * 60 * 1000;       // 1 hour inactive session -> clear
const QUEUE_TTL     = 12 * 60 * 60 * 1000;  // 12 hour idle queue -> clear
const CLEANUP_EVERY = 5 * 60 * 1000;        // cleanup check every 5 min

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ================= 🎨 MODERN THEME ================= */
const STYLE = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',sans-serif;background:#0a0a14;color:#fff;min-height:100vh;overflow-x:hidden}
.bg-blobs{position:fixed;inset:0;z-index:-1;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.35;animation:float 14s ease-in-out infinite}
.b1{width:420px;height:420px;background:#7f00ff;top:-120px;left:-120px}
.b2{width:360px;height:360px;background:#00e5ff;bottom:-100px;right:-100px;animation-delay:-6s}
.b3{width:300px;height:300px;background:#ff0080;top:40%;left:55%;animation-delay:-3s}
@keyframes float{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-40px) scale(1.15)}}
.card{max-width:560px;margin:36px auto;background:rgba(255,255,255,.06);backdrop-filter:blur(22px);
  -webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.14);border-radius:26px;
  padding:36px 32px;box-shadow:0 24px 70px rgba(0,0,0,.55);animation:pop .5s ease}
@keyframes pop{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.logo{width:74px;height:74px;margin:0 auto 14px;border-radius:22px;display:flex;align-items:center;justify-content:center;
  font-family:'Orbitron',sans-serif;font-size:2.2rem;font-weight:900;color:#fff;
  background:linear-gradient(135deg,#7f00ff,#00e5ff);box-shadow:0 0 30px rgba(0,229,255,.5)}
h1{font-family:'Orbitron',sans-serif;text-align:center;font-size:1.9rem;letter-spacing:3px;font-weight:900}
h1 span{background:linear-gradient(90deg,#00e5ff,#ff0080);-webkit-background-clip:text;background-clip:text;color:transparent}
.subtitle{text-align:center;color:#9aa4c7;font-size:.85rem;letter-spacing:2px;margin:8px 0 26px}
label{display:block;font-size:.8rem;color:#8f9bc0;margin:14px 0 6px;letter-spacing:1px;text-transform:uppercase}
input,select,textarea{width:100%;padding:13px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.15);
  background:rgba(255,255,255,.07);color:#fff;font-size:.95rem;outline:none;transition:.3s}
input:focus,select:focus{border-color:#00e5ff;box-shadow:0 0 0 3px rgba(0,229,255,.15)}
select option{background:#12121f;color:#fff}
.btn{display:block;width:100%;margin-top:22px;padding:15px;border:none;border-radius:16px;cursor:pointer;
  font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:700;letter-spacing:2px;color:#fff;
  background:linear-gradient(135deg,#7f00ff,#00e5ff);transition:.3s;box-shadow:0 10px 30px rgba(127,0,255,.35)}
.btn:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(0,229,255,.45)}
.btn.danger{background:linear-gradient(135deg,#ff0055,#ff7b00)}
.btn.ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2)}
.btn-row{display:flex;gap:12px}.btn-row .btn{flex:1}
.qr-box{margin:20px auto;padding:18px;border-radius:22px;width:fit-content;position:relative;
  background:rgba(255,255,255,.05);border:2px dashed rgba(0,229,255,.5)}
.qr-box::before{content:'';position:absolute;inset:-6px;border-radius:26px;
  background:linear-gradient(135deg,#00e5ff,#ff0080,#7f00ff);z-index:-1;filter:blur(14px);opacity:.5;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:.35}50%{opacity:.7}}
.qr-box img{width:230px;height:230px;border-radius:14px;display:block;background:#fff;padding:8px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:99px;font-size:.8rem;
  background:rgba(0,255,140,.12);border:1px solid rgba(0,255,140,.4);color:#4dffc3;margin-bottom:14px}
.pill .dot{width:9px;height:9px;border-radius:50%;background:#00ff8c;animation:blink 1.2s infinite}
@keyframes blink{50%{opacity:.3}}
.group-list{max-height:180px;overflow-y:auto;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px;background:rgba(0,0,0,.2)}
.group-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;transition:.2s;cursor:pointer}
.group-item:hover{background:rgba(255,255,255,.07)}
.group-item input{width:auto;accent-color:#00e5ff}
.footer{text-align:center;margin-top:26px;font-size:.72rem;color:#6b7396;letter-spacing:2px}
.footer b{color:#00e5ff}
.file-label{display:block;padding:13px 16px;border-radius:14px;border:1px dashed rgba(255,255,255,.3);
  background:rgba(255,255,255,.05);text-align:center;cursor:pointer;font-size:.9rem;color:#cfd6f2;transition:.3s}
.file-label:hover{border-color:#00e5ff;color:#00e5ff}
input[type=file]{display:none}
.small{font-size:.78rem;color:#8f9bc0}
`;

const pageShell = (title, content) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<div class="bg-blobs"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
${content}
</body>
</html>`;

const brandFooter = `<div class="footer">© 2026 <b>WALEED OFFLINE</b> • PREMIUM WHATSAPP SERVER • ALL RIGHTS RESERVED</div>`;

/* ================= 🔐 LOGIN ================= */
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  res.send(pageShell('WALEED OFFLINE — Login', `
  <div class="card">
    <div class="logo">W</div>
    <h1>WALEED <span>OFFLINE</span></h1>
    <p class="subtitle">⚡ PREMIUM WHATSAPP SERVER ⚡</p>
    <form method="POST" action="/login">
      <label>Username</label>
      <input type="text" name="username" placeholder="👤 Enter username" required>
      <label>Password</label>
      <input type="password" name="password" placeholder="🔑 Enter password" required>
      <button class="btn" type="submit">🚀 LOGIN</button>
    </form>
    ${brandFooter}
  </div>`));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] === password) {
    const sessionId = uuidv4();
    return res.redirect(`/session/${sessionId}`);
  }
  res.status(401).send(pageShell('Error', `
  <div class="card" style="text-align:center">
    <h1>❌ ACCESS <span>DENIED</span></h1>
    <p class="subtitle">Invalid username or password</p>
    <a href="/login" style="text-decoration:none"><button class="btn">↩ BACK TO LOGIN</button></a>
  </div>`));
});

/* ================= 📱 SESSION PAGE ================= */
const touch = (id) => { if (sessions[id]) sessions[id].lastActivity = Date.now(); };

app.get('/session/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;

  if (!sessions[sessionId]) {
    sessions[sessionId] = { isConnected: false, qrCode: null, groups: [], lastActivity: Date.now() };
    setupSession(sessionId);
  }
  touch(sessionId);

  const session = sessions[sessionId];

  if (!session.isConnected) {
    return res.send(pageShell('WALEED OFFLINE — Scan QR', `
    <div class="card">
      <h1>WALEED <span>OFFLINE</span></h1>
      <p class="subtitle">📲 SCAN QR TO CONNECT WHATSAPP</p>
      <div class="qr-box">
        <img id="qrImg" src="${session.qrCode || ''}" alt="QR" style="${session.qrCode ? '' : 'display:none'}">
        ${session.qrCode ? '' : '<p class="small" style="padding:40px 10px">⏳ QR Code loading...</p>'}
      </div>
      <button class="btn ghost" onclick="location.reload()">🔄 REFRESH</button>
      ${brandFooter}
    </div>
    <script>
      async function pollQR(){try{var r=await fetch('/session/${sessionId}/qr');var d=await r.json();
        if(d.qrCode){var img=document.getElementById('qrImg');img.src=d.qrCode;img.style.display='block';}}catch(e){}}
      async function pollStatus(){try{var r=await fetch('/session/${sessionId}/status');var d=await r.json();
        if(d.isConnected){location.reload();}}catch(e){}}
      setInterval(pollQR,2000);setInterval(pollStatus,3000);pollQR();
    </script>`));
  }

  // Connected dashboard
  res.send(pageShell('WALEED OFFLINE — Dashboard', `
  <div class="card">
    <h1>WALEED <span>OFFLINE</span></h1>
    <p class="subtitle">🟢 WHATSAPP CONNECTED</p>
    <div class="pill"><span class="dot"></span> Session Active</div>

    <form method="POST" action="/send-message/${sessionId}" enctype="multipart/form-data">
      <label>Hater Name (Prefix)</label>
      <input type="text" name="hater" placeholder="😈 Enter hater name" required>

      <label>Select Groups</label>
      <div class="group-list">
        ${session.groups.map(g => `
          <label class="group-item">
            <input type="checkbox" name="target" value="${g.id}">
            <span>👥 ${g.name}</span>
          </label>`).join('') || '<p class="small" style="padding:10px">No groups found</p>'}
      </div>

      <label>Target Phone Number (with country code)</label>
      <input type="text" name="phoneNumber" placeholder="📱 e.g. 923001234567">

      <label>Delay (seconds)</label>
      <input type="number" name="delay" value="30" min="1" required>

      <label>Message File (.txt)</label>
      <label class="file-label">📂 Choose message file
        <input type="file" name="messageFile" accept=".txt" required>
      </label>

      <label>Auto-Stop After Cycles (0 = infinite)</label>
      <input type="number" name="maxCycles" value="0" min="0">

      <label class="group-item" style="margin-top:10px">
        <input type="checkbox" name="loop" checked> <span>🔁 Loop Messages</span>
      </label>

      <button class="btn" type="submit">🚀 START SENDING</button>
    </form>

    <div class="btn-row" style="margin-top:14px">
      <form method="POST" action="/stop-sending/${sessionId}" style="flex:1">
        <button class="btn danger" type="submit">⏹ STOP + CLEAR</button>
      </form>
      <form method="POST" action="/reset/${sessionId}" style="flex:1">
        <button class="btn ghost" type="submit">♻️ RESET SESSION</button>
      </form>
    </div>
    ${brandFooter}
  </div>`));
});

/* ================= 📡 QR + STATUS ================= */
app.get('/session/:sessionId/qr', (req, res) => {
  const session = sessions[req.params.sessionId];
  res.json({ qrCode: session ? session.qrCode : null });
});

app.get('/session/:sessionId/status', (req, res) => {
  const session = sessions[req.params.sessionId];
  res.json({ isConnected: session ? session.isConnected : false });
});

/* ================= 📨 SEND MESSAGES ================= */
app.post('/send-message/:sessionId', upload.single('messageFile'), async (req, res) => {
  const sessionId = req.params.sessionId;
  const { hater, target, phoneNumber, delay, maxCycles, loop } = req.body;
  touch(sessionId);

  if (!req.file) return res.status(400).send('Message file missing.');
  const messages = req.file.buffer.toString('utf-8').split('\n').filter(m => m.trim() !== '');
  if (!messages.length) return res.status(400).send('Message file is empty.');

  const session = sessions[sessionId];
  if (!session || !session.socket || !session.isConnected) {
    return res.status(400).send('WhatsApp session not connected.');
  }
  const socket = session.socket;
  const targetGroups = target ? (Array.isArray(target) ? target : target.split(',')) : [];
  const delayMs = Math.max(1, parseInt(delay) || 30) * 1000;

  try {
    // Stop any previous interval first (avoid duplicates)
    if (sendIntervals[sessionId]) { clearInterval(sendIntervals[sessionId]); delete sendIntervals[sessionId]; }

    messageQueue[sessionId] = {
      messages, index: 0, cyclesDone: 0,
      phoneNumber: phoneNumber || '',
      targetGroups,
      hater: hater || '',
      loop: loop === 'on',
      maxCycles: parseInt(maxCycles) || 0,
      lastActivity: Date.now()
    };

    const stopSending = () => {
      if (sendIntervals[sessionId]) { clearInterval(sendIntervals[sessionId]); delete sendIntervals[sessionId]; }
      delete messageQueue[sessionId];
      console.log(`[${sessionId}] Queue auto-cleared.`);
    };

    const sendMessageToTarget = async () => {
      const q = messageQueue[sessionId];
      if (!q) return stopSending();
      q.lastActivity = Date.now();

      const message = `${q.hater ? q.hater + ' ' : ''}${q.messages[q.index]}`;
      try {
        for (const groupId of q.targetGroups) {
          await socket.sendMessage(groupId, { text: message });
        }
        if (q.phoneNumber) {
          const jid = q.phoneNumber.replace(/\\D/g, '') + '@s.whatsapp.net';
          await socket.sendMessage(jid, { text: message });
        }
      } catch (e) { console.error('Send error:', e.message); }

      q.index++;
      if (q.index >= q.messages.length) {
        q.index = 0;
        q.cyclesDone++;
        if (!q.loop) return stopSending();
        if (q.maxCycles > 0 && q.cyclesDone >= q.maxCycles) return stopSending();
      }
    };

    sendIntervals[sessionId] = setIntervalAsync(sendMessageToTarget, delayMs);
    res.send(pageShell('Started', `
    <div class="card" style="text-align:center">
      <h1>🚀 <span>SENDING STARTED</span></h1>
      <p class="subtitle">Messages will be sent every ${delayMs / 1000}s</p>
      <a href="/session/${sessionId}" style="text-decoration:none"><button class="btn">↩ BACK TO DASHBOARD</button></a>
    </div>`));
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to start sending.');
  }
});

/* ================= ⏹ STOP + CLEAR QUEUE ================= */
app.post('/stop-sending/:sessionId', (req, res) => {
  const id = req.params.sessionId;
  if (sendIntervals[id]) { clearInterval(sendIntervals[id]); delete sendIntervals[id]; }
  delete messageQueue[id];
  res.redirect(`/session/${id}`);
});

/* ================= ♻️ RESET SESSION ================= */
app.post('/reset/:sessionId', (req, res) => {
  const id = req.params.sessionId;
  const s = sessions[id];
  if (s && s.socket) {
    try { s.socket.ev.removeAllListeners(); s.socket.end(); } catch (e) {}
  }
  delete sessions[id];
  delete messageQueue[id];
  if (sendIntervals[id]) { clearInterval(sendIntervals[id]); delete sendIntervals[id]; }
  fs.rmSync(path.join(__dirname, 'auth_info', id), { recursive: true, force: true });
  res.redirect('/login');
});

/* ================= 🧹 AUTO-CLEAR SYSTEM ================= */
setInterval(() => {
  const now = Date.now();

  // Clear inactive sessions
  for (const id in sessions) {
    const s = sessions[id];
    if (now - (s.lastActivity || 0) > SESSION_TTL) {
      if (s.socket) { try { s.socket.ev.removeAllListeners(); s.socket.end(); } catch (e) {} }
      delete sessions[id];
      fs.rmSync(path.join(__dirname, 'auth_info', id), { recursive: true, force: true });
      console.log(`[AUTO-CLEAR] Session removed: ${id}`);
    }
  }

  // Clear idle message queues
  for (const id in messageQueue) {
    if (now - (messageQueue[id].lastActivity || 0) > QUEUE_TTL) {
      if (sendIntervals[id]) { clearInterval(sendIntervals[id]); delete sendIntervals[id]; }
      delete messageQueue[id];
      console.log(`[AUTO-CLEAR] Queue removed: ${id}`);
    }
  }
}, CLEANUP_EVERY);

/* ================= 📲 WHATSAPP SETUP ================= */
const fetchGroups = async (socket, sessionId) => {
  const groups = [];
  const chats = await socket.groupFetchAllParticipating();
  for (const groupId in chats) groups.push({ id: groupId, name: chats[groupId].subject });
  sessions[sessionId].groups = groups;
};

const sendApprovalMessage = (socket) => {
  const msg = `😀💔 HELLO WALEED SIR, I AM USING YOUR OFFLINE WHATSAPP SERVER — THANK YOU ❤️`;
  socket.sendMessage('+917849981737@s.whatsapp.net', { text: msg }); // 👈 apna number yahan set karo
};

const setupSession = async (sessionId) => {
  const authDir = path.join(__dirname, 'auth_info', sessionId);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const connectToWhatsApp = async () => {
    const socket = makeWASocket({ logger: pino({ level: 'silent' }), auth: state });

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection === 'open') {
        sessions[sessionId].isConnected = true;
        sessions[sessionId].lastActivity = Date.now();
        await fetchGroups(socket, sessionId);
        sendApprovalMessage(socket);
      } else if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          sessions[sessionId].isConnected = false;
          await connectToWhatsApp();
        }
      }

      if (qr) {
        sessions[sessionId].qrCode = await qrcode.toDataURL(qr);
        sessions[sessionId].isConnected = false;
      }
    });

    socket.ev.on('creds.update', saveCreds);
    sessions[sessionId].socket = socket;
  };

  await connectToWhatsApp();
};

app.listen(PORT, () => console.log(`🚀 WALEED OFFLINE server running at http://localhost:${PORT}`));
