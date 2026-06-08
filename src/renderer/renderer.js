const statusLabel = document.getElementById('statusLabel');
const statusHint = document.getElementById('statusHint');
const statusCard = document.getElementById('statusCard');
const syncToggle = document.getElementById('syncToggle');
const deviceName = document.getElementById('deviceName');
const deviceAddress = document.getElementById('deviceAddress');
const lastSync = document.getElementById('lastSync');
const peersEl = document.getElementById('peers');
const logsEl = document.getElementById('logs');
const manualForm = document.getElementById('manualForm');
const manualPeer = document.getElementById('manualPeer');
const copyDiagnostics = document.getElementById('copyDiagnostics');
const trustPanel = document.getElementById('trustPanel');
const trustCode = document.getElementById('trustCode');
const trustButton = document.getElementById('trustButton');

let pendingTrustPeerId = null;

function render(state) {
  const connected = state.peers.filter(peer => peer.connected).length;
  statusCard.dataset.status = state.status;
  statusLabel.textContent = state.syncEnabled
    ? (connected ? 'Ready in background' : state.status === 'reconnecting' ? 'Reconnecting' : 'Looking for device')
    : 'Sync paused';
  statusHint.textContent = state.syncEnabled
    ? (state.statusDetail || (connected ? `${connected} device${connected === 1 ? '' : 's'} ready` : 'Open CopyBridge on your other computer'))
    : 'Clipboard changes are not being shared';

  syncToggle.checked = Boolean(state.syncEnabled);
  deviceName.textContent = state.deviceName || 'This device';
  deviceAddress.textContent = `${state.localAddress}:${state.port}`;

  const pendingPeer = state.peers.find(peer => peer.connected && peer.secure && !peer.trusted && peer.verificationCode);
  if (pendingPeer) {
    pendingTrustPeerId = pendingPeer.id;
    trustPanel.classList.remove('hidden');
    trustCode.textContent = pendingPeer.verificationCode;
    trustButton.textContent = `Trust ${pendingPeer.name}`;
  } else {
    pendingTrustPeerId = null;
    trustPanel.classList.add('hidden');
  }

  if (state.lastSync) {
    const verb = state.lastSync.direction === 'sent' ? 'Sent to' : 'Received from';
    if (state.lastSync.kind === 'image') {
      const dimensions = state.lastSync.width && state.lastSync.height
        ? `${state.lastSync.width}×${state.lastSync.height}`
        : 'image';
      lastSync.textContent = `${verb} ${state.lastSync.device} at ${state.lastSync.time} · ${dimensions}`;
    } else {
      lastSync.textContent = `${verb} ${state.lastSync.device} at ${state.lastSync.time} · ${state.lastSync.length} chars`;
    }
  } else {
    lastSync.textContent = 'No clipboard sync yet';
  }

  if (!state.peers.length) {
    peersEl.className = 'peers empty';
    peersEl.textContent = 'No devices found yet';
  } else {
    peersEl.className = 'peers';
    peersEl.innerHTML = state.peers.map(peer => `
      <div class="peer ${peer.connected ? 'online' : 'offline'}">
        <div class="peer-dot"></div>
        <div>
          <strong>${escapeHtml(peer.name)}</strong>
          <span>${escapeHtml(peer.host)}:${peer.port || '—'} · ${peer.connected ? 'connected' : 'offline'}${peer.secure ? ' · secure' : ''}${peer.trusted ? ' · trusted' : peer.secure ? ' · verify' : ''} · ${peer.discoveredBy}</span>
        </div>
      </div>
    `).join('');
  }

  logsEl.innerHTML = (state.logs || []).map(item => `
    <div class="log ${item.level}">
      <span>${escapeHtml(item.time)}</span>
      <p>${escapeHtml(item.message)}</p>
    </div>
  `).join('') || '<div class="log"><span>—</span><p>No activity yet</p></div>';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

syncToggle.addEventListener('change', () => {
  window.copybridge.setSyncEnabled(syncToggle.checked);
});

manualForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = manualPeer.value.trim();
  if (!value) return;
  await window.copybridge.connectManual(value);
  manualPeer.value = '';
});

copyDiagnostics.addEventListener('click', async () => {
  await window.copybridge.copyDiagnostics();
  copyDiagnostics.textContent = 'Copied';
  setTimeout(() => copyDiagnostics.textContent = 'Copy diagnostics', 1200);
});

trustButton.addEventListener('click', async () => {
  if (!pendingTrustPeerId) return;
  trustButton.disabled = true;
  await window.copybridge.trustPeer(pendingTrustPeerId);
  trustButton.disabled = false;
});

window.copybridge.onState(render);
window.copybridge.getState().then(render);
