export interface ParticipantSummary {
  id: string;
  userId: string;
  eventId: string;
  email: string;
  name: string;
  externalId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  emailDeliveryStatus: 'PENDING' | 'SENT' | 'FAILED';
  emailDeliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateParticipantInput {
  batchName?: string;
  password: string;
  eventId?: string;
  email: string;
  name?: string;
  externalId?: string | null;
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
