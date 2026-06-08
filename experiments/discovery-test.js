const { Bonjour } = require('bonjour-service');

const bonjour = new Bonjour();
const name = 'CopyBridgeTest-' + Date.now();
const port = 49631;
let found = false;

const service = bonjour.publish({ name, type: 'copybridge', port, txt: { app: 'copybridge-test' } });
const browser = bonjour.find({ type: 'copybridge' });

service.on('up', () => console.log('PUBLISH_OK'));

browser.on('up', svc => {
  if (svc.name === name && svc.port === port) {
    found = true;
    console.log('DISCOVERY_OK', svc.name, svc.port, (svc.addresses || []).join(','));
    cleanup(0);
  }
});

browser.on('error', error => {
  console.error('DISCOVERY_ERROR', error.message);
  cleanup(1);
});

setTimeout(() => {
  if (!found) {
    console.error('DISCOVERY_TIMEOUT');
    cleanup(2);
  }
}, 5000);

function cleanup(code) {
  try { browser.stop(); } catch {}
  try { service.stop(); } catch {}
  try { bonjour.destroy(); } catch {}
  setTimeout(() => process.exit(code), 200);
}
