import * as SQLite from './wa-sqlite/src/sqlite-api.js'
import { OPFSCoopSyncVFS } from './wa-sqlite/src/examples/OPFSCoopSyncVFS.js'

const logEl = document.getElementById('log')
const buildLabelEl = document.getElementById('build-label')

function line(text, cls) {
  const span = document.createElement('div')
  if (cls) span.className = cls
  span.textContent = text
  logEl.appendChild(span)
  const consoleFn = cls === 'err' ? console.error : console.log
  consoleFn(`[opfs-test] ${text}`)
}

const params = new URLSearchParams(location.search)
const build = params.get('build') === 'async' ? 'async' : 'sync'
buildLabelEl.textContent = build
logEl.textContent = ''

async function main() {
  line(`crossOriginIsolated = ${self.crossOriginIsolated}`, 'info')
  line(`location.origin = ${location.origin}${location.pathname}`, 'info')

  line(`build selected: ${build}`, 'info')
  const SQLiteESMFactory = build === 'async'
    ? (await import('./wa-sqlite/dist/wa-sqlite-async.mjs')).default
    : (await import('./wa-sqlite/dist/wa-sqlite.mjs')).default

  line('loading WASM module…')
  const module = await SQLiteESMFactory()
  line('WASM module loaded OK', 'ok')

  const sqlite3 = SQLite.Factory(module)
  line('SQLite.Factory(module) OK', 'ok')

  line('creating OPFSCoopSyncVFS…')
  const vfs = await OPFSCoopSyncVFS.create('opfs-test-vfs', module)
  sqlite3.vfs_register(vfs, true)
  line('OPFSCoopSyncVFS created and registered as default VFS', 'ok')

  line('opening database file "opfs-live-test.db" on OPFS…')
  const db = await sqlite3.open_v2('opfs-live-test.db')
  line('db opened OK', 'ok')

  await sqlite3.exec(db, `
    CREATE TABLE IF NOT EXISTS live_test (id INTEGER PRIMARY KEY, note TEXT, written_at TEXT)
  `)
  line('CREATE TABLE IF NOT EXISTS live_test — OK', 'ok')

  const stamp = new Date().toISOString()
  await sqlite3.exec(
    db,
    `INSERT INTO live_test (note, written_at) VALUES ('hello from OPFSCoopSyncVFS (${build})', '${stamp}')`,
  )
  line(`INSERT — OK (written_at=${stamp})`, 'ok')

  const rows = []
  await sqlite3.exec(db, 'SELECT id, note, written_at FROM live_test ORDER BY id', (row, columns) => {
    rows.push(Object.fromEntries(columns.map((c, i) => [c, row[i]])))
  })
  line(`SELECT — ${rows.length} row(s):`, 'ok')
  for (const row of rows) line('  ' + JSON.stringify(row))

  await sqlite3.close(db)
  line('db closed OK', 'ok')

  // Independent confirmation the file really landed on OPFS, not just in-memory.
  const opfsRoot = await navigator.storage.getDirectory()
  const vfsDir = await opfsRoot.getDirectoryHandle('opfs-test-vfs', { create: false })
  const names = []
  for await (const name of vfsDir.keys()) names.push(name)
  line(`OPFS directory "opfs-test-vfs" contains: ${names.join(', ') || '(empty)'}`, names.length ? 'ok' : 'err')

  line('TEST PASSED', 'ok')
}

main().catch((err) => {
  line(`TEST FAILED: ${err?.message ?? err}`, 'err')
  if (err?.stack) line(err.stack, 'err')
  console.error(err)
})
