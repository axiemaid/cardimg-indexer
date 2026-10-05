/**
 * CARDIMG Indexer — Core Library
 * 
 * Permissionless CARDIMG protocol indexer.
 * Listens for CARDIMG transactions across the entire BSV blockchain
 * via JungleBus. Catches uploads from anyone, not just our wallet.
 * 
 * State: ledger.json (confirmed) + mempool.json (zero-conf)
 * Image cache: images/<hash>.bin
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PROTOCOL_PREFIX = 'CARDIMG'
const WoC_API = 'https://api.whatsonchain.com/v1/bsv/main'
const JB_SUB_ID = process.env.JB_SUB_ID || 'f25086265e0adc867a6a45f51a8f1be63bf79fc19355513543d1c704c461889a'
const START_BLOCK = 957054 // First CARDIMG tx

// localStorage polyfill (required by js-junglebus)
const _store = {}
const _ls = {
  getItem: k => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v) },
  removeItem: k => { delete _store[k] },
  clear: () => { for (const k in _store) delete _store[k] },
  get length() { return Object.keys(_store).length },
  key: i => Object.keys(_store)[i] ?? null
}
try { Object.defineProperty(globalThis, 'localStorage', { value: _ls, writable: true, configurable: true }) } catch { globalThis.localStorage = _ls }

// --- Parsing ---

function parsePushData(buffer, offset) {
  const pushByte = buffer[offset]
  if (pushByte <= 0x4b) {
    return { data: buffer.slice(offset + 1, offset + 1 + pushByte), nextOffset: offset + 1 + pushByte }
  } else if (pushByte === 0x4c) {
    const len = buffer[offset + 1]
    return { data: buffer.slice(offset + 2, offset + 2 + len), nextOffset: offset + 2 + len }
  } else if (pushByte === 0x4d) {
    const len = buffer.readUInt16LE(offset + 1)
    return { data: buffer.slice(offset + 3, offset + 3 + len), nextOffset: offset + 3 + len }
  } else if (pushByte === 0x4e) {
    const len = buffer.readUInt32LE(offset + 1)
    return { data: buffer.slice(offset + 5, offset + 5 + len), nextOffset: offset + 5 + len }
  }
  return null
}

function parseCardImgFromOpReturn(outputs) {
  for (const out of outputs) {
    const buf = Buffer.from(out.hex, 'hex')
    let pos = 0
    if (buf[pos] !== 0x00) continue
    pos++
    if (buf[pos] !== 0x6a) continue
    pos++

    const prefixPush = parsePushData(buf, pos)
    if (!prefixPush) continue
    if (prefixPush.data.toString('ascii') !== PROTOCOL_PREFIX) continue

    const imagePush = parsePushData(buf, prefixPush.nextOffset)
    if (!imagePush) continue

    const hash = crypto.createHash('sha256').update(imagePush.data).digest('hex')
    return { hash, image: imagePush.data, size: imagePush.data.length }
  }
  return null
}

function detectFormat(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'JPEG'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'PNG'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'WebP'
  return 'unknown'
}

// --- WoC helpers ---

async function getOpReturn(txid) {
  const res = await fetch(`${WoC_API}/tx/${txid}/opreturn`)
  if (!res.ok) return null
  const data = await res.json()
  return data
}

// --- State ---

function loadLedger(dataDir) {
  const ledgerPath = path.join(dataDir, 'ledger.json')
  if (fs.existsSync(ledgerPath)) {
    return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  }
  return { cards: {}, lastBlock: START_BLOCK, totalImages: 0, totalBytes: 0 }
}

function saveLedger(dataDir, ledger) {
  fs.writeFileSync(path.join(dataDir, 'ledger.json'), JSON.stringify(ledger, null, 2))
}

function loadMempool(dataDir) {
  const mempoolPath = path.join(dataDir, 'mempool.json')
  if (fs.existsSync(mempoolPath)) {
    return JSON.parse(fs.readFileSync(mempoolPath, 'utf8'))
  }
  return { cards: {}, lastScan: 0 }
}

function saveMempool(dataDir, mempool) {
  fs.writeFileSync(path.join(dataDir, 'mempool.json'), JSON.stringify(mempool, null, 2))
}

// --- Image cache ---

function cacheImage(dataDir, hash, imageBuf) {
  const imagesDir = path.join(dataDir, 'images')
  fs.mkdirSync(imagesDir, { recursive: true })
  const imgPath = path.join(imagesDir, `${hash}.bin`)
  if (!fs.existsSync(imgPath)) {
    fs.writeFileSync(imgPath, imageBuf)
  }
}

// --- Indexing ---

async function indexTx(txid, blockHeight, ledger, mempool, dataDir) {
  const cleanTxid = txid.replace(/["]/g, '').trim()

  // Skip if already in ledger
  for (const card of Object.values(ledger.cards)) {
    if (card.txid === cleanTxid) return false
  }

  const opReturns = await getOpReturn(cleanTxid)
  if (!opReturns || opReturns.length === 0) return false

  const card = parseCardImgFromOpReturn(opReturns)
  if (!card) return false

  cacheImage(dataDir, card.hash, card.image)

  ledger.cards[card.hash] = {
    txid: cleanTxid,
    blockHeight: blockHeight || null,
    size: card.size
  }
  ledger.totalImages++
  ledger.totalBytes += card.size

  delete mempool.cards[card.hash]

  console.log(`  ✓ ${cleanTxid.substring(0, 16)}... | ${(card.size / 1024).toFixed(0)}KB | ${detectFormat(card.image)} | hash: ${card.hash.substring(0, 16)}...`)
  return true
}

// --- JungleBus ---

async function startJungleBus(dataDir, fromBlock) {
  const { JungleBusClient } = require('@gorillapool/js-junglebus')

  const ledger = loadLedger(dataDir)
  const mempool = loadMempool(dataDir)

  const jungle = new JungleBusClient('junglebus.gorillapool.io', {
    onConnected() { console.log('[junglebus] connected') },
    onConnecting() { console.log('[junglebus] connecting...') },
    onDisconnected() { console.log('[junglebus] disconnected') },
    onError(ctx) { console.error('[junglebus] error:', ctx) }
  })

  const onPublish = (tx) => {
    indexTx(tx.id, tx.block_height, ledger, mempool, dataDir)
      .then(found => {
        if (found) {
          ledger.lastBlock = Math.max(ledger.lastBlock || 0, tx.block_height)
          saveLedger(dataDir, ledger)
          saveMempool(dataDir, mempool)
        }
      })
      .catch(e => console.error(`Error indexing ${tx.id}:`, e.message))
  }

  const onMempool = async (tx) => {
    try {
      const opReturns = await getOpReturn(tx.id)
      if (!opReturns || opReturns.length === 0) return

      const card = parseCardImgFromOpReturn(opReturns)
      if (!card) return

      cacheImage(dataDir, card.hash, card.image)
      mempool.cards[card.hash] = { txid: tx.id, size: card.size, blockHeight: null }
      mempool.lastScan = Date.now()
      saveMempool(dataDir, mempool)

      console.log(`  [mempool] ${tx.id.substring(0, 16)}... | ${(card.size / 1024).toFixed(0)}KB | ${detectFormat(card.image)}`)
    } catch (e) {
      console.error(`Mempool error ${tx.id}:`, e.message)
    }
  }

  const onStatus = (ctx) => {
    if (ctx.statusCode === 200) {
      ledger.lastBlock = ctx.block || ledger.lastBlock
      saveLedger(dataDir, ledger)
    }
  }

  const onError = (ctx) => {
    console.error('[junglebus] subscribe error:', ctx)
  }

  await jungle.Subscribe(JB_SUB_ID, fromBlock, onPublish, onStatus, onError, onMempool)

  return { jungle, ledger, mempool }
}

// --- Status ---

function showStatus(dataDir) {
  const ledger = loadLedger(dataDir)
  const mempool = loadMempool(dataDir)
  const imagesDir = path.join(dataDir, 'images')

  console.log('')
  console.log('=== CARDIMG Index Status ===')
  console.log(`Confirmed images: ${ledger.totalImages}`)
  console.log(`Total bytes:       ${(ledger.totalBytes / 1024 / 1024).toFixed(1)}MB`)
  console.log(`Last block:        ${ledger.lastBlock}`)
  console.log(`Mempool pending:   ${Object.keys(mempool.cards).length}`)
  if (Object.keys(ledger.cards).length > 0) {
    console.log('')
    console.log('Images:')
    for (const [hash, card] of Object.entries(ledger.cards)) {
      const cached = fs.existsSync(path.join(imagesDir, `${hash}.bin`)) ? '✓' : '✗'
      console.log(`  ${hash.substring(0, 16)}... | ${card.txid.substring(0, 16)}... | block ${card.blockHeight} | ${(card.size / 1024).toFixed(0)}KB | cached: ${cached}`)
    }
  }
}

module.exports = {
  startJungleBus,
  indexTx,
  showStatus,
  loadLedger,
  saveLedger,
  loadMempool,
  saveMempool,
  cacheImage,
  parseCardImgFromOpReturn,
  detectFormat,
  PROTOCOL_PREFIX,
  JB_SUB_ID,
  START_BLOCK
}
