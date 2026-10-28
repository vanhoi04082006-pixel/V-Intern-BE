import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * RecruitmentResult (Phase 4, spec 34/34/36) — the authoritative Backend
 * evaluation outcome. Unique per session (no duplicate results, spec 34/40).
 *
 * Scores are decimal(5,1) — no binary-float persistence (spec 35).
 * decision is computed by the BACKEND formula (70/30, >70 passes);
 * scores 50..70 retain failed eligibility with answer-backed alternative-role guidance.
 * AI-provided decisions are never stored here.
 */
@Entity({ name: 'recruitment_results' })
@Index('UX_recruitment_results_sessionId', ['sessionId'], { unique: true })
@Index('IX_recruitment_results_profileId', ['profileId'])
export class RecruitmentResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'profileId' })
  profileId!: string;

  @Column('uuid', { name: 'sessionId' })
  sessionId!: string;

  /** Provenance pointer into ai_runs (plain column — no FK, spec 33/70). */
  @Column('uuid', { name: 'aiRunId', nullable: true })
  aiRunId!: string | null;

  @Column({ type: 'nvarchar', length: 16, default: 'ai' })
  evaluationSource!: 'ai' | 'instructor';

  @Column('uuid', { nullable: true })
  evaluatedBy!: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'technicalScore' })
  technicalScore!: number;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'softSkillScore' })
  softSkillScore!: number;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'overallScore' })
  overallScore!: number;

  /** Computed by the Backend ONLY (spec 36). */
  @Column({ type: 'nvarchar', length: 16, name: 'decision' })
  decision!: 'passed' | 'failed';

  /** JSON arrays of bounded strings (validated — spec 29). */
  @Column({ type: 'nvarchar', length: 'max', name: 'strengthsJson' })
  strengthsJson!: string;

  @Column({ type: 'nvarchar', length: 'max', name: 'weaknessesJson' })
  weaknessesJson!: string;

  @Column({ type: 'nvarchar', length: 'max', name: 'feedback' })
  feedback!: string;

  /** JSON array of validated criterion feedback (spec 29). */
  @Column({ type: 'nvarchar', length: 'max', name: 'criteriaJson' })
  criteriaJson!: string;

  @Column({ type: 'nvarchar', length: 32, name: 'recommendedRole', nullable: true })
  recommendedRole!: string | null;

  /** AI provenance (spec 70): which provider+model produced the scores. */
  @Column({ type: 'nvarchar', length: 128, name: 'model' })
  model!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'promptVersion' })
  promptVersion!: string;

  @Column({ type: 'datetime2', name: 'evaluatedAt' })
  evaluatedAt!: Date;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
