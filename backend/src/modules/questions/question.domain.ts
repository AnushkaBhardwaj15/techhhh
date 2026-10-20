import { ConflictError, ValidationError } from '../../shared/errors/app-error.ts';
import type { RoundStatus } from '../rounds/round.types.ts';

const VALID_KEY_REGEX = /^[A-Z0-9 -]+$/;

export function normalizeKey(raw: string): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Key value must be a string');
  }

  // 1. Trim and collapse whitespace
  const trimmed = raw.trim();
  const collapsed = trimmed.replace(/\s+/g, ' ');
  const uppercase = collapsed.toUpperCase();

  // 2. Length check: 2 to 50 characters
  if (uppercase.length < 2 || uppercase.length > 50) {
    throw new ValidationError('Key value must be between 2 and 50 characters');
  }

  // 3. Allowed characters: uppercase letters, digits, spaces, hyphens
  if (!VALID_KEY_REGEX.test(uppercase)) {
    throw new ValidationError(
      'Key contains invalid characters. Only letters, digits, spaces, and hyphens are allowed'
    );
  }

  return uppercase;
}

export function validateQuestionText(raw: string): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Question text must be a string');
  }

  const trimmed = raw.trim();
  if (trimmed.length < 10 || trimmed.length > 500) {
    throw new ValidationError('Question text must be between 10 and 500 characters');
  }

  return trimmed;
}

export function assertCanModifyRoundQuestions(roundStatus: RoundStatus): void {
  if (roundStatus !== 'DRAFT') {
    throw new ConflictError(
      `Cannot modify questions for a round in status '${roundStatus}'. Question bank is immutable after reaching READY.`,
      'ROUND_IMMUTABLE'
    );
  }
}
