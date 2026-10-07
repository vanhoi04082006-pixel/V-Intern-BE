import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';

/**
 * REAL health check — a failed DB check yields an honest 503, never a
 * fake healthy status.
 * Phase 4 (spec 55): the AI section reports configured/unconfigured ONLY
 * (provider + model name, NEVER the API key). An unconfigured optional AI
 * provider never makes the whole backend unhealthy.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + SQL Server connectivity (public)' })
  async check() {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      const aiProvider = (this.config.get<string>('AI_PROVIDER') ?? '').trim();
      return {
        status: 'ok',
        checks: {
          backend: 'ok',
          database: 'ok',
          dbLatencyMs: Date.now() - startedAt,
          // spec 55: honest AI provider health (configured | unconfigured);
          // never exposes the API key; optional AI never fails the backend.
          ai: aiProvider ? 'configured' : 'unconfigured',
          aiProvider: aiProvider || null,
          aiModel: aiProvider ? (this.config.get<string>('AI_MODEL') ?? null) : null,
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
