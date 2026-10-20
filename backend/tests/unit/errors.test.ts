import { describe, expect, it } from 'bun:test';
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  ServiceUnavailableError,
} from '../../src/shared/errors/app-error.ts';
import { redactSensitiveData, isSensitiveKey } from '../../src/shared/utils/redaction.ts';

describe('Error classes & status mapping', () => {
  it('instantiates AppError with default 500 status', () => {
    const err = new AppError('Server error', 'CUSTOM_CODE');
    expect(err.message).toBe('Server error');
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
  });

  it('correctly maps all standardized error subclasses', () => {
    expect(new BadRequestError().statusCode).toBe(400);
    expect(new ValidationError().statusCode).toBe(400);
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new UnprocessableEntityError().statusCode).toBe(422);
    expect(new RateLimitError().statusCode).toBe(429);
    expect(new ServiceUnavailableError().statusCode).toBe(503);
  });
});

describe('Sensitive data redaction', () => {
  it('identifies sensitive keys accurately', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('secretKey')).toBe(true);
    expect(isSensitiveKey('userToken')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('sessionCookie')).toBe(true);
    expect(isSensitiveKey('username')).toBe(false);
    expect(isSensitiveKey('email')).toBe(false);
  });

  it('redacts sensitive fields recursively in objects', () => {
    const raw = {
      username: 'alice',
      password: 'mypassword123',
      credentials: 'raw_credential_string',
      profile: {
        api_token: 'secret_token_abc',
        nested: {
          session_id: 'session_value_xyz',
        },
      },
      tags: ['a', 'b'],
    };

    const redacted = redactSensitiveData(raw);

    expect(redacted.username).toBe('alice');
    expect(redacted.password).toBe('***');
    expect(redacted.credentials).toBe('***');
    expect(redacted.profile.api_token).toBe('***');
    expect(redacted.profile.nested.session_id).toBe('***');
    expect(redacted.tags).toEqual(['a', 'b']);
  });
});
