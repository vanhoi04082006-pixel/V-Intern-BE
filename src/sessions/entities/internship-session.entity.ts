import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Explicit session lifecycle — no arbitrary strings (DB CHECK mirrors this). */
export const SESSION_STATUSES = ['upcoming', 'active', 'ending', 'completed', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

@Entity({ name: 'internship_sessions' })
@Index('UX_internship_sessions_code', ['code'], { unique: true })
@Index('IX_internship_sessions_status', ['status'])
@Index('IX_internship_sessions_leadInstructorId', ['leadInstructorId'])
export class InternshipSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', name: 'description', nullable: true })
  description!: string | null;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'upcoming' })
  status!: SessionStatus;

  @Column({ type: 'uuid', name: 'leadInstructorId', nullable: true })
  leadInstructorId!: string | null;

  @Column({ type: 'datetime2', name: 'startDate' })
  startDate!: Date;

  @Column({ type: 'datetime2', name: 'endDate' })
  endDate!: Date;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
