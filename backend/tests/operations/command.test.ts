import { describe, expect, it } from 'bun:test';
import { runCommand } from './command.ts';

const isWindows = process.platform === 'win32';

describe.skipIf(isWindows)('operational command execution', () => {
  it('captures output and sends input without a shell', async () => {
    const result = await runCommand(['bun', '-e', 'console.log(await Bun.stdin.text())'], { input: 'fixture input' });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('fixture input');
  });
  it('fails closed on errors and allows explicitly expected negative scenarios', async () => {
    const args = ['bun', '-e', 'console.error("private-error-marker");process.exit(7)'];
    try {
      await runCommand(args, { env: { TEST_SECRET: 'private-error-marker' } });
      throw new Error('Expected command to fail');
    } catch (error) {
      expect((error as Error).message).toContain('failed (exit 7)');
      expect((error as Error).message).not.toContain('private-error-marker');
    }
    const result = await runCommand(args, { allowFailure: true });
    expect(result.code).toBe(7);
    expect(result.stderr).toContain('private-error-marker');
  });
  it('terminates stalled commands with bounded diagnostics', async () => {
    await expect(runCommand(['bun', '-e', 'await Bun.sleep(5000)'], { timeoutMs: 30 })).rejects.toThrow('timed out');
  });
});
