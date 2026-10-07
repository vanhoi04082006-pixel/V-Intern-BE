import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Refresh token — stored SHA-256 hashed; the raw token never touches the DB.
 * Rotation: each refresh revokes the old token and records `replacedById`.
 * Reuse detection: presenting a revoked token revokes the ENTIRE `familyId`.
 */
@Entity({ name: 'refresh_tokens' })
@Index('UX_refresh_tokens_tokenHash', ['tokenHash'], { unique: true })
@Index('IX_refresh_tokens_userId', ['userId'])
@Index('IX_refresh_tokens_familyId', ['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'tokenHash' })
  tokenHash!: string;

  @Column('uuid', { name: 'familyId' })
  familyId!: string;

  @Column('uuid', { name: 'replacedById', nullable: true })
  replacedById!: string | null;

  @Column({ type: 'datetime2', name: 'expiresAt' })
  expiresAt!: Date;

  @Column({ type: 'datetime2', name: 'revokedAt', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'nvarchar', length: 64, name: 'createdByIp', nullable: true })
  createdByIp!: string | null;

  @Column({ type: 'nvarchar', length: 256, name: 'userAgent', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
