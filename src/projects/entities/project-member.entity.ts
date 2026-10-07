import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Project membership (composite PK; FKs CASCADE). Rows are ensured by the
 * assignment transaction (spec 17/20) — membership is assignment-driven.
 */
@Entity({ name: 'project_members' })
export class ProjectMember {
  @PrimaryColumn('uuid', { name: 'projectId' })
  projectId!: string;

  @PrimaryColumn('uuid', { name: 'userId' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'roleInProject', nullable: true })
  roleInProject!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'joinedAt' })
  joinedAt!: Date;
}
