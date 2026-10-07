import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RecruitmentProfileStatus } from '../recruitment-status.machine';

/**
 * RecruitmentProfile (Phase 4, spec 7) — ONE per user, the authoritative
 * lifecycle record gating the whole intern lifecycle (spec 46-49).
 *
 * currentInterviewSessionId is a maintained back-pointer WITHOUT a foreign
 * key on purpose: interview_sessions already CASCADE from this profile and
 * a reverse FK would create a circular FK between the two tables. The
 * service layer keeps the pointer consistent inside the same transaction.
 */
@Entity({ name: 'recruitment_profiles' })
@Index('UX_recruitment_profiles_userId', ['userId'], { unique: true })
@Index('IX_recruitment_profiles_status', ['status'])
export class RecruitmentProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  /** Recruitment role code (frontend|backend|qa|business_analyst) — spec 8. */
  @Column({ type: 'nvarchar', length: 32, name: 'selectedRole', nullable: true })
  selectedRole!: string | null;

  @Column({ type: 'nvarchar', length: 32, name: 'status', default: 'not_started' })
  status!: RecruitmentProfileStatus;

  /** Back-pointer to the session the candidate is working on (no FK — see above). */
  @Column('uuid', { name: 'currentInterviewSessionId', nullable: true })
  currentInterviewSessionId!: string | null;

  /** Consumed attempts (incremented when a session STARTS — spec 19). */
  @Column({ type: 'int', name: 'attemptCount', default: 0 })
  attemptCount!: number;

  /** Set once on the FIRST pass — never overwritten (spec 37). */
  @Column({ type: 'datetime2', name: 'recruitedAt', nullable: true })
  recruitedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
