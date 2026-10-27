import {
  hashPassword,
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
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { participantProfiles, type SessionRecord } from '../../db/schema/users.ts';
import { events } from '../../db/schema/events.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { tickets } from '../../db/schema/tickets.ts';
import { ticketRepository } from '../tickets/ticket.repository.ts';
import { generateTicketLayout } from '../tickets/ticket.domain.ts';

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
    private readonly rateLimiter: LoginRateLimiter = loginRateLimiter,
    private readonly connection = getDb,
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

    if (user.status !== 'ACTIVE' || isProfileInactive || (!user.adminProfile && !user.participantProfile)) {
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
    if (role !== payload.role || (isParticipant && user.participantProfile?.eventId !== payload.eventId)) {
      throw new UnauthorizedError('Session identity has changed; sign in again');
    }

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

  async quickJoin(input: {
    name: string;
    email: string;
    password?: string;
    eventId?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<LoginResult & { roundId?: string; ticketId?: string }> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const ip = input.ip || '127.0.0.1';
    this.rateLimiter.checkLimit(email, ip);
    let user = await this.userRepo.findByEmail(email);
    if (user) {
      if (!input.password || !(await verifyPassword(user.passwordHash, input.password))) {
        this.rateLimiter.recordFailure(email, ip);
        throw new UnauthorizedError('Invalid email or password');
      }
      if (user.adminProfile || user.status !== 'ACTIVE') {
        throw new UnauthorizedError('This account cannot join as a participant');
      }
    } else if (!input.password || input.password.length < 8) {
      throw new UnauthorizedError('A password of at least 8 characters is required');
    }
    const db = this.connection();

    // 1. Resolve target event
    let targetEventId = input.eventId;
    if (!targetEventId) {
      const activeEvents = await db
        .select()
        .from(events)
        .where(inArray(events.status, ['LIVE', 'READY', 'DRAFT']))
        .orderBy(desc(events.createdAt))
        .limit(1);

      if (activeEvents.length > 0) {
        targetEventId = activeEvents[0].id;
      } else {
        const anyEvent = await db.select().from(events).orderBy(desc(events.createdAt)).limit(1);
        if (anyEvent.length > 0) {
          targetEventId = anyEvent[0].id;
        } else {
          const [newEvent] = await db.insert(events).values({
            title: 'Tech Tombola 2026',
            description: 'Synchronized Digital Tombola',
            status: 'LIVE',
          }).returning({ id: events.id });
          targetEventId = newEvent.id;
        }
      }
    }

    // 2. Find or create user
    if (!user) {
      const plainPassword = input.password!;
      const passwordHash = await hashPassword(plainPassword);
      user = await this.userRepo.create({
        email,
        passwordHash,
        name,
        status: 'ACTIVE',
      });
    }
    if (!user) {
      throw new Error('Failed to find or create participant user');
    }

    // 3. Find or create participant profile for this event
    let participantProfile = user.participantProfile;
    if (!participantProfile || participantProfile.eventId !== targetEventId) {
      const existingProfiles = await db
        .select()
        .from(participantProfiles)
        .where(and(eq(participantProfiles.userId, user.id), eq(participantProfiles.eventId, targetEventId)));

      if (existingProfiles.length > 0) {
        participantProfile = existingProfiles[0];
      } else {
        const [createdProfile] = await db.insert(participantProfiles).values({
          userId: user.id,
          eventId: targetEventId,
          status: 'ACTIVE',
        }).returning();
        participantProfile = createdProfile;
      }
    }

    if (participantProfile.status !== 'ACTIVE') {
      throw new UnauthorizedError('Participant account is inactive');
    }
    this.rateLimiter.reset(email, ip);

    // 4. Check for active/ready/draft round and auto-generate ticket if missing
    let roundId: string | undefined;
    let ticketId: string | undefined;

    const currentRounds = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.eventId, targetEventId), inArray(rounds.status, ['ACTIVE', 'READY', 'DRAFT'])))
      .orderBy(desc(rounds.sequenceNumber))
      .limit(1);

    if (currentRounds.length > 0) {
      const currentRound = currentRounds[0];
      roundId = currentRound.id;

      const existingTickets = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.roundId, currentRound.id), eq(tickets.participantId, participantProfile.id)));

      if (existingTickets.length > 0) {
        ticketId = existingTickets[0].id;
      } else {
        const keys = await ticketRepository.getRoundKeys(currentRound.id);
        if (keys.length >= 15) {
          try {
            const layout = generateTicketLayout({ keys });
            const createdTicket = await ticketRepository.createTicketWithCells({
              roundId: currentRound.id,
              participantId: participantProfile.id,
              eventId: targetEventId,
              cells: layout.cells,
            });
            ticketId = createdTicket.id;
          } catch (err) {
            console.warn('Could not auto-generate ticket during quick join:', err);
          }
        }
      }
    }

    // 5. Create Session
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
    const session = await this.sessionRepo.create({
      userId: user.id,
      expiresAt,
      ip,
      userAgent: input.userAgent,
    });

    const token = signAuthToken({
      sub: user.id,
      jti: session.id,
      role: 'PARTICIPANT',
      email: user.email,
      name: user.name,
      eventId: targetEventId,
    });

    await this.audit.record({
      actorId: user.id,
      action: 'PARTICIPANT_CREATED',
      actorType: 'PARTICIPANT',
      resourceType: 'auth',
      resourceId: user.id,
      metadata: { eventId: targetEventId, roundId, ticketId },
      ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'PARTICIPANT',
        eventId: targetEventId,
      },
      session,
      roundId,
      ticketId,
    };
  }
}

export const authService = new AuthService();
