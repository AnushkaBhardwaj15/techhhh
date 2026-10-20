import { ERROR_CODES, type ErrorCode } from '../../config/constants.ts';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: string = ERROR_CODES.INTERNAL_SERVER_ERROR, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code: string = ERROR_CODES.BAD_REQUEST) {
    super(message, code, 400);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', code: string = ERROR_CODES.VALIDATION_ERROR) {
    super(message, code, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code: string = ERROR_CODES.UNAUTHORIZED) {
    super(message, code, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code: string = ERROR_CODES.FORBIDDEN) {
    super(message, code, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code: string = ERROR_CODES.NOT_FOUND) {
    super(message, code, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code: string = ERROR_CODES.CONFLICT) {
    super(message, code, 409);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable entity', code: string = ERROR_CODES.UNPROCESSABLE_ENTITY) {
    super(message, code, 422);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', code: string = ERROR_CODES.RATE_LIMIT_EXCEEDED) {
    super(message, code, 429);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', code: string = ERROR_CODES.SERVICE_UNAVAILABLE) {
    super(message, code, 503);
  }
}
