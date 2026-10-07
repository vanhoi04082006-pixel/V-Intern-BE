import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * AiMentorConversation (Phase 6, spec 10) — the intern's own AI mentor
 * conversation. Ownership is enforced at the SERVICE layer by comparing
 * userId with the authenticated principal (no acting-userId is ever
 * accepted). Archiving is a LOGICAL status — rows are never hard-deleted
 * by product flows (spec 62).
 */
@Entity({ name: 'ai_mentor_conversations' })
@Index('IX_ai_mentor_conversations_user_lastMessageAt', ['userId', 'lastMessageAt'])
@Index('IX_ai_mentor_conversations_user_status', ['userId', 'status'])
export class AiMentorConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Owner — always the authenticated principal (spec 12). */
  @Column('uuid', { name: 'userId' })
  userId!: string;

  /** Optional human title; defaults from the first user message. */
  @Column({ type: 'nvarchar', length: 256, name: 'title', nullable: true })
  title!: string | null;

  /** active | archived — archived conversations reject new messages. */
  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'active' })
  status!: 'active' | 'archived';

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;

  @Column({ type: 'datetime2', name: 'lastMessageAt', nullable: true })
  lastMessageAt!: Date | null;
}
