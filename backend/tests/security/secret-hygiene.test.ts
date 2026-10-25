import { describe, expect, it } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('secret and credential hygiene', () => {
  it('ensures render.yaml does not contain plaintext passwords or connection strings', () => {
    const renderYamlPath = resolve(import.meta.dir, '../../../render.yaml');
    if (!existsSync(renderYamlPath)) return;

    const content = readFileSync(renderYamlPath, 'utf8');

    // Should not contain inline postgres passwords
    expect(content).not.toContain('npg_');
    expect(content).not.toContain('password=');
    expect(content).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/i);

    // DATABASE_URL should be sync: false
    expect(content).toContain('sync: false');
  });

  it('ensures .env.example does not leak real production secrets', () => {
    const envExamplePath = resolve(import.meta.dir, '../../../.env.example');
    if (!existsSync(envExamplePath)) return;

    const content = readFileSync(envExamplePath, 'utf8');
    expect(content).toContain('replace_with_');
    expect(content).not.toContain('npg_');
  });
});
