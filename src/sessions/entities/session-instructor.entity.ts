import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Session↔instructor assignment (composite PK; FKs CASCADE).
 * Target users are validated against DB-resolved permissions — never
 * against a role value supplied by the client (spec 13).
 */
@Entity({ name: 'session_instructors' })
export class SessionInstructor {
  @PrimaryColumn('uuid', { name: 'sessionId' })
  sessionId!: string;

  @PrimaryColumn('uuid', { name: 'instructorId' })
  instructorId!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'assignedAt' })
  assignedAt!: Date;
}
