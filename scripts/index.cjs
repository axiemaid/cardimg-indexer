#!/usr/bin/env node
/**
 * CARDIMG Indexer CLI
 * 
 * Indexes CARDIMG transactions from the BSV blockchain via JungleBus.
 * Catches uploads from anyone, anywhere — permissionless real-time indexing.
 * 
 * Usage:
 *   node index.cjs                         # Start/continue from last block
 *   node index.cjs --data-dir <path>       # Custom data directory
 *   node index.cjs --from <height>         # Start from specific block
 *   node index.cjs --status                # Show index status
 *   node index.cjs --once                  # Single pass, no continuous loop
 */

const path = require('path')
const { startJungleBus, showStatus, loadLedger } = require('../lib/indexer.js')

const DEFAULT_DATA_DIR = path.join(process.env.HOME || '/root', '.openclaw', 'cardimg-indexer-data')

async function main() {
  const args = process.argv.slice(2)
  const statusOnly = args.includes('--status')
  const fromArg = args.indexOf('--from')
  const fromBlock = fromArg >= 0 ? parseInt(args[fromArg + 1]) : null
  const once = args.includes('--once')
  const dataDirArg = args.indexOf('--data-dir')
  const dataDir = dataDirArg >= 0 ? args[dataDirArg + 1] : DEFAULT_DATA_DIR

  const fs = require('fs')
  fs.mkdirSync(dataDir, { recursive: true })

  if (statusOnly) {
    showStatus(dataDir)
    process.exit(0)
  }

  const ledger = loadLedger(dataDir)
  const start = fromBlock || ledger.lastBlock

  console.log('CARDIMG Indexer — JungleBus')
  console.log(`Data dir: ${dataDir}`)
  console.log(`Ledger: ${ledger.totalImages} images, ${(ledger.totalBytes / 1024 / 1024).toFixed(1)}MB`)
  console.log(`From block: ${start}`)
  console.log('')

  const { jungle } = await startJungleBus(dataDir, start)

  if (once) {
    console.log('Waiting for initial sync...')
    await new Promise(r => setTimeout(r, 10000))
    console.log('Done.')
    process.exit(0)
  }

  console.log('Listening for CARDIMG transactions...')
  console.log('(Press Ctrl+C to stop)')

  setInterval(() => {
    const l = loadLedger(dataDir)
    console.log(`[stats] ${l.totalImages} images, ${(l.totalBytes / 1024 / 1024).toFixed(1)}MB, lastBlock=${l.lastBlock}`)
  }, 60000)
}

main().catch(e => {
  console.error('Fatal:', e.message)
  process.exit(1)
})
