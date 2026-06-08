const crypto = require('crypto');

function publicKeyFingerprint(publicKey) {
  return crypto.createHash('sha256').update(String(publicKey || '')).digest('hex');
}

function createTrustedPeer(peer) {
  if (!peer?.deviceId || !peer?.publicKey) return null;

  return {
    deviceId: peer.deviceId,
    name: peer.name || 'Trusted device',
    publicKeyFingerprint: publicKeyFingerprint(peer.publicKey),
  };
}

function isTrustedPeer(trustedPeers, peer) {
  const trusted = createTrustedPeer(peer);
  if (!trusted) return false;

  return (trustedPeers || []).some(item =>
    item.deviceId === trusted.deviceId
    && item.publicKeyFingerprint === trusted.publicKeyFingerprint
  );
}

function upsertTrustedPeer(trustedPeers, peer) {
  const trusted = createTrustedPeer(peer);
  if (!trusted) return trustedPeers || [];

  const next = (trustedPeers || []).filter(item => item.deviceId !== trusted.deviceId);
  next.push(trusted);
  return next;
}

module.exports = {
  createTrustedPeer,
  isTrustedPeer,
  publicKeyFingerprint,
  upsertTrustedPeer,
};
