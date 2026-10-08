'use strict';

// Every periodic task has at most one in-flight invocation, including startup.
function createBackgroundTasks({ onError = (name, error) => console.warn('Background task failed:', name, error?.code || error?.name || 'Error'),
  setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const jobs = new Map();
  let stopped = false, stopPromise;
  function schedule(name, task, intervalMs) {
    if (stopped || jobs.has(name)) return false;
    if (typeof task !== 'function' || !Number.isFinite(intervalMs) || intervalMs <= 0) throw new TypeError('Invalid background task');
    const job = { task, promise: null, runs: 0, failures: 0, lastStartedAt: null, lastFinishedAt: null };
    jobs.set(name, job);
    job.timer = setIntervalFn(() => { run(name).catch(() => {}); }, intervalMs);
    job.timer?.unref?.();
    return true;
  }
  function run(name) {
    const job = jobs.get(name);
    if (stopped || !job) return Promise.resolve();
    if (job.promise) return job.promise;
    job.runs += 1; job.lastStartedAt = Date.now();
    const promise = Promise.resolve().then(job.task).catch(error => {
      job.failures += 1;
      try { onError(name, error); } catch {}
      throw error;
    }).finally(() => { job.lastFinishedAt = Date.now(); if (job.promise === promise) job.promise = null; });
    job.promise = promise;
    return promise;
  }
  function snapshot() {
    return [...jobs].map(([name, job]) => ({ name, running: Boolean(job.promise), runs: job.runs,
      failures: job.failures, lastStartedAt: job.lastStartedAt, lastFinishedAt: job.lastFinishedAt }));
  }
  function stop({ drainMs = 2000 } = {}) {
    if (stopPromise) return stopPromise;
    stopped = true;
    for (const job of jobs.values()) clearIntervalFn(job.timer);
    let timer;
    stopPromise = Promise.race([
      Promise.allSettled([...jobs.values()].map(job => job.promise).filter(Boolean)),
      new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, drainMs)); })
    ]).finally(() => clearTimeout(timer));
    return stopPromise;
  }
  return { schedule, run, snapshot, stop };
}
module.exports = { createBackgroundTasks };
