import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Per-user notification preference (composite PK userId+category).
 * Missing row = enabled (default ON); the service resolves defaults.
 */
@Entity({ name: 'notification_preferences' })
export class NotificationPreference {
  @PrimaryColumn('uuid', { name: 'userId' })
  userId!: string;

  @PrimaryColumn({ type: 'nvarchar', length: 64, name: 'category' })
  category!: string;

  @Column({ type: 'bit', name: 'enabled', default: true })
  enabled!: boolean;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
