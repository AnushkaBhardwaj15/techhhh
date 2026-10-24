export function formatAuditAction(action: string, metadata?: unknown): string {
  const meta = (typeof metadata === 'object' && metadata !== null) ? metadata as Record<string, unknown> : null;
  switch (action) {
    case 'CLAIM_FULL_HOUSE':
      return 'Claimed Full House';
    case 'CLAIM_BOTTOM_LINE':
      return 'Claimed Bottom Row';
    case 'CLAIM_TOP_LINE':
      return 'Claimed Top Row';
    case 'CLAIM_MIDDLE_LINE':
      return 'Claimed Middle Row';
    case 'CLAIM_EARLY_FIVE':
      return 'Claimed Early 5';
    case 'CLAIM_FOUR_CORNERS':
      return 'Claimed Four Corners';
    case 'CLAIM_SECOND_FULL_HOUSE':
      return 'Claimed Second Full House';
    case 'ROUND_STARTED':
      return 'Started Game';
    case 'ROUND_PAUSED':
      return 'Paused Game';
    case 'ROUND_RESUMED':
      return 'Resumed Game';
    case 'ROUND_COMPLETED':
      return 'Completed Game';
    case 'ROUND_CREATED':
    case 'REFERENCE_ROUND_CREATED':
      return 'Created Game';
    case 'DRAW_CALLED':
      return meta?.term ? `Called Clue: ${String(meta.term)}` : 'Called Clue';
    case 'ANSWER_REVEALED':
      return meta?.term ? `Revealed Answer: ${String(meta.term)}` : 'Revealed Answer';
    case 'CELL_MARKED':
      return meta?.term ? `Marked ${String(meta.term)}` : 'Marked Cell';
    case 'CELL_UNMARKED':
      return meta?.term ? `Unmarked ${String(meta.term)}` : 'Unmarked Cell';
    case 'LOGIN_SUCCESS':
      return 'Signed In';
    case 'LOGIN_FAILED':
      return 'Failed Sign In';
    case 'RECOVERY_COMPLETED':
      return 'Recovered Round';
    case 'REFERENCE_ROUND_ACTION':
      return 'Game Operation';
    default:
      if (action.startsWith('CLAIM_')) {
        return `Claimed ${action.slice(6).replace(/_/g, ' ').toLowerCase()}`;
      }
      return action
        .toLowerCase()
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  }
}

export function formatAuditActor(record: {
  actorEmail?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  metadata?: unknown;
}): { primary: string; secondary: string } {
  const meta = (typeof record.metadata === 'object' && record.metadata !== null) ? record.metadata as Record<string, unknown> : null;
  const email = record.actorEmail || (meta?.email as string | undefined);
  const name = meta?.name as string | undefined;

  const roleFormatted = record.actorType
    ? record.actorType.charAt(0).toUpperCase() + record.actorType.slice(1).toLowerCase()
    : 'User';

  return {
    primary: email || name || (record.actorId ? `User (${record.actorId.slice(0, 8)})` : 'System'),
    secondary: roleFormatted,
  };
}

export function formatAuditResource(record: {
  resourceType: string;
  resourceId?: string | null;
  metadata?: unknown;
}): { primary: string; secondary: string } {
  const meta = (typeof record.metadata === 'object' && record.metadata !== null)
    ? record.metadata as Record<string, unknown>
    : null;

  if (record.resourceType === 'auth') {
    return {
      primary: 'Authentication',
      secondary: 'Session',
    };
  }

  if (record.resourceType === 'round') {
    const roundName = (meta?.roundName as string | undefined) || 'Round';
    const code = meta?.gameCode ? `#${String(meta.gameCode)}` : '';
    return {
      primary: roundName,
      secondary: code ? `Code: ${code}` : 'Game',
    };
  }

  if (record.resourceType === 'claim') {
    const pattern = (meta?.patternName as string | undefined) || 'Prize';
    return {
      primary: `Claim: ${pattern}`,
      secondary: (meta?.roundName as string | undefined) || 'Game',
    };
  }

  return {
    primary: record.resourceType.charAt(0).toUpperCase() + record.resourceType.slice(1),
    secondary: (meta?.roundName as string | undefined) || 'Record',
  };
}
