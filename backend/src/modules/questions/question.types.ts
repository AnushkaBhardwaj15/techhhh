export interface KeySummary {
  id: string;
  eventId: string;
  value: string;
  normalizedValue: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyListRow extends KeySummary {
  used: boolean;
  canEdit: boolean;
}

export interface AppliedQuestionKeyFilters {
  search: string | null;
  used: boolean | null;
}

export interface CreateKeyInput {
  eventId: string;
  value: string;
}

export interface UpdateKeyInput {
  value: string;
}

export interface KeyListResult {
  data: KeyListRow[];
  filters: AppliedQuestionKeyFilters;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface QuestionSummary {
  id: string;
  roundId: string;
  keyId: string;
  keyValue: string;
  questionText: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionListRow extends QuestionSummary {
  used: boolean;
  canEdit: boolean;
}

export interface CreateQuestionInput {
  roundId: string;
  keyId: string;
  questionText: string;
}

export interface UpdateQuestionInput {
  questionText: string;
}

export interface QuestionListResult {
  data: QuestionListRow[];
  filters: AppliedQuestionKeyFilters;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
