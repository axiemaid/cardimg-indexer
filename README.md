# Trading Card Image Indexer for OpenClaw

Indexes CARDIMG transactions from the BSV blockchain via JungleBus. Listens for any CARDIMG upload from anyone — permissionless, real-time.

- **Permissionless** — Catches all CARDIMG transactions, not just your own wallet
- **Real-time** — JungleBus subscription with mempool (zero-conf) support
- **Image cache** — Caches parsed image bytes locally by SHA256 hash
- **Broadcast:** Uses [WhatsOnChain](https://whatsonchain.com) API for OP_RETURN data fetching

## Install

```bash
git clone https://github.com/axiemaid/cardimg-indexer.git
cd cardimg-indexer
npm install
```

## Usage

### CLI

```bash
node scripts/index.cjs                        # Start/continue from last block
node scripts/index.cjs --data-dir <path>      # Custom data directory
node scripts/index.cjs --from <height>        # Start from specific block
node scripts/index.cjs --status               # Show index status
node scripts/index.cjs --once                 # Single pass, no continuous loop
```

### Library

```javascript
const { startJungleBus, showStatus } = require('./lib/indexer.js')

const { jungle, ledger, mempool } = await startJungleBus(dataDir, fromBlock)
```

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

- **Identity:** SHA256 of image bytes
- **No metadata:** Card ID, condition, price — all application layer
- **Permissionless:** Anyone with a BSV wallet can upload

## What This Is Not

- Not an uploader (use the [Trading Card Image Uploader](https://github.com/axiemaid/cardimg-upload))
- Not a viewer (use the CARDIMG viewer)
- No wallet creation or funding (see the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill))
- Not a server (CLI + library only)

## License

MIT
