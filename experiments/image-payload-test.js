const assert = require('assert');
const {
  createTextPayload,
  createImagePayload,
  decodeImagePayload,
  hashBuffer,
} = require('../src/clipboardPayload');

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const imagePayload = createImagePayload(png, { width: 2, height: 3, from: 'Mac' });

assert.equal(imagePayload.type, 'clipboard-image');
assert.equal(imagePayload.mime, 'image/png');
assert.equal(imagePayload.width, 2);
assert.equal(imagePayload.height, 3);
assert.equal(imagePayload.from, 'Mac');
assert.equal(imagePayload.png, png.toString('base64'));
assert.equal(imagePayload.hash, hashBuffer(png));

const decoded = decodeImagePayload(imagePayload);
assert.deepEqual(decoded.buffer, png);
assert.equal(decoded.width, 2);
assert.equal(decoded.height, 3);

const textPayload = createTextPayload('hello', { from: 'Windows' });
assert.equal(textPayload.type, 'clipboard');
assert.equal(textPayload.text, 'hello');
assert.equal(textPayload.from, 'Windows');
assert.ok(textPayload.hash);

console.log('IMAGE_PAYLOAD_TEST_DONE');
