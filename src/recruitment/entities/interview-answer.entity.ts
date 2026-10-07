import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * InterviewAnswer (Phase 4, spec 16) — one answer per session question
 * (DB-enforced by UX_interview_answers_sessionQuestionId).
 *
 * Answers are mutable ONLY while the session is in_progress and before
 * expiry (verified server-side — spec 16/17); after submission they are
 * immutable evidence for evaluation/audit (spec 40).
 *
 * sessionId/userId are denormalized query columns; their FKs are NO ACTION
 * (multi-cascade-path avoidance, spec 58) — the CASCADE ownership path is
 * session → session_questions → answers.
 */
@Entity({ name: 'interview_answers' })
@Index('UX_interview_answers_sessionQuestionId', ['sessionQuestionId'], { unique: true })
@Index('IX_interview_answers_sessionId', ['sessionId'])
export class InterviewAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'sessionQuestionId' })
  sessionQuestionId!: string;

  @Column('uuid', { name: 'sessionId' })
  sessionId!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 'max', name: 'answerText' })
  answerText!: string;

  @Column({ type: 'datetime2', name: 'answeredAt' })
  answeredAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
