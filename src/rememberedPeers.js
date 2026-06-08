function createRememberedPeer(peer) {
  const host = String(peer?.host || '').trim();
  const port = Number(peer?.port || 0);
  if (!host || !Number.isInteger(port) || port <= 0) return null;

  return {
    deviceId: peer.deviceId || null,
    name: peer.name || host,
    host,
    port,
    discoveredBy: 'remembered',
  };
}

function isSelf(peer, options) {
  return peer.host === '127.0.0.1'
    || peer.host === 'localhost'
    || (peer.host === options.localAddress && peer.port === options.localPort);
}

function getReconnectCandidates(peers, options) {
  const seen = new Set();
  const candidates = [];

  for (const item of peers || []) {
    const peer = createRememberedPeer(item);
    if (!peer || isSelf(peer, options)) continue;
    const key = `${peer.host}:${peer.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(peer);
  }

  return candidates;
}

module.exports = {
  createRememberedPeer,
  getReconnectCandidates,
};
