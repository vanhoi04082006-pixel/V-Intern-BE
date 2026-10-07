import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Key/value application settings. `settingKey` avoids T-SQL reserved word `key`. */
@Entity({ name: 'system_settings' })
export class SystemSetting {
  @PrimaryColumn({ type: 'nvarchar', length: 128, name: 'settingKey' })
  settingKey!: string;

  @Column({ type: 'nvarchar', length: 'max', name: 'value' })
  value!: string;

  @Column({ type: 'nvarchar', length: 512, name: 'description', nullable: true })
  description!: string | null;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
