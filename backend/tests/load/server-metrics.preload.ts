import { appendFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const metricsPath = process.env.LOAD_LOOP_METRICS_FILE;
if (!metricsPath) throw new Error('LOAD_LOOP_METRICS_FILE is required for the load-test server');

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
setInterval(() => {
  void appendFile(metricsPath, `${JSON.stringify({
    meanMs: Number.isFinite(eventLoop.mean) ? eventLoop.mean / 1e6 : 0,
    p99Ms: Number.isFinite(eventLoop.percentile(99)) ? eventLoop.percentile(99) / 1e6 : 0,
    maxMs: Number.isFinite(eventLoop.max) ? eventLoop.max / 1e6 : 0,
  })}\n`);
  eventLoop.reset();
}, 1000).unref();
