// Fire-and-forget invoker used by migration-start to kick off migration-worker.
// On App Builder / OpenWhisk, uses the `openwhisk` SDK with { blocking: false }.
// In local dev or smoke tests (no OW env present), falls back to an in-process
// async invoke so the same contract works on localhost.

function runningInOpenWhisk () {
  return !!(process.env.__OW_API_HOST && process.env.__OW_API_KEY)
}

async function invokeWorker (actionFullName, workerParams) {
  if (runningInOpenWhisk()) {
    const openwhisk = require('openwhisk')
    const ow = openwhisk()
    return ow.actions.invoke({
      name: actionFullName,
      blocking: false,
      result: false,
      params: workerParams
    })
  }

  // Local fallback: invoke the worker's main() in-process but don't await it,
  // so the caller returns to the client immediately (same contract as OW async).
  const workerModule = require('../migration-worker/index.js')
  setImmediate(() => {
    Promise.resolve()
      .then(() => workerModule.main(workerParams))
      .catch(err => console.error('[invoker] local worker failed', err))
  })
  return { local: true }
}

module.exports = { invokeWorker, runningInOpenWhisk }
