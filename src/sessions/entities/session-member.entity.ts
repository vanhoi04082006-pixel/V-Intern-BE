import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Session membership (composite PK; FKs CASCADE to internship_sessions/users). */
@Entity({ name: 'session_members' })
export class SessionMember {
  @PrimaryColumn('uuid', { name: 'sessionId' })
  sessionId!: string;

  @PrimaryColumn('uuid', { name: 'userId' })
  userId!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'joinedAt' })
  joinedAt!: Date;
}
