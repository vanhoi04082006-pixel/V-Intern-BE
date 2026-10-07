import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'notifications' })
@Index('IX_notifications_userId_readAt', ['userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'type' })
  type!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'title' })
  title!: string;

  @Column({ type: 'nvarchar', length: 'max', name: 'body', nullable: true })
  body!: string | null;

  @Column({ type: 'nvarchar', length: 512, name: 'linkUrl', nullable: true })
  linkUrl!: string | null;

  @Column({ type: 'datetime2', name: 'readAt', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
