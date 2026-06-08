const crypto = require('crypto');

function hashString(value) {
  return crypto.createHash('sha256').update(value || '').digest('hex');
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer || Buffer.alloc(0)).digest('hex');
}

function createTextPayload(text, options = {}) {
  return {
    type: 'clipboard',
    text,
    from: options.from,
    hash: hashString(text),
    at: Date.now(),
  };
}

function createImagePayload(pngBuffer, options = {}) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    throw new Error('PNG buffer is required');
  }

  return {
    type: 'clipboard-image',
    mime: 'image/png',
    png: pngBuffer.toString('base64'),
    width: Number(options.width || 0),
    height: Number(options.height || 0),
    from: options.from,
    hash: hashBuffer(pngBuffer),
    at: Date.now(),
  };
}

function decodeImagePayload(payload) {
  if (!payload || payload.type !== 'clipboard-image' || typeof payload.png !== 'string') {
    throw new Error('Invalid image payload');
  }

  return {
    buffer: Buffer.from(payload.png, 'base64'),
    width: Number(payload.width || 0),
    height: Number(payload.height || 0),
    hash: payload.hash,
  };
}

module.exports = {
  createTextPayload,
  createImagePayload,
  decodeImagePayload,
  hashString,
  hashBuffer,
};
