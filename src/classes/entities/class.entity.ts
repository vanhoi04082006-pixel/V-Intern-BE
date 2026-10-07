import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Class lifecycle — Phase 2 treats status as a validated enum without a
 * transition machine (the machine is specified for internship sessions);
 * documented decision, DB CHECK mirrors the enum.
 */
export const CLASS_STATUSES = ['upcoming', 'active', 'completed', 'cancelled'] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

@Entity({ name: 'classes' })
@Index('UX_classes_code', ['code'], { unique: true })
@Index('IX_classes_status', ['status'])
@Index('IX_classes_leadInstructorId', ['leadInstructorId'])
@Index('IX_classes_sessionId', ['sessionId'])
export class AcademicClass {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', name: 'description', nullable: true })
  description!: string | null;

  @Column({ type: 'uuid', name: 'leadInstructorId', nullable: true })
  leadInstructorId!: string | null;

  @Column({ type: 'uuid', name: 'sessionId', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'upcoming' })
  status!: ClassStatus;

  @Column({ type: 'datetime2', name: 'startDate', nullable: true })
  startDate!: Date | null;

  @Column({ type: 'datetime2', name: 'endDate', nullable: true })
  endDate!: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
