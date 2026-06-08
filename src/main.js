const { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');
const { Bonjour } = require('bonjour-service');
const fs = require('fs');
const {
  createTextPayload,
  createImagePayload,
  decodeImagePayload,
  hashString,
  hashBuffer,
} = require('./clipboardPayload');
const {
  createRememberedPeer,
  getReconnectCandidates,
} = require('./rememberedPeers');
const {
  createCryptoIdentity,
  deriveSessionKey,
  createVerificationCode,
  encryptPayload,
  decryptPayload,
} = require('./secureTransport');
const {
  isTrustedPeer,
  upsertTrustedPeer,
} = require('./trustedPeers');

const storePath = path.join(os.homedir(), '.copybridge-prototype.json');
const store = {
  data: (() => {
    try { return JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch { return {}; }
  })(),
  get(key, fallback) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback; },
  set(key, value) {
    this.data[key] = value;
    try { fs.writeFileSync(storePath, JSON.stringify(this.data, null, 2)); } catch {}
  },
};
const PORT = Number(process.env.COPYBRIDGE_PORT || store.get('port', 47631));
const DEVICE_NAME = process.env.COPYBRIDGE_NAME || store.get('deviceName', os.hostname().replace('.local', ''));
const DEVICE_ID = process.env.COPYBRIDGE_ID || store.get('deviceId') || crypto.randomUUID();
store.set('deviceId', DEVICE_ID);
const CRYPTO_IDENTITY = store.get('cryptoIdentity') || createCryptoIdentity();
store.set('cryptoIdentity', CRYPTO_IDENTITY);
const SERVICE_TYPE = 'copybridge';
const POLL_MS = 650;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const REMEMBERED_RECONNECT_DELAY_MS = 450;
const REMEMBERED_RECONNECT_INTERVAL_MS = 5000;

let mainWindow;
let tray;
let bonjour;
let service;
let browser;
let server;
let syncEnabled = store.get('syncEnabled', true);
let lastLocalHash = '';
let lastAppliedRemoteHash = '';
let lastSentHash = '';
let lastLocalImageHash = '';
let lastAppliedRemoteImageHash = '';
let lastSentImageHash = '';
let peers = new Map();
let logs = [];
let reconnectTimer = null;

const state = {
  deviceName: DEVICE_NAME,
  deviceId: DEVICE_ID,
  port: PORT,
  syncEnabled,
  peers: [],
  lastSync: null,
  status: 'starting',
  statusDetail: 'Starting CopyBridge',
  localAddress: getLocalAddress(),
};

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function log(message, level = 'info') {
  const item = { id: Date.now() + Math.random(), time: nowTime(), message, level };
  logs = [item, ...logs].slice(0, 80);
  console.log(`[${level}] ${message}`);
  broadcastState();
}

function getLocalAddress() {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function createWindow() {
  if (process.env.COPYBRIDGE_HEADLESS === '1') return;
  const rendererPath = path.join(__dirname, 'renderer', 'index.html');
  mainWindow = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    title: 'CopyBridge',
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log(`Window failed to load: ${errorDescription} (${errorCode}) ${validatedURL}`, 'error');
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`Window renderer stopped: ${details.reason}`, 'error');
  });
  mainWindow.webContents.on('console-message', (_event, detailsOrLevel, maybeMessage) => {
    const level = typeof detailsOrLevel === 'object' ? detailsOrLevel.level : detailsOrLevel;
    const message = typeof detailsOrLevel === 'object' ? detailsOrLevel.message : maybeMessage;
    if (level >= 2 && !String(message).includes('Electron Security Warning')) {
      log(`Window console: ${message}`, 'warn');
    }
  });
  mainWindow.loadFile(rendererPath).catch((error) => {
    log(`Window load failed: ${error.message}`, 'error');
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!doctype html>
      <html>
        <body style="margin:0;background:#0b1020;color:#f8fafc;font:16px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh">
          <div style="max-width:560px;padding:32px">
            <h1 style="margin:0 0 12px;font-size:28px">CopyBridge could not load its interface</h1>
            <p style="margin:0;color:#94a3b8;line-height:1.5">Renderer file was not found or could not be opened.</p>
            <p style="margin:16px 0 0;color:#94a3b8;line-height:1.5">${rendererPath}</p>
          </div>
        </body>
      </html>
    `)}`);
  });
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  if (process.env.COPYBRIDGE_HEADLESS === '1') return;
  const icon = nativeImage.createFromDataURL('data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="5" y="7" width="22" height="18" rx="6" fill="#7c3aed"/><path d="M11 16h10M16 11v10" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>`));
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('CopyBridge');
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const connected = [...peers.values()].filter(p => p.connected).length;
  const template = [
    { label: `CopyBridge — ${connected} connected`, enabled: false },
    { type: 'separator' },
    { label: syncEnabled ? 'Pause sync' : 'Resume sync', click: () => setSyncEnabled(!syncEnabled) },
    { label: 'Show window', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function sanitizePeerId(peer) {
  return peer.deviceId || `${peer.host}:${peer.port}`;
}

function peerSnapshot() {
  return [...peers.values()].map(peer => ({
    id: peer.id,
    name: peer.name,
    host: peer.host,
    port: peer.port,
    connected: peer.connected,
    secure: Boolean(peer.sessionKey),
    trusted: Boolean(peer.trusted),
    verificationCode: peer.trusted ? null : peer.verificationCode,
    discoveredBy: peer.discoveredBy,
    lastSeen: peer.lastSeen,
  }));
}

function refreshStatus() {
  const connectedCount = [...peers.values()].filter(p => p.connected).length;
  state.status = connectedCount > 0 ? 'connected' : state.status === 'reconnecting' ? 'reconnecting' : 'waiting';
  state.peers = peerSnapshot();
  state.syncEnabled = syncEnabled;
  state.localAddress = getLocalAddress();
  if (connectedCount > 0) {
    state.statusDetail = `${connectedCount} device${connectedCount === 1 ? '' : 's'} ready`;
  } else if (state.status === 'reconnecting') {
    state.statusDetail = state.statusDetail || 'Reconnecting to your other computer';
  } else {
    state.statusDetail = 'Looking for your other computer';
  }
  updateTrayMenu();
}

function broadcastState() {
  refreshStatus();
  const payload = { ...state, logs };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state', payload);
  }
}

function startServer() {
  server = new WebSocket.Server({ port: PORT });
  server.on('connection', (socket, request) => {
    const host = request.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
    bindSocket(socket, { name: 'Incoming device', host, port: 0, discoveredBy: 'incoming' });
  });
  server.on('listening', () => {
    log(`Listening on ${getLocalAddress()}:${PORT}`);
    broadcastState();
  });
  server.on('error', (error) => {
    log(`Network server error: ${error.message}`, 'error');
  });
}

function bindSocket(socket, peerInfo) {
  const id = sanitizePeerId(peerInfo);
  const existing = peers.get(id) || {};
  const peer = {
    ...existing,
    id,
    deviceId: peerInfo.deviceId || existing.deviceId || null,
    name: peerInfo.name || existing.name || 'Unknown device',
    host: peerInfo.host,
    port: peerInfo.port,
    socket,
    connected: true,
    discoveredBy: peerInfo.discoveredBy || existing.discoveredBy || 'manual',
    lastSeen: nowTime(),
  };
  peers.set(id, peer);
  log(`Connected to ${peer.name}`);
  broadcastState();

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handlePeerMessage(peer, msg, socket);
    } catch (error) {
      log(`Ignored invalid message from ${peer.name}`, 'warn');
    }
  });

  socket.on('close', () => {
    const currentId = peer.id;
    const current = peers.get(currentId);
    if (current && current.socket === socket) {
      current.connected = false;
      current.socket = null;
      current.lastSeen = nowTime();
      peers.set(currentId, current);
      log(`Disconnected from ${current.name}`, 'warn');
      broadcastState();
    }
  });

  socket.on('error', () => {
    const current = peers.get(peer.id);
    if (current && current.socket === socket) current.connected = false;
    broadcastState();
  });

  sendRaw(peer, {
    type: 'hello',
    name: DEVICE_NAME,
    deviceId: DEVICE_ID,
    port: PORT,
    publicKey: CRYPTO_IDENTITY.publicKey,
  });
}

function handlePeerMessage(peer, msg, socket) {
  if (msg.type === 'hello') {
    if (msg.deviceId === DEVICE_ID) {
      try { socket.close(); } catch {}
      return;
    }
    if (msg.deviceId && msg.deviceId !== peer.id) {
      const previousId = peer.id;
      const oldPeer = peers.get(previousId);
      peers.delete(previousId);
      const existing = peers.get(msg.deviceId);
      if (existing?.socket && existing.socket !== socket && existing.socket.readyState === WebSocket.OPEN) {
        try { existing.socket.close(); } catch {}
      }
      peer.id = msg.deviceId;
      peer.deviceId = msg.deviceId;
      peer.socket = socket;
      peer.host = oldPeer?.host || peer.host;
      peer.discoveredBy = oldPeer?.discoveredBy || peer.discoveredBy;
    }
    peer.name = msg.name || peer.name;
    peer.port = msg.port || peer.port;
    if (msg.publicKey) {
      try {
        peer.publicKey = msg.publicKey;
        peer.sessionKey = deriveSessionKey({
          localPrivateKey: CRYPTO_IDENTITY.privateKey,
          remotePublicKey: msg.publicKey,
          localDeviceId: DEVICE_ID,
          remoteDeviceId: peer.deviceId,
        });
        peer.verificationCode = createVerificationCode(peer.sessionKey);
        peer.trusted = isTrustedPeer(store.get('trustedPeers', []), peer);
        log(peer.trusted
          ? `Secure trusted channel ready with ${peer.name}`
          : `Secure channel ready with ${peer.name}; waiting for verification`);
      } catch (error) {
        log(`Secure channel failed with ${peer.name}: ${error.message}`, 'error');
      }
    }
    peer.lastSeen = nowTime();
    peers.set(peer.id, peer);
    rememberPeer(peer);
    broadcastState();
    return;
  }

  if (msg.type === 'secure-clipboard' && syncEnabled) {
    if (!peer.sessionKey) {
      log(`Ignored encrypted clipboard from ${peer.name}: secure channel is not ready`, 'warn');
      return;
    }
    if (!peer.trusted) {
      log(`Ignored encrypted clipboard from ${peer.name}: verification is required`, 'warn');
      return;
    }

    try {
      handleClipboardPayload(peer, decryptPayload(msg, peer.sessionKey));
    } catch (error) {
      log(`Encrypted clipboard failed from ${peer.name}: ${error.message}`, 'error');
    }
    return;
  }

  handleClipboardPayload(peer, msg);
}

function handleClipboardPayload(peer, payload) {
  if (payload.type === 'clipboard' && typeof payload.text === 'string' && syncEnabled) {
    const incomingHash = payload.hash || hashString(payload.text);
    const currentHash = hashString(clipboard.readText());
    if (incomingHash === currentHash || incomingHash === lastAppliedRemoteHash) return;
    lastAppliedRemoteHash = incomingHash;
    lastLocalHash = incomingHash;
    clipboard.writeText(payload.text);
    state.lastSync = { kind: 'text', direction: 'received', device: peer.name, time: nowTime(), length: payload.text.length };
    log(`Received encrypted clipboard from ${peer.name} (${payload.text.length} chars)`);
    broadcastState();
    return;
  }

  if (payload.type === 'clipboard-image' && typeof payload.png === 'string' && syncEnabled) {
    try {
      const decoded = decodeImagePayload(payload);
      if (!decoded.buffer.length || decoded.buffer.length > MAX_IMAGE_BYTES) {
        log(`Ignored image from ${peer.name}: unsupported size`, 'warn');
        return;
      }

      const incomingHash = payload.hash || hashBuffer(decoded.buffer);
      const currentImage = clipboard.readImage();
      const currentHash = currentImage.isEmpty() ? '' : hashBuffer(currentImage.toPNG());
      if (incomingHash === currentHash || incomingHash === lastAppliedRemoteImageHash) return;

      const image = nativeImage.createFromBuffer(decoded.buffer);
      if (image.isEmpty()) {
        log(`Ignored invalid image from ${peer.name}`, 'warn');
        return;
      }

      lastAppliedRemoteImageHash = incomingHash;
      lastLocalImageHash = incomingHash;
      clipboard.writeImage(image);
      const size = image.getSize();
      state.lastSync = {
        kind: 'image',
        direction: 'received',
        device: peer.name,
        time: nowTime(),
        width: size.width || decoded.width,
        height: size.height || decoded.height,
        bytes: decoded.buffer.length,
      };
      log(`Received encrypted image from ${peer.name} (${state.lastSync.width}×${state.lastSync.height})`);
      broadcastState();
    } catch (error) {
      log(`Image receive failed from ${peer.name}: ${error.message}`, 'error');
    }
  }
}

function sendRaw(peer, payload) {
  if (!peer?.socket || peer.socket.readyState !== WebSocket.OPEN) return false;
  peer.socket.send(JSON.stringify(payload));
  return true;
}

function sendClipboardPayload(peer, payload) {
  if (!peer.sessionKey || !peer.trusted) return false;
  return sendRaw(peer, encryptPayload(payload, peer.sessionKey));
}

function broadcastClipboard(text) {
  const textHash = hashString(text);
  if (textHash === lastSentHash) return;
  lastSentHash = textHash;
  let count = 0;
  for (const peer of peers.values()) {
    if (peer.connected && sendClipboardPayload(peer, createTextPayload(text, { from: DEVICE_NAME }))) {
      count++;
    }
  }
  if (count > 0) {
    state.lastSync = { kind: 'text', direction: 'sent', device: `${count} device${count === 1 ? '' : 's'}`, time: nowTime(), length: text.length };
    log(`Sent encrypted clipboard to ${count} device${count === 1 ? '' : 's'} (${text.length} chars)`);
    broadcastState();
  }
}

function broadcastClipboardImage(image) {
  if (image.isEmpty()) return;
  const png = image.toPNG();
  if (!png.length) return;
  if (png.length > MAX_IMAGE_BYTES) {
    log(`Skipped image sync: PNG is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`, 'warn');
    return;
  }

  const imageHash = hashBuffer(png);
  if (imageHash === lastSentImageHash) return;
  lastSentImageHash = imageHash;

  const size = image.getSize();
  let count = 0;
  for (const peer of peers.values()) {
    if (peer.connected && sendClipboardPayload(peer, createImagePayload(png, { from: DEVICE_NAME, width: size.width, height: size.height }))) {
      count++;
    }
  }

  if (count > 0) {
    state.lastSync = {
      kind: 'image',
      direction: 'sent',
      device: `${count} device${count === 1 ? '' : 's'}`,
      time: nowTime(),
      width: size.width,
      height: size.height,
      bytes: png.length,
    };
    log(`Sent encrypted image to ${count} device${count === 1 ? '' : 's'} (${size.width}×${size.height})`);
    broadcastState();
  }
}

function startClipboardWatcher() {
  lastLocalHash = hashString(clipboard.readText());
  const initialImage = clipboard.readImage();
  lastLocalImageHash = initialImage.isEmpty() ? '' : hashBuffer(initialImage.toPNG());
  setInterval(() => {
    if (!syncEnabled) return;

    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const png = image.toPNG();
      const imageHash = hashBuffer(png);
      if (imageHash !== lastLocalImageHash && imageHash !== lastAppliedRemoteImageHash) {
        lastLocalImageHash = imageHash;
        broadcastClipboardImage(image);
        return;
      }
    }

    const text = clipboard.readText();
    if (!text) return;
    const textHash = hashString(text);
    if (textHash === lastLocalHash || textHash === lastAppliedRemoteHash) return;
    lastLocalHash = textHash;
    broadcastClipboard(text);
  }, POLL_MS);
}

function startDiscovery() {
  bonjour = new Bonjour();
  service = bonjour.publish({ name: DEVICE_NAME, type: SERVICE_TYPE, port: PORT, txt: { app: 'copybridge' } });
  browser = bonjour.find({ type: SERVICE_TYPE });

  browser.on('up', (svc) => {
    if (!svc.port || svc.port === PORT && svc.name === DEVICE_NAME) return;
    const host = (svc.referer?.address || svc.addresses?.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || svc.host || '').replace('.local', '');
    const address = svc.addresses?.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || host;
    if (!address || address === '127.0.0.1' && svc.port === PORT) return;
    connectToPeer({ name: svc.name, host: address, port: svc.port, discoveredBy: 'auto' });
  });

  browser.on('error', (error) => log(`Discovery error: ${error.message}`, 'error'));
  log('Device discovery started');
}

function rememberPeer(peer) {
  const remembered = createRememberedPeer(peer);
  if (!remembered) return;
  store.set('rememberedPeers', [remembered]);
}

function getRememberedPeers() {
  return getReconnectCandidates(store.get('rememberedPeers', []), {
    localAddress: getLocalAddress(),
    localPort: PORT,
  });
}

function tryRememberedReconnect(reason = 'startup') {
  const candidates = getRememberedPeers();
  if (!candidates.length) return;

  const connectedCount = [...peers.values()].filter(peer => peer.connected).length;
  if (connectedCount > 0) return;

  state.status = 'reconnecting';
  state.statusDetail = `Reconnecting to ${candidates[0].name}`;
  if (reason === 'startup') log(`Trying remembered device: ${candidates[0].name}`);
  broadcastState();

  for (const peer of candidates) {
    connectToPeer(peer);
  }
}

function startRememberedReconnect() {
  setTimeout(() => tryRememberedReconnect('startup'), REMEMBERED_RECONNECT_DELAY_MS);
  reconnectTimer = setInterval(() => tryRememberedReconnect('retry'), REMEMBERED_RECONNECT_INTERVAL_MS);
}

function connectToPeer(peerInfo) {
  const id = sanitizePeerId(peerInfo);
  const existing = peers.get(id);
  const existingSameAddress = [...peers.values()].find(peer => peer.host === peerInfo.host && peer.port === peerInfo.port && peer.connected);
  if (existing?.connected || existingSameAddress || (peerInfo.host === getLocalAddress() && peerInfo.port === PORT)) return;

  const socket = new WebSocket(`ws://${peerInfo.host}:${peerInfo.port}`);
  socket.on('open', () => bindSocket(socket, peerInfo));
  socket.on('error', () => {
    peers.set(id, { ...peerInfo, id, connected: false, lastSeen: nowTime() });
    if (peerInfo.discoveredBy !== 'remembered') {
      log(`Could not connect to ${peerInfo.host}:${peerInfo.port}`, 'warn');
    }
    broadcastState();
  });
}

function setSyncEnabled(value) {
  syncEnabled = Boolean(value);
  store.set('syncEnabled', syncEnabled);
  log(syncEnabled ? 'Sync resumed' : 'Sync paused');
  broadcastState();
}

function trustPeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer?.deviceId || !peer.publicKey || !peer.sessionKey) {
    return { ok: false, error: 'Peer is not ready for verification' };
  }

  const trustedPeers = upsertTrustedPeer(store.get('trustedPeers', []), peer);
  store.set('trustedPeers', trustedPeers);
  peer.trusted = true;
  peers.set(peer.id, peer);
  log(`Trusted ${peer.name}`);
  broadcastState();
  return { ok: true };
}

ipcMain.handle('get-state', () => ({ ...state, logs }));
ipcMain.handle('set-sync-enabled', (_event, value) => setSyncEnabled(value));
ipcMain.handle('trust-peer', (_event, peerId) => trustPeer(peerId));
ipcMain.handle('connect-manual', (_event, value) => {
  const [host, portRaw] = String(value || '').trim().split(':');
  const port = Number(portRaw || PORT);
  if (!host || !port) return { ok: false, error: 'Use host:port' };
  connectToPeer({ name: host, host, port, discoveredBy: 'manual' });
  return { ok: true };
});
ipcMain.handle('copy-diagnostics', () => {
  const lines = [
    `CopyBridge diagnostics`,
    `Device: ${DEVICE_NAME}`,
    `Address: ${getLocalAddress()}:${PORT}`,
    `Sync: ${syncEnabled ? 'on' : 'off'}`,
    `Peers: ${peerSnapshot().map(p => `${p.name} ${p.host}:${p.port} ${p.connected ? 'connected' : 'offline'} ${p.secure ? 'secure' : 'not-secure'}`).join(', ') || 'none'}`,
  ];
  clipboard.writeText(lines.join('\n'));
  return true;
});
ipcMain.handle('open-github', () => shell.openExternal('https://github.com/'));

app.whenReady().then(() => {
  createWindow();
  createTray();
  startServer();
  startDiscovery();
  startRememberedReconnect();
  startClipboardWatcher();

  const manualPeer = process.env.COPYBRIDGE_PEER;
  if (manualPeer) {
    setTimeout(() => {
      const [host, portRaw] = manualPeer.split(':');
      connectToPeer({ name: manualPeer, host, port: Number(portRaw), discoveredBy: 'manual' });
    }, 900);
  }

  if (process.env.COPYBRIDGE_TEST_COPY) {
    setTimeout(() => {
      clipboard.writeText(process.env.COPYBRIDGE_TEST_COPY);
      log(`Test clipboard value written (${process.env.COPYBRIDGE_TEST_COPY.length} chars)`);
    }, Number(process.env.COPYBRIDGE_TEST_DELAY || 1800));
  }

  if (process.env.COPYBRIDGE_EXIT_AFTER) {
    setTimeout(() => {
      app.isQuitting = true;
      app.quit();
    }, Number(process.env.COPYBRIDGE_EXIT_AFTER));
  }

  setInterval(broadcastState, 2000);
  broadcastState();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  try { browser?.stop(); } catch {}
  try { service?.stop(); } catch {}
  try { bonjour?.destroy(); } catch {}
  try { server?.close(); } catch {}
  try { clearInterval(reconnectTimer); } catch {}
});
