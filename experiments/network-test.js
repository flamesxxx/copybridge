const WebSocket = require('ws');
const crypto = require('crypto');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const sockets = [];

function startNode(name, port, peerPort, initialText) {
  let lastHash = '';
  const server = new WebSocket.Server({ port });
  server.on('connection', socket => {
    sockets.push(socket);
    socket.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'clipboard') {
        const h = hash(msg.text);
        if (h !== lastHash) {
          lastHash = h;
          console.log(`${name}: received "${msg.text}" from ${msg.from}`);
        }
      }
    });
  });
  server.on('listening', () => console.log(`${name}: listening ${port}`));

  if (peerPort) {
    setTimeout(() => {
      const socket = new WebSocket(`ws://127.0.0.1:${peerPort}`);
      socket.on('open', () => {
        const text = initialText || `hello from ${name}`;
        lastHash = hash(text);
        socket.send(JSON.stringify({ type: 'clipboard', text, from: name }));
        console.log(`${name}: sent "${text}"`);
      });
    }, 500);
  }

  return server;
}

const a = startNode('Mac', 48631);
const b = startNode('Windows', 48632, 48631, 'copybridge-network-ok');
setTimeout(() => {
  sockets.forEach(socket => { try { socket.close(); } catch {} });
  a.close();
  b.close();
  console.log('NETWORK_TEST_DONE');
  setTimeout(() => process.exit(0), 100);
}, 1600);
