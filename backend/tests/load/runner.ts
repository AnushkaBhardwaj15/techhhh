const command = ['bun', 'tests/load/run.ts'];
if (process.env.LOAD_DRIVER_CPUS) command.unshift('taskset', '--cpu-list', process.env.LOAD_DRIVER_CPUS);
const run = Bun.spawn(command, {
  env: { ...process.env, BUN_CONFIG_MAX_HTTP_REQUESTS: '512' },
  stdout: 'inherit',
  stderr: 'inherit',
});

process.exit(await run.exited);
