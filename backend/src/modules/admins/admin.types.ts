import type { AdminRole, UserStatus } from '../../db/schema/users.ts';

export interface AdminSummary {
  id: string; // user id
  profileId: string;
  email: string;
  name: string;
  role: AdminRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdminInput {
  email: string;
  name: string;
  role: AdminRole;
}

export interface UpdateAdminInput {
  name?: string;
  role?: AdminRole;
  status?: UserStatus;
}

export interface AdminListResult {
  data: AdminSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
