---
name: cardimg-indexer
description: Index CARDIMG transactions from the BSV blockchain via JungleBus
---

# CARDIMG Indexer Skill

Index card scan images uploaded to the BSV blockchain under the CARDIMG protocol. Listens via JungleBus for any CARDIMG transaction from anyone — permissionless, real-time.

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

The indexer catches all transactions matching this pattern across the entire BSV blockchain.

## Setup

Requires a BSV wallet at `~/.openclaw/bsv-wallet.json`. To create and fund one, use the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill).

## Start indexing

```bash
node scripts/index.cjs
```

Continues from the last indexed block. Listens in real-time for new CARDIMG transactions.

## Check status

```bash
node scripts/index.cjs --status
```

Shows confirmed image count, total bytes, last block, mempool pending, and per-image details.

## Options

- `--data-dir <path>` — Custom data directory (default: `~/.openclaw/cardimg-indexer-data/`)
- `--from <height>` — Start from specific block height
- `--status` — Show index status and exit
- `--once` — Single sync pass, then exit

## What it does

1. Connects to JungleBus subscription (filters on CARDIMG output prefix)
2. For each matching transaction: fetches OP_RETURN data from WhatsOnChain
3. Parses image bytes, computes SHA256 hash
4. Caches image to `images/<hash>.bin`
5. Records to `ledger.json` (confirmed) or `mempool.json` (zero-conf)
6. Listens continuously for new transactions

## What it does NOT do

- No wallet creation or funding (see the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill))
- No uploading (use the Trading Card Image Uploader)
- No viewing (use the CARDIMG viewer)
- No metadata (protocol is image-only)

## Data

- `ledger.json` — hash → { txid, blockHeight, size }
- `mempool.json` — zero-conf uploads tracked separately
- `images/<hash>.bin` — cached image bytes

## Composability

Part of the CARDIMG ecosystem:

- **[Trading Card Image Uploader](https://github.com/axiemaid/cardimg-upload)** — upload scans on-chain
- **CARDIMG indexer** (this) — index all CARDIMG txs from anyone
- **CARDIMG viewer** — view indexed card images
- **[BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill)** — create and fund the wallet
