import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * AiMentorMessage (Phase 6, spec 10/53) — one bounded chat row.
 * Only 'user' and 'assistant' roles are persisted: the hidden system
 * prompt and the authorized context payload are NEVER stored as chat
 * messages (spec 10). `aiRunId` links an assistant row to its AIRun
 * provenance (plain column, no FK — provenance survives retention).
 */
@Entity({ name: 'ai_mentor_messages' })
@Index('IX_ai_mentor_messages_conversation_createdAt', ['conversationId', 'createdAt'])
@Index('IX_ai_mentor_messages_aiRunId', ['aiRunId'])
export class AiMentorMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'conversationId' })
  conversationId!: string;

  /** 'user' | 'assistant' — DB CHECK bounded (spec 10). */
  @Column({ type: 'nvarchar', length: 16, name: 'role' })
  role!: 'user' | 'assistant';

  /** Bounded at the service layer (1..8000 chars user, ≤ 8000 assistant). */
  @Column({ type: 'nvarchar', name: 'content' })
  content!: string;

  /** AIRun provenance for assistant rows (null for user rows). */
  @Column('uuid', { name: 'aiRunId', nullable: true })
  aiRunId!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
