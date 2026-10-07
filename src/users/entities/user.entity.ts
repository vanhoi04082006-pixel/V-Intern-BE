import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const USER_STATUSES = ['active', 'pending', 'locked', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

@Entity({ name: 'users' })
@Index('UX_users_email', ['email'], { unique: true })
@Index('UX_users_username', ['username'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 320, name: 'email' })
  email!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'username' })
  username!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'displayName' })
  displayName!: string;

  @Column({ type: 'nvarchar', length: 255, name: 'passwordHash' })
  passwordHash!: string;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'pending' })
  status!: UserStatus;

  @Column({ type: 'datetime2', name: 'lastLoginAt', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
