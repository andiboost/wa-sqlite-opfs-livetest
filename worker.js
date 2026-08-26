import * as SQLite from './wa-sqlite/src/sqlite-api.js'
import { OPFSCoopSyncVFS } from './wa-sqlite/src/examples/OPFSCoopSyncVFS.js'

function post(text, cls) {
  self.postMessage({ text, cls })
}

self.onmessage = async (event) => {
  const build = event.data.build
  try {
    post(`[worker] crossOriginIsolated = ${self.crossOriginIsolated}`, 'info')

    post(`[worker] build selected: ${build}`, 'info')
    const SQLiteESMFactory = build === 'async'
      ? (await import('./wa-sqlite/dist/wa-sqlite-async.mjs')).default
      : (await import('./wa-sqlite/dist/wa-sqlite.mjs')).default

    post('[worker] loading WASM module…')
    const module = await SQLiteESMFactory()
    post('[worker] WASM module loaded OK', 'ok')

    const sqlite3 = SQLite.Factory(module)
    post('[worker] SQLite.Factory(module) OK', 'ok')

    post('[worker] creating OPFSCoopSyncVFS…')
    const vfs = await OPFSCoopSyncVFS.create('opfs-test-vfs', module)
    sqlite3.vfs_register(vfs, true)
    post('[worker] OPFSCoopSyncVFS created and registered as default VFS', 'ok')

    post('[worker] opening database file "opfs-live-test.db" on OPFS…')
    const db = await sqlite3.open_v2('opfs-live-test.db')
    post('[worker] db opened OK', 'ok')

    await sqlite3.exec(db, `
      CREATE TABLE IF NOT EXISTS live_test (id INTEGER PRIMARY KEY, note TEXT, written_at TEXT)
    `)
    post('[worker] CREATE TABLE IF NOT EXISTS live_test — OK', 'ok')

    const stamp = new Date().toISOString()
    await sqlite3.exec(
      db,
      `INSERT INTO live_test (note, written_at) VALUES ('hello from OPFSCoopSyncVFS (${build})', '${stamp}')`,
    )
    post(`[worker] INSERT — OK (written_at=${stamp})`, 'ok')

    const rows = []
    await sqlite3.exec(db, 'SELECT id, note, written_at FROM live_test ORDER BY id', (row, columns) => {
      rows.push(Object.fromEntries(columns.map((c, i) => [c, row[i]])))
    })
    post(`[worker] SELECT — ${rows.length} row(s):`, 'ok')
    for (const row of rows) post('  ' + JSON.stringify(row))

    await sqlite3.close(db)
    post('[worker] db closed OK', 'ok')

    const opfsRoot = await navigator.storage.getDirectory()
    const vfsDir = await opfsRoot.getDirectoryHandle('opfs-test-vfs', { create: false })
    const names = []
    for await (const name of vfsDir.keys()) names.push(name)
    post(`[worker] OPFS directory "opfs-test-vfs" contains: ${names.join(', ') || '(empty)'}`, names.length ? 'ok' : 'err')

    post('[worker] TEST PASSED', 'ok')
    self.postMessage({ done: true, ok: true })
  } catch (err) {
    post(`[worker] TEST FAILED: ${err?.message ?? err}`, 'err')
    if (err?.stack) post(err.stack, 'err')
    self.postMessage({ done: true, ok: false })
  }
}
