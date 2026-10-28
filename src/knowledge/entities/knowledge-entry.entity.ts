import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { KnowledgeStatus } from '../knowledge.contracts';

@Entity({ name: 'knowledge_entries' })
@Index('UQ_knowledge_entries_code', ['code'], { unique: true })
export class KnowledgeEntry {
  @PrimaryColumn({ type: 'uniqueidentifier' }) id!: string;
  @Column({ type: 'nvarchar', length: 80 }) code!: string;
  @Column({ type: 'int' }) version!: number;
  @Column({ type: 'nvarchar', length: 16 }) status!: KnowledgeStatus;
  @CreateDateColumn({ type: 'datetime2' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'datetime2' }) updatedAt!: Date;
}
