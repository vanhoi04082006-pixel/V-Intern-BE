import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { InterviewSessionStatus } from '../interview-status.machine';

/**
 * InterviewSession (Phase 4, spec 12/17/19).
 *
 * Timer authority is the BACKEND: startedAt/expiresAt are stored here and
 * every answer/submit verifies serverNow <= expiresAt (spec 17).
 *
 * FK graph (see the Phase 4 migration for the deliberate actions):
 * - profileId → recruitment_profiles CASCADE
 * - userId    → users NO ACTION (multi-cascade-path avoidance, spec 58;
 *   the strong ownership path is profile → session CASCADE).
 */
@Entity({ name: 'interview_sessions' })
@Index('IX_interview_sessions_userId_status', ['userId', 'status'])
@Index('IX_interview_sessions_profileId_status', ['profileId', 'status'])
export class InterviewSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  @Column('uuid', { name: 'profileId' })
  profileId!: string;

  @Column({ type: 'nvarchar', length: 32, name: 'roleCode' })
  roleCode!: string;

  @Column({ type: 'nvarchar', length: 24, name: 'status', default: 'created' })
  status!: InterviewSessionStatus;

  @Column({ type: 'datetime2', name: 'startedAt', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime2', name: 'expiresAt', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'datetime2', name: 'submittedAt', nullable: true })
  submittedAt!: Date | null;

  @Column({ type: 'datetime2', name: 'evaluationStartedAt', nullable: true })
  evaluationStartedAt!: Date | null;

  @Column({ type: 'datetime2', name: 'evaluatedAt', nullable: true })
  evaluatedAt!: Date | null;

  /** 1-based attempt number (mirrors profile.attemptCount after start). */
  @Column({ type: 'int', name: 'attemptNumber' })
  attemptNumber!: number;

  /** Always 8 for valid sessions (approved distribution — spec 14). */
  @Column({ type: 'int', name: 'questionCount' })
  questionCount!: number;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
