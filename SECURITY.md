# Security

CopyBridge is an early local-first prototype.

## Current protection

- Clipboard payloads are encrypted after devices exchange public keys.
- Encryption is used for both text and image clipboard messages.
- New devices require first-pairing verification with a matching short code before clipboard sync starts.
- Clipboard sync is local-network only.

## Not implemented yet

- Signed production installers.
- Automatic security updates.

CopyBridge is still a prototype. Users should test it on networks they trust until production installers and broader security review are complete.

## Reporting

Please open a private report or contact the maintainer before publicly disclosing a security issue.
