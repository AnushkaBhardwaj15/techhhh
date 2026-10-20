export async function runCommand(
  args: string[],
  options: { env?: Record<string, string | undefined>; input?: string; allowFailure?: boolean; timeoutMs?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(args, { env: { ...process.env, ...options.env }, stdin: options.input === undefined ? 'ignore' : 'pipe', stdout: 'pipe', stderr: 'pipe' });
  if (options.input !== undefined && child.stdin) {
    child.stdin.write(options.input);
    child.stdin.end();
  }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeoutMs ?? 120_000);
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (timedOut) throw new Error(`${args[0]} ${args[1] ?? ''} timed out`);
    if (code !== 0 && !options.allowFailure) {
      let diagnostic = stderr.split('\n').slice(-18).join('\n');
      for (const [key, value] of Object.entries({ ...process.env, ...options.env })) {
        if (value && value.length > 3 && /secret|password|token|database_url|api_key/i.test(key)) {
          diagnostic = diagnostic.replaceAll(value, '[REDACTED]');
          if (/database_url/i.test(key)) {
            try { const password = decodeURIComponent(new URL(value).password); if (password) diagnostic = diagnostic.replaceAll(password, '[REDACTED]'); } catch {}
          }
        }
      }
      throw new Error(`${args[0]} ${args[1] ?? ''} failed (exit ${code}): ${diagnostic}`);
    }
    return { code, stdout, stderr };
  } finally { clearTimeout(timer); }
}
