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
const mode = params.get('mode') === 'verify' ? 'verify' : 'write'
buildLabelEl.textContent = `${build} (${mode})`
logEl.textContent = ''

line(`crossOriginIsolated (main thread) = ${self.crossOriginIsolated}`, 'info')
line(`location.origin = ${location.origin}${location.pathname}`, 'info')
line(`build selected: ${build}`, 'info')
line('spawning dedicated Worker (createSyncAccessHandle requires one)…', 'info')

const worker = new Worker('./worker.js?v=4', { type: 'module' })
worker.onmessage = (event) => {
  const { text, cls, done, ok } = event.data
  if (text) line(text, cls)
  if (done) {
    line(ok ? 'MAIN: worker reported PASS' : 'MAIN: worker reported FAIL', ok ? 'ok' : 'err')
    worker.terminate()
  }
}
worker.onerror = (event) => {
  line(`MAIN: worker error: ${event.message}`, 'err')
}
worker.postMessage({ build, mode })
