'use strict';

// Bound local work and cancel the SDK's HTTP request when a deadline expires.
// Cancelling a client request does not promise cancellation of remote billing.
function failure(code) { const error = new Error(code); error.code = code; return error; }
function bounded(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
function minimumInterval(value, fallback, minimum) {
  const number = String(value ?? '').trim() === '' ? NaN : Number(value);
  return bounded(number, fallback, minimum, 120000);
}
function retryAfterMs(error, now = Date.now()) {
  for (const headers of [error?.headers, error?.response?.headers, error?.rawResponse?.headers]) {
    const value = headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? headers?.['Retry-After'];
    if (value == null || String(value).trim() === '') continue;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const date = Date.parse(String(value));
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const match = String(error?.message || '').match(/retry[- ]?after[^0-9]{0,12}(\d+)/i);
  return match ? Number(match[1]) * 1000 : null;
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function createScheduler({ queues = new Map(), maxQueued = 8, maxTotalQueued = 40,
  queueTimeoutMs = 45000, attemptTimeoutMs = 45000, executionTimeoutMs = 90000,
  isRetryable = () => false, onRetry = () => {}, random = Math.random } = {}) {
  maxQueued = Math.floor(bounded(maxQueued, 8, 0, 100));
  maxTotalQueued = Math.floor(bounded(maxTotalQueued, 40, 0, 200));
  queueTimeoutMs = bounded(queueTimeoutMs, 45000, 5, 120000);
  attemptTimeoutMs = bounded(attemptTimeoutMs, 45000, 5, 120000);
  executionTimeoutMs = bounded(executionTimeoutMs, 90000, 10, 180000);
  let closed = false;
  const active = new Set();
  const totals = { completed: 0, failed: 0, rejected: 0, expired: 0 };
  function prune() {
    for (const [model, queue] of queues) if (!queue.active && !queue.pending.length && queue.nextAt <= Date.now()) queues.delete(model);
  }
  function expire(queue, job) {
    const index = queue.pending.indexOf(job);
    if (index < 0) return;
    queue.pending.splice(index, 1); totals.expired += 1;
    job.reject(failure('AI_QUEUE_TIMEOUT'));
    prune();
  }
  async function execute(queue, job) {
    const controller = new AbortController();
    active.add(controller);
    const budget = bounded(job.options.executionTimeoutMs, executionTimeoutMs, 10, 180000);
    const timeout = bounded(job.options.attemptTimeoutMs, attemptTimeoutMs, 5, 120000);
    const deadline = Date.now() + budget;
    const retries = Math.floor(bounded(job.options.maxRetries, 3, 0, 4));
    const interval = bounded(job.options.minIntervalMs, 0, 0, 120000);
    const budgetTimer = setTimeout(() => controller.abort(failure('AI_REQUEST_TIMEOUT')), budget);
    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (controller.signal.aborted) throw controller.signal.reason;
        const wait = Math.max(0, queue.nextAt - Date.now());
        if (wait >= deadline - Date.now()) throw failure('AI_QUEUE_TIMEOUT');
        if (wait > 0) await delay(wait, controller.signal);
        if (controller.signal.aborted) throw controller.signal.reason;
        queue.nextAt = Date.now() + interval;
        const attemptController = new AbortController();
        const abortAttempt = () => attemptController.abort(controller.signal.reason);
        controller.signal.addEventListener('abort', abortAttempt, { once: true });
        const timer = setTimeout(() => attemptController.abort(failure('AI_REQUEST_TIMEOUT')), Math.min(timeout, Math.max(1, deadline - Date.now())));
        let rejectAbort;
        const aborted = new Promise((resolve, reject) => { rejectAbort = () => reject(attemptController.signal.reason); });
        attemptController.signal.addEventListener('abort', rejectAbort, { once: true });
        try {
          return await Promise.race([Promise.resolve().then(() => {
            if (attemptController.signal.aborted) throw attemptController.signal.reason;
            return job.task(attemptController.signal);
          }), aborted]);
        } catch (error) {
          if (attemptController.signal.aborted) throw attemptController.signal.reason;
          if (!isRetryable(error) || attempt >= retries) throw error;
          const retryAfter = retryAfterMs(error);
          const backoff = retryAfter ?? Math.min(30000, 2500 * 2 ** attempt + Math.floor(random() * 600));
          // Keep a server-requested cooldown, but do not hold this job for hours.
          queue.nextAt = Math.max(queue.nextAt, Date.now() + backoff);
          if (backoff >= deadline - Date.now()) throw error;
          onRetry({ label: job.options.label, attempt: attempt + 1, maxRetries: retries, delayMs: backoff, status: error?.status || error?.statusCode });
        } finally {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', abortAttempt);
          attemptController.signal.removeEventListener('abort', rejectAbort);
        }
      }
    } finally { clearTimeout(budgetTimer); active.delete(controller); }
  }
  function pump(queue) {
    if (closed || queue.active || !queue.pending.length) return;
    const job = queue.pending.shift();
    clearTimeout(job.timer);
    queue.active = true;
    execute(queue, job).then(value => { totals.completed += 1; job.resolve(value); }, error => { totals.failed += 1; job.reject(error); })
      .finally(() => { queue.active = false; pump(queue); prune(); });
  }
  function run(model, task, options = {}) {
    if (closed) return Promise.reject(failure('AI_SHUTTING_DOWN'));
    prune();
    const key = String(model || 'default');
    let queue = queues.get(key);
    if (!queue) { queue = { active: false, pending: [], nextAt: 0 }; queues.set(key, queue); }
    const pending = [...queues.values()].reduce((count, item) => count + item.pending.length, 0);
    if (queue.active && (queue.pending.length >= maxQueued || pending >= maxTotalQueued)) {
      totals.rejected += 1; prune(); return Promise.reject(failure('AI_QUEUE_FULL'));
    }
    return new Promise((resolve, reject) => {
      const job = { task, options, resolve, reject };
      job.timer = setTimeout(() => expire(queue, job), bounded(options.queueTimeoutMs, queueTimeoutMs, 5, 120000));
      queue.pending.push(job); pump(queue);
    });
  }
  function snapshot() {
    prune();
    return { active: active.size, queued: [...queues.values()].reduce((n, q) => n + q.pending.length, 0), closed, ...totals };
  }
  function close() {
    if (closed) return;
    closed = true;
    const error = failure('AI_SHUTTING_DOWN');
    for (const queue of queues.values()) for (const job of queue.pending.splice(0)) { clearTimeout(job.timer); job.reject(error); }
    for (const controller of active) controller.abort(error);
    queues.clear();
  }
  return { run, snapshot, close };
}
module.exports = { createScheduler, retryAfterMs, minimumInterval };
