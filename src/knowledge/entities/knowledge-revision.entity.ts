import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Insert-only snapshots. SQL also rejects UPDATE/DELETE; publication creates another revision. */
@Entity({ name: 'knowledge_revisions' })
export class KnowledgeRevision {
  @PrimaryColumn({ type: 'uniqueidentifier' }) entryId!: string;
  @PrimaryColumn({ type: 'int' }) version!: number;
  @Column({ type: 'nvarchar', length: 'max' }) snapshotJson!: string;
  @Column({ type: 'varchar', length: 64 }) sha256!: string;
  @Column({ type: 'uniqueidentifier' }) createdBy!: string;
  @CreateDateColumn({ type: 'datetime2' }) createdAt!: Date;
}
