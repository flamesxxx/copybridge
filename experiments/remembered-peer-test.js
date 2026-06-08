const assert = require('assert');
const {
  createRememberedPeer,
  getReconnectCandidates,
} = require('../src/rememberedPeers');

const invalid = createRememberedPeer({ name: 'Bad', host: '', port: 0 });
assert.equal(invalid, null);

const remembered = createRememberedPeer({
  deviceId: 'device-1',
  name: 'Windows-PC',
  host: '192.168.1.42',
  port: 47631,
  discoveredBy: 'auto',
});

assert.deepEqual(remembered, {
  deviceId: 'device-1',
  name: 'Windows-PC',
  host: '192.168.1.42',
  port: 47631,
  discoveredBy: 'remembered',
});

const candidates = getReconnectCandidates([remembered, null, { host: '127.0.0.1', port: 47631 }], {
  localAddress: '192.168.1.10',
  localPort: 47631,
});

assert.deepEqual(candidates, [remembered]);
console.log('REMEMBERED_PEER_TEST_DONE');
