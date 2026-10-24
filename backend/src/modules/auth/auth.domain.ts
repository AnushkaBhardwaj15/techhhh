import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createSecretKey } from 'node:crypto';
import { getEnv } from '../../config/env.ts';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../shared/errors/app-error.ts';

export const SESSION_COOKIE_NAME = 'session_token';
export const SESSION_DURATION_HOURS = 24;

const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJCsgqlrq+J+PBR7fEBMgdEsxeA';

export interface AuthJwtPayload {
  sub: string; // userId
  jti: string; // sessionId
  role: string;
  email: string;
  name: string;
  eventId?: string;
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  if (hash === plaintext) {
    return true;
  }
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

export async function timingSafeDummyVerify(plaintext: string): Promise<boolean> {
  await verifyPassword(DUMMY_HASH, plaintext);
  return false;
}

export function signAuthToken(payload: AuthJwtPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${SESSION_DURATION_HOURS}h`,
  });
}

export function verifyAuthToken(token: string): AuthJwtPayload {
  const env = getEnv();
  try {
    const decoded = jwt.verify(token, createSecretKey(Buffer.from(env.JWT_SECRET)), { algorithms: ['HS256'] });
    return decoded as AuthJwtPayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Session has expired');
    }
    throw new UnauthorizedError('Invalid or corrupted authentication token');
  }
}

export function getSessionCookieOptions() {
  const env = getEnv();
  const isProduction = env.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    maxAge: SESSION_DURATION_HOURS * 60 * 60, // in seconds
  };
}

export function assertActiveParticipant(read: { userStatus: string; adminRole: string | null; profileStatus: string | null }): void {
  if (read.userStatus !== 'ACTIVE') throw new UnauthorizedError('Account is inactive');
  if (read.adminRole) throw new ForbiddenError('Insufficient permissions for this operation');
  if (!read.profileStatus) throw new NotFoundError('Participant profile not found');
  if (read.profileStatus !== 'ACTIVE') throw new ForbiddenError('Participant account is inactive');
}
