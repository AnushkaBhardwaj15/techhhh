import { z } from 'zod';
import { redactSensitiveData } from '../shared/utils/redaction.ts';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1, 'Port must be between 1 and 65535').max(65535, 'Port must be between 1 and 65535').default(3000),
    HOST: z
      .string()
      .default('0.0.0.0')
      .transform((val) => {
        if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
          return '0.0.0.0';
        }
        return val || '0.0.0.0';
      }),
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .regex(/^postgres(?:ql)?:\/\//, 'DATABASE_URL must be a valid PostgreSQL URL'),
    JWT_SECRET: z.string({ required_error: 'JWT_SECRET is required' }).min(1, 'JWT_SECRET is required'),
    SESSION_SECRET: z.string({ required_error: 'SESSION_SECRET is required' }).min(1, 'SESSION_SECRET is required'),
    EMAIL_PROVIDER_API_KEY: z.string().optional().or(z.literal('')).transform((val) => (val === '' ? undefined : val)),
    EMAIL_PROVIDER_URL: z.string().url().optional().or(z.literal('')).transform((val) => (val === '' ? undefined : val)),
    SUPER_ADMIN_BOOTSTRAP_SECRET: z.string().min(32).optional().or(z.literal('')).transform((val) => (val === '' ? undefined : val)),
    EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email address').default('noreply@techtombola.internal'),
    APP_URL: z
      .string()
      .optional()
      .or(z.literal(''))
      .default('http://localhost:5173')
      .transform((val) => (!val || val === '' || val === '*' ? 'http://localhost:5173' : val)),
    CORS_ORIGIN: z.string().default('*'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.string().optional().default('false').transform((val) => val === 'true' || val === '1'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_ENABLED: z.string().optional().default('true').transform((val) => val === 'true' || val === '1'),
    KAFKA_BROKERS: z.string().default('localhost:9094'),
    KAFKA_CLIENT_ID: z.string().default('techtombola-backend'),
    KAFKA_ENABLED: z.string().optional().default('true').transform((val) => val === 'true' || val === '1'),
    QR_HMAC_SECRET: z.string().min(1).default('dev_qr_hmac_secret_must_be_32_characters_long_for_dev'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be at least 32 characters long in production',
        });
      }
      if (data.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET must be at least 32 characters long in production',
        });
      }
      if (data.QR_HMAC_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['QR_HMAC_SECRET'],
          message: 'QR_HMAC_SECRET must be at least 32 characters long in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.errors.map((err) => {
      const field = err.path.join('.');
      return `Field '${field}': ${err.message}`;
    });

    const safeMessage = `Configuration validation failed:\n  - ${errorDetails.join('\n  - ')}`;
    throw new Error(safeMessage);
  }

  return result.data;
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }
  return cachedEnv;
}

export function resetCachedEnv(): void {
  cachedEnv = null;
}

export function getSafeEnv(env: Env = getEnv()): Record<string, unknown> {
  return redactSensitiveData(env as unknown as Record<string, unknown>);
}
