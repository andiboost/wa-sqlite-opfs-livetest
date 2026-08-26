import * as SQLite from './wa-sqlite/src/sqlite-api.js'
import { OPFSCoopSyncVFS } from './wa-sqlite/src/examples/OPFSCoopSyncVFS.js'

function post(text, cls) {
  self.postMessage({ text, cls })
}

async function walkOPFS(dir, prefix = '') {
  const entries = []
  for await (const [name, handle] of dir.entries()) {
    entries.push(`${prefix}${name} (${handle.kind})`)
    if (handle.kind === 'directory') {
      entries.push(...(await walkOPFS(handle, prefix + name + '/')))
    }
  }
  return entries
}

self.onmessage = async (event) => {
  const { build, mode } = event.data
  const verifyOnly = mode === 'verify'
  try {
    post(`[worker] crossOriginIsolated = ${self.crossOriginIsolated}`, 'info')
    post(`[worker] mode = ${verifyOnly ? 'verify-only (no write, proves persistence across reload)' : 'write+read'}`, 'info')

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

    if (!verifyOnly) {
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
    } else {
      post('[worker] skipping CREATE/INSERT — reading back only what a PREVIOUS session wrote', 'info')
    }

    const rows = []
    await sqlite3.exec(db, 'SELECT id, note, written_at FROM live_test ORDER BY id', (row, columns) => {
      rows.push(Object.fromEntries(columns.map((c, i) => [c, row[i]])))
    })
    post(`[worker] SELECT — ${rows.length} row(s):`, 'ok')
    for (const row of rows) post('  ' + JSON.stringify(row))

    await sqlite3.close(db)
    post('[worker] db closed OK', 'ok')

    const opfsRoot = await navigator.storage.getDirectory()
    const entries = await walkOPFS(opfsRoot)
    post(`[worker] full OPFS tree from root: ${entries.length ? entries.join(', ') : '(empty)'}`, entries.length ? 'ok' : 'err')

    post('[worker] TEST PASSED', 'ok')
    self.postMessage({ done: true, ok: true })
  } catch (err) {
    post(`[worker] TEST FAILED: ${err?.message ?? err}`, 'err')
    if (err?.stack) post(err.stack, 'err')
    self.postMessage({ done: true, ok: false })
  }
}
