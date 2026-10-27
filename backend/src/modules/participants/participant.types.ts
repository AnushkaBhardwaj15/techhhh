export interface ParticipantSummary {
  id: string;
  userId: string;
  eventId: string;
  email: string;
  name: string;
  externalId: string | null;
  batchName?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  emailDeliveryStatus: 'PENDING' | 'SENT' | 'FAILED' | 'NOT_REQUIRED';
  emailDeliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateParticipantInput {
  eventId: string;
  email: string;
  name: string;
  externalId?: string | null;
  password?: string;
  batchName?: string;
}

export interface UpdateParticipantInput {
  name?: string;
  externalId?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface ParticipantListResult {
  data: ParticipantSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
