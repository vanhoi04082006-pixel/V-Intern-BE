import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * AIRun — AI provenance ledger (Phase 4, spec 33/70).
 *
 * One row per AI invocation attempt (feature-level), persisted BEFORE the
 * provider call (status=running) and updated after it. Deliberately:
 * - NO API key, NO secret headers, NO hidden chain-of-thought (spec 30/33)
 * - NO foreign keys: provenance must survive the deletion of any
 *   referenced row; userId/resourceId are plain indexed columns.
 */
@Entity({ name: 'ai_runs' })
@Index('IX_ai_runs_resource', ['resourceType', 'resourceId', 'status'])
@Index('IX_ai_runs_userId', ['userId'])
@Index('IX_ai_runs_status_createdAt', ['status', 'createdAt'])
export class AiRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Logical feature, e.g. 'recruitment-evaluation'. */
  @Column({ type: 'nvarchar', length: 64, name: 'feature' })
  feature!: string;

  /** Provider code, e.g. 'gemini' | 'test'. */
  @Column({ type: 'nvarchar', length: 32, name: 'provider' })
  provider!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'model' })
  model!: string;

  /** running | succeeded | failed */
  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'running' })
  status!: 'running' | 'succeeded' | 'failed';

  @Column('uuid', { name: 'userId', nullable: true })
  userId!: string | null;

  /** Polymorphic target, e.g. 'interview_session'. */
  @Column({ type: 'nvarchar', length: 64, name: 'resourceType' })
  resourceType!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'resourceId' })
  resourceId!: string;

  /** Explicit prompt version, e.g. 'recruitment-evaluation-v1' (spec 71). */
  @Column({ type: 'nvarchar', length: 64, name: 'promptVersion' })
  promptVersion!: string;

  @Column({ type: 'datetime2', name: 'startedAt' })
  startedAt!: Date;

  @Column({ type: 'datetime2', name: 'completedAt', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'int', name: 'latencyMs', nullable: true })
  latencyMs!: number | null;

  @Column({ type: 'int', name: 'inputTokens', nullable: true })
  inputTokens!: number | null;

  @Column({ type: 'int', name: 'outputTokens', nullable: true })
  outputTokens!: number | null;

  /** Stable error code (AI_PROVIDER_TIMEOUT etc.) — never a raw body. */
  @Column({ type: 'nvarchar', length: 64, name: 'errorCode', nullable: true })
  errorCode!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
