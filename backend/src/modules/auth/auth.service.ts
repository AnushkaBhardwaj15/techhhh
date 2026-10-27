import {
  verifyPassword,
  timingSafeDummyVerify,
  signAuthToken,
  verifyAuthToken,
  SESSION_DURATION_HOURS,
} from './auth.domain.ts';
import { userRepository, type IUserRepository, type UserWithProfile } from './user.repository.ts';
import { sessionRepository, type ISessionRepository } from './session.repository.ts';
import { loginRateLimiter, type LoginRateLimiter } from './auth.rate-limiter.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { UnauthorizedError } from '../../shared/errors/app-error.ts';
import type { SessionRecord } from '../../db/schema/users.ts';

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string | null;
    eventId?: string | null;
  };
  session: SessionRecord;
}

export interface AuthenticatedPrincipal {
  user: {
    id: string;
    email: string;
    name: string;
    role: string | null;
    status: string;
    eventId?: string | null;
  };
  session: SessionRecord;
}

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository = userRepository,
    private readonly sessionRepo: ISessionRepository = sessionRepository,
    private readonly audit: AuditService = auditService,
    private readonly rateLimiter: LoginRateLimiter = loginRateLimiter
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const ip = input.ip || '127.0.0.1';
    const email = input.email.trim().toLowerCase();

    // 1. Check rate limit
    this.rateLimiter.checkLimit(email, ip);

    // 2. Fetch user
    const user = await this.userRepo.findByEmail(email);

    if (!user) {
      await timingSafeDummyVerify(input.password);
      this.rateLimiter.recordFailure(email, ip);

      await this.audit.record({
        action: 'LOGIN_FAILED',
        actorType: 'ANONYMOUS',
        resourceType: 'auth',
        resourceId: email,
        metadata: { reason: 'USER_NOT_FOUND', email },
        ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
      });

      throw new UnauthorizedError('Invalid email or password');
    }

    // 3. Verify password
    const isParticipant = !!user.participantProfile && !user.adminProfile;
    const isPasswordValid = await verifyPassword(user.passwordHash, input.password);

    if (!isPasswordValid) {
      this.rateLimiter.recordFailure(email, ip);

      await this.audit.record({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        actorType: user.adminProfile?.role || (isParticipant ? 'PARTICIPANT' : 'ANONYMOUS'),
        resourceType: 'auth',
        resourceId: user.id,
        metadata: { reason: 'INVALID_PASSWORD', email },
        ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
      });

      throw new UnauthorizedError('Invalid email or password');
    }

    // 4. Check account status
    const isProfileInactive = isParticipant && user.participantProfile?.status !== 'ACTIVE';

    if (user.status !== 'ACTIVE' || isProfileInactive || (!isParticipant && !user.adminProfile)) {
      this.rateLimiter.recordFailure(email, ip);

      await this.audit.record({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        actorType: user.adminProfile?.role || (isParticipant ? 'PARTICIPANT' : 'ANONYMOUS'),
        resourceType: 'auth',
        resourceId: user.id,
        metadata: { reason: 'ACCOUNT_INACTIVE', email },
        ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
      });

      throw new UnauthorizedError('Account is inactive');
    }

    // 5. Success - reset rate limit and create session
    this.rateLimiter.reset(email, ip);

    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
    const session = await this.sessionRepo.create({
      userId: user.id,
      expiresAt,
      ip,
      userAgent: input.userAgent,
    });

    const role = user.adminProfile?.role || 'PARTICIPANT';
    const eventId = user.participantProfile?.eventId || undefined;

    const token = signAuthToken({
      sub: user.id,
      jti: session.id,
      role,
      email: user.email,
      name: user.name,
      eventId,
    });

    try {
      await this.audit.record({
        actorId: user.id,
        actorType: role,
        action: 'LOGIN_SUCCESS',
        resourceType: 'auth',
        resourceId: session.id,
        metadata: { email: user.email, role, eventId },
        ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
      });
    } catch {
      // Non-blocking audit failure
    }

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.adminProfile?.role || (isParticipant ? 'PARTICIPANT' : null),
        eventId: user.participantProfile?.eventId || null,
      },
      session,
    };
  }

  async logout(sessionId?: string): Promise<void> {
    if (!sessionId) return;
    await this.sessionRepo.revoke(sessionId);
  }

  async validateToken(token: string): Promise<AuthenticatedPrincipal> {
    const payload = verifyAuthToken(token);
    if (payload.role === 'PARTICIPANT' && !payload.eventId) {
      throw new UnauthorizedError('Participant Session is missing its Event scope');
    }

    const active = await this.sessionRepo.findActiveWithUser(payload.jti, payload.sub, payload.eventId);
    if (!active) {
      throw new UnauthorizedError('Session has expired or has been revoked');
    }

    const { session, user } = active;
    const isParticipant = !!user?.participantProfile && !user?.adminProfile;
    const isProfileInactive = isParticipant && user?.participantProfile?.status !== 'ACTIVE';

    if (!user || user.status !== 'ACTIVE' || isProfileInactive) {
      throw new UnauthorizedError('User identity not found or inactive');
    }

    const role = user.adminProfile?.role || (isParticipant ? 'PARTICIPANT' : null);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        status: user.status,
        eventId: user.participantProfile?.eventId || null,
      },
      session,
    };
  }

}

export const authService = new AuthService();
