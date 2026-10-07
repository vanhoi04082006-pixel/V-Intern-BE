import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'catalog_items' })
@Index('UX_catalog_items_type_code', ['typeId', 'code'], { unique: true })
export class CatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'typeId' })
  typeId!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', length: 1024, name: 'value', nullable: true })
  value!: string | null;

  @Column({ type: 'int', name: 'sortOrder', default: 0 })
  sortOrder!: number;

  @Column({ type: 'bit', name: 'isActive', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
