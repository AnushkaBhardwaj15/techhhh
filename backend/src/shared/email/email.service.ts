import { getEnv } from '../../config/env.ts';
import type { Env } from '../../config/env.ts';

type EmailConfig = Pick<Env, 'EMAIL_PROVIDER_API_KEY' | 'EMAIL_PROVIDER_URL' | 'EMAIL_FROM' | 'APP_URL'>;
interface EmailServiceDependencies { getConfig(): EmailConfig; fetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response>; }

export interface EmailDeliveryResult {
  success: boolean;
  error?: string;
}

export interface IEmailService {
  sendParticipantCredentials(
    to: string,
    name: string,
    tempPassword: string,
    eventTitle: string
  ): Promise<EmailDeliveryResult>;
}

export class EmailService implements IEmailService {
  constructor(private readonly dependencies: EmailServiceDependencies = { getConfig: getEnv, fetcher: fetch }) {}

  async sendParticipantCredentials(
    to: string,
    name: string,
    tempPassword: string, // Plaintext password held only in memory, NEVER logged
    eventTitle: string
  ): Promise<EmailDeliveryResult> {
    try {
      const env = this.dependencies.getConfig();
      if (!env.EMAIL_PROVIDER_API_KEY || !env.EMAIL_PROVIDER_URL) {
        return {
          success: false,
          error: 'Email provider not configured',
        };
      }

      const response = await this.dependencies.fetcher(env.EMAIL_PROVIDER_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to,
          subject: `Your ${eventTitle} participant account`,
          text: `Hello ${name},\n\nYour temporary password is: ${tempPassword}\n\nSign in at ${env.APP_URL}.`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { success: false, error: 'Email provider rejected the message' };
      }
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Email provider request failed',
      };
    }
  }
}

export const emailService = new EmailService();
