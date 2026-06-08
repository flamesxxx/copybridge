# CopyBridge

[![CI](https://github.com/flamesxxx/copybridge/actions/workflows/ci.yml/badge.svg)](https://github.com/flamesxxx/copybridge/actions/workflows/ci.yml)

Universal clipboard for Mac and Windows, built local-first.

Copy text or an image on one computer. Paste it on the other. No account, no cloud, no Telegram workaround.

> CopyBridge is an early prototype. It already works for local text and image clipboard sync, but it is not packaged as a production installer yet.

## Why

Mac has Universal Clipboard inside the Apple ecosystem. Windows has its own clipboard sync. People who use a Mac laptop and a Windows desktop still end up sending snippets through messengers, notes, email, or cloud drives.

CopyBridge focuses on one narrow job: make Mac <-> Windows clipboard sync feel invisible on the same local network.

## What works now

- Electron app for macOS and Windows.
- Menu bar / tray background behavior.
- Plain text clipboard sync.
- Copied image clipboard sync.
- Local WebSocket transport.
- Automatic local-network discovery through mDNS.
- Silent reconnect to the last successful device.
- Encrypted clipboard payloads after devices exchange public keys.
- Echo protection so clipboard values do not bounce forever.
- Activity log, device status, sync toggle, and diagnostics copy.
- Manual `host:port` fallback for networks where discovery is blocked.

## MVP boundary

CopyBridge currently syncs:

- text;
- copied images.

It intentionally does not support:

- files;
- clipboard history;
- accounts;
- cloud relay;
- mobile devices;
- packaged `.dmg` / `.exe` installers.

## Install for development

```bash
npm install
npm start
```

Run the same project on both computers. Keep both devices on the same local network.

On Windows, allow local network access if the firewall asks.

## Simulate two devices on one Mac

```bash
npm run start:a
npm run start:b
```

`start:a` launches a fake Mac node on port `47631`.
`start:b` launches a fake Windows node on port `47632` and connects to the first one.

## Checks

```bash
npm test
```

Individual checks:

```bash
npm run check
npm run test:network
npm run test:secure
npm run test:remembered
npm run test:image
node experiments/discovery-test.js
```

## Security model

Clipboard payloads are encrypted after devices exchange public keys. This protects clipboard data from passive local-network inspection.

Before a public release, CopyBridge still needs first-pairing verification: a short code shown on both devices so the user can confirm the first connection was not intercepted.

## Known limitations

- Local network only.
- mDNS can be slow or blocked on guest Wi-Fi, corporate networks, VPN-heavy setups, or restrictive routers.
- Manual `host:port` fallback exists for diagnostics, not as the intended everyday flow.
- First-pairing verification is not implemented yet.
- Files are not supported yet.
- Installers are not built yet.

## Roadmap

- Add first-pairing verification with a short code.
- Package macOS `.dmg` and Windows installer.
- Improve first-run onboarding.
- Add a short demo GIF for the README.
- Test across more Windows 11 network configurations.
- Consider optional file transfer after text and image sync are stable.

## Product principle

CopyBridge should feel like "install once and forget it." The main UI is only a status panel. The product should not require settings for normal use.

## License

MIT
