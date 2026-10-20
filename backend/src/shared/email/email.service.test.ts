import { describe, expect, it } from 'bun:test';
import { EmailService } from './email.service.ts';

const config = {
  EMAIL_PROVIDER_API_KEY: 'provider-test-key',
  EMAIL_PROVIDER_URL: 'https://provider.example.test/send',
  EMAIL_FROM: 'noreply@example.test',
  APP_URL: 'https://app.example.test',
};

describe('EmailService', () => {
  it('sends participant credentials to the configured provider', async () => {
    let request: RequestInit | undefined;
    const service = new EmailService({ getConfig: () => config, fetcher: async (_url, init) => { request = init; return new Response(null, { status: 202 }); } });

    await expect(service.sendParticipantCredentials('player@example.test', 'Player', 'temporary-pass', 'Event A')).resolves.toEqual({ success: true });
    expect(request?.headers).toEqual({ authorization: 'Bearer provider-test-key', 'content-type': 'application/json' });
    expect(JSON.parse(String(request?.body))).toEqual({
      from: config.EMAIL_FROM,
      to: 'player@example.test',
      subject: 'Your Event A participant account',
      text: 'Hello Player,\n\nYour temporary password is: temporary-pass\n\nSign in at https://app.example.test.',
    });
  });

  it('returns a safe failure when provider configuration is incomplete', async () => {
    let called = false;
    const service = new EmailService({ getConfig: () => ({ ...config, EMAIL_PROVIDER_API_KEY: undefined }), fetcher: async () => { called = true; return new Response(); } });
    await expect(service.sendParticipantCredentials('player@example.test', 'Player', 'secret', 'Event')).resolves.toEqual({ success: false, error: 'Email provider not configured' });
    expect(called).toBe(false);
  });

  it('returns safe errors for rejected provider responses and transport failures', async () => {
    const rejected = new EmailService({ getConfig: () => config, fetcher: async () => new Response(null, { status: 503 }) });
    const unavailable = new EmailService({ getConfig: () => config, fetcher: async () => { throw new Error('private connection details'); } });
    await expect(rejected.sendParticipantCredentials('player@example.test', 'Player', 'secret', 'Event')).resolves.toEqual({ success: false, error: 'Email provider rejected the message' });
    await expect(unavailable.sendParticipantCredentials('player@example.test', 'Player', 'secret', 'Event')).resolves.toEqual({ success: false, error: 'Email provider request failed' });
  });
});
