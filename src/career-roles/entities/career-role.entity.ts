import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const CAREER_ROLE_STATUSES = ['draft', 'published', 'archived'] as const;
export type CareerRoleStatus = (typeof CAREER_ROLE_STATUSES)[number];

/** A career catalog entry, never an authorization/RBAC role. */
@Entity({ name: 'career_roles' })
export class CareerRole {
  @PrimaryColumn({ type: 'nvarchar', length: 32 })
  code!: string;

  @Column({ type: 'nvarchar', length: 128 })
  name!: string;

  @Column({ type: 'nvarchar', length: 2000, default: '' })
  description!: string;

  @Column({ type: 'nvarchar', length: 32, default: 'intern' })
  level!: string;

  @Column({ type: 'nvarchar', length: 16, default: 'vi' })
  language!: string;

  @Column({ type: 'nvarchar', length: 'max', default: '[]' })
  requiredSkillsJson!: string;

  @Column({ type: 'nvarchar', length: 'max', default: '[]' })
  optionalSkillsJson!: string;

  @Column({ type: 'nvarchar', length: 'max', default: '{}' })
  competencyWeightsJson!: string;

  @Column({ type: 'nvarchar', length: 16, default: 'draft' })
  status!: CareerRoleStatus;

  @Column({ type: 'bit', default: false })
  acceptingApplications!: boolean;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'datetime2' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  updatedAt!: Date;
}
