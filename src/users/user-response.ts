import { User } from './entities/user.entity';

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  displayName: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Explicit mapper — guarantees `passwordHash` NEVER leaves the service. */
export function toUserResponse(u: User): UserResponse {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    status: u.status,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}
