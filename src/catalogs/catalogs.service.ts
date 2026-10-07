import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/db-errors';
import { ActorContext } from '../users/users.service';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogType } from './entities/catalog-type.entity';

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(CatalogType) private readonly types: Repository<CatalogType>,
    @InjectRepository(CatalogItem) private readonly items: Repository<CatalogItem>,
    private readonly audit: AuditService,
  ) {}

  async listTypes(q: { page: number; pageSize: number }) {
    const [items, total] = await this.types
      .createQueryBuilder('t')
      .orderBy('t.code', 'ASC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize)
      .getManyAndCount();
    return { items, total };
  }

  async listItems(typeCode: string, q: { page: number; pageSize: number; includeInactive?: boolean }) {
    const type = await this.types.findOne({ where: { code: typeCode } });
    if (!type) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'CATALOG_TYPE_NOT_FOUND',
        message: `Catalog type '${typeCode}' not found.`,
      });
    }
    const qb = this.items
      .createQueryBuilder('i')
      .where('i.typeId = :typeId', { typeId: type.id });
    if (!q.includeInactive) qb.andWhere('i.isActive = 1');
    qb.orderBy('i.sortOrder', 'ASC')
      .addOrderBy('i.name', 'ASC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, type };
  }

  async createType(input: { code: string; name: string; description?: string }, ctx: ActorContext) {
    const existing = await this.types.findOne({ where: { code: input.code } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CATALOG_TYPE_TAKEN',
        message: 'Catalog type code is already taken.',
      });
    }
    let type: CatalogType;
    try {
      type = await this.types.save(
        this.types.create({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'CATALOG_TYPE_TAKEN',
          message: 'Catalog type code is already taken.',
        });
      }
      throw err;
    }
    await this.audit.record({ ...ctx, action: 'catalog.type_created', targetType: 'catalog_type', targetId: type.id, detail: { code: type.code } });
    return type;
  }

  async createItem(input: { typeCode: string; code: string; name: string; value?: string; sortOrder?: number }, ctx: ActorContext) {
    const type = await this.types.findOne({ where: { code: input.typeCode } });
    if (!type) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'CATALOG_TYPE_NOT_FOUND',
        message: `Catalog type '${input.typeCode}' not found.`,
      });
    }
    let item: CatalogItem;
    try {
      item = await this.items.save(
        this.items.create({
          typeId: type.id,
          code: input.code,
          name: input.name,
          value: input.value ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'CATALOG_ITEM_TAKEN',
          message: 'Item code already exists in this type.',
        });
      }
      throw err;
    }
    await this.audit.record({ ...ctx, action: 'catalog.item_created', targetType: 'catalog_item', targetId: item.id, detail: { typeCode: type.code, code: item.code } });
    return item;
  }

  async updateItem(id: string, input: { name?: string; value?: string | null; sortOrder?: number; isActive?: boolean }, ctx: ActorContext) {
    const item = await this.items.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'CATALOG_ITEM_NOT_FOUND',
        message: 'Catalog item not found.',
      });
    }
    const patch: Partial<CatalogItem> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.value !== undefined) patch.value = input.value;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (Object.keys(patch).length > 0) {
      await this.items.update(id, patch);
      await this.audit.record({ ...ctx, action: 'catalog.item_updated', targetType: 'catalog_item', targetId: id, detail: patch });
    }
    return this.items.findOneOrFail({ where: { id } });
  }

  async itemsByIds(ids: string[]): Promise<CatalogItem[]> {
    if (ids.length === 0) return [];
    return this.items.find({ where: { id: In(ids) } });
  }
}
