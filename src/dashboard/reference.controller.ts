import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

/** Authenticated, read-only design fixtures. Never joins or writes operational business tables. */
@Controller('reference-screens')
@ApiTags('reference-screens')
@ApiBearerAuth()
export class ReferenceController {
  constructor(private readonly db: DataSource) {}
  @Get()
  @ApiOperation({ summary: 'List explicitly labelled image-reference sample screens' })
  async list() {
    return { source: 'user-approved-image-samples', items: await this.db.query('SELECT screenKey,title,role,sourceFile,updatedAt FROM reference_screens ORDER BY screenKey') };
  }
  @Get(':key')
  async get(@Param('key') key: string) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(key)) throw new NotFoundException('Reference screen not found.');
    const rows: { payload: string; sourceFile: string }[] = await this.db.query('SELECT payload,sourceFile FROM reference_screens WHERE screenKey=@0', [key]);
    if (!rows.length) throw new NotFoundException('Reference screen not found.');
    return { source: 'user-approved-image-samples', sourceFile: rows[0].sourceFile, screen: JSON.parse(rows[0].payload) as unknown };
  }
}
