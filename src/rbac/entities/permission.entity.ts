import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'permissions' })
@Index('UX_permissions_code', ['code'], { unique: true })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', length: 512, name: 'description', nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
