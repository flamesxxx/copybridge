const assert = require('assert');
const {
  createTrustedPeer,
  isTrustedPeer,
} = require('../src/trustedPeers');

const trusted = createTrustedPeer({
  deviceId: 'device-1',
  name: 'Windows-PC',
  publicKey: 'public-key-a',
});

assert.deepEqual(trusted, {
  deviceId: 'device-1',
  name: 'Windows-PC',
  publicKeyFingerprint: '8b2a2c81a987c30b1770ba51f6e96252d974b374639c75785dc756580d59096d',
});

assert.equal(isTrustedPeer([trusted], {
  deviceId: 'device-1',
  publicKey: 'public-key-a',
}), true);

assert.equal(isTrustedPeer([trusted], {
  deviceId: 'device-1',
  publicKey: 'public-key-b',
}), false);

assert.equal(isTrustedPeer([trusted], {
  deviceId: 'device-2',
  publicKey: 'public-key-a',
}), false);

console.log('TRUSTED_PEER_TEST_DONE');
