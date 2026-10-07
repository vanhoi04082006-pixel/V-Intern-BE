import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';

/**
 * REAL health check — a failed DB check yields an honest 503, never a
 * fake healthy status. AI provider health arrives with the AI milestone.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + SQL Server connectivity (public)' })
  async check() {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        checks: {
          backend: 'ok',
          database: 'ok',
          dbLatencyMs: Date.now() - startedAt,
        },
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'HEALTH_DB_UNAVAILABLE',
        message: 'Database check failed.',
        details: { backend: 'ok', database: 'error' },
      });
    }
  }
}
