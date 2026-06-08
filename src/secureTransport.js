const crypto = require('crypto');

const PROTOCOL_VERSION = 1;
const AAD = Buffer.from('copybridge-secure-clipboard-v1');

function createCryptoIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  return {
    publicKey: publicKey.toString('base64'),
    privateKey: privateKey.toString('base64'),
  };
}

function keyObjectFromPrivate(base64Key) {
  return crypto.createPrivateKey({
    key: Buffer.from(base64Key, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
}

function keyObjectFromPublic(base64Key) {
  return crypto.createPublicKey({
    key: Buffer.from(base64Key, 'base64'),
    format: 'der',
    type: 'spki',
  });
}

function deriveSessionKey(options) {
  const localPrivate = keyObjectFromPrivate(options.localPrivateKey);
  const remotePublic = keyObjectFromPublic(options.remotePublicKey);
  const sharedSecret = crypto.diffieHellman({ privateKey: localPrivate, publicKey: remotePublic });
  const sortedDeviceIds = [options.localDeviceId, options.remoteDeviceId].sort().join(':');

  return Buffer.from(crypto.hkdfSync(
    'sha256',
    sharedSecret,
    Buffer.from(sortedDeviceIds),
    Buffer.from('copybridge clipboard session'),
    32,
  ));
}

function encryptPayload(payload, sessionKey) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
  cipher.setAAD(AAD);

  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    type: 'secure-clipboard',
    v: PROTOCOL_VERSION,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptPayload(envelope, sessionKey) {
  if (!envelope || envelope.type !== 'secure-clipboard' || envelope.v !== PROTOCOL_VERSION) {
    throw new Error('Invalid secure payload');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    sessionKey,
    Buffer.from(envelope.nonce, 'base64'),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = {
  createCryptoIdentity,
  deriveSessionKey,
  encryptPayload,
  decryptPayload,
};
