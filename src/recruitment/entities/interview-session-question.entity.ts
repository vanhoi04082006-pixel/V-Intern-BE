import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { InterviewCategory } from '../question-selection';

/**
 * InterviewSessionQuestion (Phase 4, spec 13) — the IMMUTABLE snapshot of
 * what a candidate actually received. Question-bank rows may change or be
 * deleted later; sessions keep their exact historical composition
 * (promptSnapshot + rubricSnapshot) so evaluation and audits stay
 * reproducible (spec 13/40/70).
 *
 * questionId is nullable with ON DELETE SET NULL: deleting a bank row
 * must never destroy a session's evidence.
 */
@Entity({ name: 'interview_session_questions' })
@Index('UX_interview_session_questions_sessionId_position', ['sessionId', 'position'], {
  unique: true,
})
@Index('IX_interview_session_questions_questionId', ['questionId'])
export class InterviewSessionQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'sessionId' })
  sessionId!: string;

  @Column('uuid', { name: 'questionId', nullable: true })
  questionId!: string | null;

  /** 1-based ordering inside the session (1..8 for approved sessions). */
  @Column({ type: 'int', name: 'position' })
  position!: number;

  @Column({ type: 'nvarchar', length: 16, name: 'category' })
  category!: InterviewCategory;

  @Column({ type: 'nvarchar', length: 'max', name: 'promptSnapshot' })
  promptSnapshot!: string;

  @Column({ type: 'nvarchar', length: 16, name: 'difficultySnapshot' })
  difficultySnapshot!: string;

  /** INTERNAL ONLY — never leaves the backend (spec 10/11/42). */
  @Column({ type: 'nvarchar', length: 'max', name: 'rubricSnapshot' })
  rubricSnapshot!: string;
}
