import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * AiRecommendationSnapshot (Phase 6, spec 29-35) — a persisted
 * recommendation snapshot over DETERMINISTIC DB facts. `sourceHash` is the
 * sha256 of the canonical source-fact snapshot: refresh reuses the latest
 * snapshot while facts are unchanged (spec 35) and every snapshot stays
 * explainable from its own stored facts even after live data moves on
 * (spec 34). Provider evidence references are validated against the exact
 * metric codes supplied — unknown codes reject the whole output (spec 50).
 */
@Entity({ name: 'ai_recommendation_snapshots' })
@Index('IX_ai_recommendation_snapshots_user_createdAt', ['userId', 'createdAt'])
@Index('IX_ai_recommendation_snapshots_user_hash', ['userId', 'sourceHash', 'createdAt'])
export class AiRecommendationSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  /** AIRun provenance (plain column — survives user deactivation). */
  @Column('uuid', { name: 'aiRunId', nullable: true })
  aiRunId!: string | null;

  /** Logical scope, e.g. 'intern_own' (Phase 6 scope contract). */
  @Column({ type: 'nvarchar', length: 32, name: 'scope', default: 'intern_own' })
  scope!: string;

  /** Explicit prompt version, e.g. 'performance-recommendation-v1' (spec 51). */
  @Column({ type: 'nvarchar', length: 64, name: 'promptVersion' })
  promptVersion!: string;

  /** sha256 hex of the canonical source snapshot (spec 35). */
  @Column({ type: 'nvarchar', length: 64, name: 'sourceHash' })
  sourceHash!: string;

  /** The exact deterministic facts the model received (spec 34). */
  @Column({ type: 'nvarchar', name: 'sourceSnapshotJson' })
  sourceSnapshotJson!: string;

  /** Validated structured recommendations JSON (spec 29/31). */
  @Column({ type: 'nvarchar', name: 'recommendationsJson' })
  recommendationsJson!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
