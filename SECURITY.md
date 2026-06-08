# Security

CopyBridge is an early local-first prototype.

## Current protection

- Clipboard payloads are encrypted after devices exchange public keys.
- Encryption is used for both text and image clipboard messages.
- Clipboard sync is local-network only.

## Not implemented yet

- First-pairing verification with a short code.
- Signed production installers.
- Automatic security updates.

Until first-pairing verification is implemented, CopyBridge protects against passive local-network inspection, but users should only test it on networks they trust.

## Reporting

Please open a private report or contact the maintainer before publicly disclosing a security issue.
