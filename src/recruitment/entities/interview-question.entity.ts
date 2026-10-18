import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { InterviewCategory } from '../question-selection';

/**
 * InterviewQuestion (Phase 4, spec 10) — the internal question bank.
 *
 * SECURITY: rubricJson holds expected-answer guidance + internal scoring
 * criteria. It is NEVER returned by any intern-facing API (spec 10/11/42)
 * Administrator-only bank APIs require permission plus effective admin role.
 */
@Entity({ name: 'interview_questions' })
@Index('IX_interview_questions_role_active', ['roleCode', 'isActive', 'sortOrder'])
@Index('IX_interview_questions_role_category_active', ['roleCode', 'category', 'isActive'])
export class InterviewQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Recruitment role code (see recruitment-roles.ts) — spec 8. */
  @Column({ type: 'nvarchar', length: 32, name: 'roleCode' })
  roleCode!: string;

  @Column({ type: 'nvarchar', length: 16, name: 'category' })
  category!: InterviewCategory;

  @Column({ type: 'nvarchar', length: 16, name: 'difficulty' })
  difficulty!: 'easy' | 'medium' | 'hard';

  @Column({ type: 'nvarchar', length: 'max', name: 'prompt' })
  prompt!: string;

  /** INTERNAL ONLY — expected answer guidance / scoring criteria (JSON). */
  @Column({ type: 'nvarchar', length: 'max', name: 'rubricJson' })
  rubricJson!: string;

  @Column({ type: 'bit', name: 'isActive', default: true })
  isActive!: boolean;

  @Column({ type: 'int', name: 'sortOrder', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
