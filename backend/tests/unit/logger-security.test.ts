import { describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import { PassThrough } from 'node:stream';
import { APP_LOG_REDACT_PATHS, serializeLogError } from '../../src/shared/utils/logger.ts';

describe('application log redaction', () => {
  it('redacts credential fields using the production Fastify logger configuration', async () => {
    const destination = new PassThrough();
    let output = '';
    destination.on('data', (chunk) => { output += chunk.toString(); });
    const app = Fastify({ logger: { level: 'info', redact: APP_LOG_REDACT_PATHS, serializers: { err: serializeLogError }, stream: destination } });

    app.log.info({
      password: 'plain-password',
      nested: { token: 'session-token', secret: 'bootstrap-secret' },
      req: { headers: { authorization: 'Bearer raw-token', cookie: 'session_token=raw-cookie', 'x-bootstrap-secret': 'raw-bootstrap' } },
    }, 'security scan');
    await app.close();

    expect(output).toContain('security scan');
    for (const secret of ['plain-password', 'session-token', 'bootstrap-secret', 'Bearer raw-token', 'session_token=raw-cookie', 'raw-bootstrap']) {
      expect(output).not.toContain(secret);
    }
  });
});

it('logs database error type and code without query, arguments, or protected content', async () => {
  const destination = new PassThrough();
  let output = '';
  destination.on('data', (chunk) => { output += chunk.toString(); });
  const app = Fastify({ logger: { level: 'info', serializers: { err: serializeLogError }, stream: destination } });
  const error = Object.assign(new Error('credential-and-future-question-marker'), {
    code: '23505', query: 'future-question-query-marker', parameters: ['secret-password-marker'],
  });
  app.log.error({ err: error }, 'Database operation failed');
  await app.close();
  expect(output).toContain('23505');
  expect(output).toContain('Error');
  for (const marker of ['credential-and-future-question-marker', 'future-question-query-marker', 'secret-password-marker']) expect(output).not.toContain(marker);
});
