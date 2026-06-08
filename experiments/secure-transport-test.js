const assert = require('assert');
const {
  createCryptoIdentity,
  deriveSessionKey,
  encryptPayload,
  decryptPayload,
} = require('../src/secureTransport');

const mac = createCryptoIdentity();
const windows = createCryptoIdentity();

const macKey = deriveSessionKey({
  localPrivateKey: mac.privateKey,
  remotePublicKey: windows.publicKey,
  localDeviceId: 'mac-device',
  remoteDeviceId: 'windows-device',
});

const windowsKey = deriveSessionKey({
  localPrivateKey: windows.privateKey,
  remotePublicKey: mac.publicKey,
  localDeviceId: 'windows-device',
  remoteDeviceId: 'mac-device',
});

assert.equal(macKey.toString('hex'), windowsKey.toString('hex'));

const payload = {
  type: 'clipboard',
  text: 'secret clipboard text',
  from: 'Mac',
};

const encrypted = encryptPayload(payload, macKey);
assert.equal(encrypted.type, 'secure-clipboard');
assert.equal(encrypted.v, 1);
assert.ok(encrypted.nonce);
assert.ok(encrypted.ciphertext);
assert.ok(encrypted.tag);
assert.equal(JSON.stringify(encrypted).includes(payload.text), false);

const decrypted = decryptPayload(encrypted, windowsKey);
assert.deepEqual(decrypted, payload);

const attacker = createCryptoIdentity();
const attackerKey = deriveSessionKey({
  localPrivateKey: attacker.privateKey,
  remotePublicKey: mac.publicKey,
  localDeviceId: 'attacker',
  remoteDeviceId: 'mac-device',
});

assert.throws(() => decryptPayload(encrypted, attackerKey));

console.log('SECURE_TRANSPORT_TEST_DONE');
