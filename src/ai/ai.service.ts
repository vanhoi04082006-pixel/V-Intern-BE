import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AiRun } from './entities/ai-run.entity';
import {
  AiProvider,
  AiStructuredRequest,
  AiStructuredResult,
  AI_PROVIDER_TOKEN,
} from './ai-provider.interface';
import { AiProviderUnavailableError, aiErrorCode } from './ai-errors';
import { withBoundedRetries } from './ai-retry';
import { AiRuntimeService } from './ai-runtime.service';
import { GeminiProvider } from './providers/gemini.provider';

/**
 * AI CORE facade (Phase 4, spec 21/33/39) — the ONLY entry point domain
 * services use. Responsibilities:
 * 1. Resolve the configured provider (NULL token = honest
 *    AI_PROVIDER_UNAVAILABLE — production NEVER falls back to fake scores,
 *    spec 25).
 * 2. Persist an ai_runs provenance row BEFORE the call (running) and update
 *    it after (succeeded/failed + latency/tokens/errorCode — spec 33/70).
 * 3. Apply bounded retries for transient failures only (spec 28).
 *
 * Timeout lives INSIDE each provider attempt (AbortController — spec 27);
 * this service deliberately does not double-wrap.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiRun) private readonly runs: Repository<AiRun>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    // Provider may legitimately be NULL (AI unconfigured) — optional token.
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: AiProvider | null,
    private readonly runtime: AiRuntimeService,
  ) {}

  get isConfigured(): boolean {
    return this.provider !== null;
  }

  get providerName(): string | null {
    return this.provider?.name ?? null;
  }

  get modelName(): string | null {
    return this.provider?.model ?? null;
  }

  /**
   * Run a structured AI task with full provenance. Transactionally inserts
   * the run row, calls the provider (bounded retries), then finalizes the
   * run row. Throws the ORIGINAL error after recording the failure.
   */
  async generateStructuredWithRun<T>(params: {
    feature: string;
    userId: string | null;
    resourceType: string;
    resourceId: string;
    promptVersion: string;
    /** Agent runtimes may lower the configured retry cap; existing callers retain their policy. */
    maxRetries?: number;
    request: AiStructuredRequest<T>;
  }): Promise<{ data: T; run: AiRun; result: AiStructuredResult<T> }> {
    if (!this.provider) {
      throw new AiProviderUnavailableError();
    }
    const configured = this.provider instanceof GeminiProvider ? await this.runtime.effective() : null;
    const provider = configured && this.provider instanceof GeminiProvider ? this.provider.withRuntimeOptions(configured.policy) : this.provider;

    const startedAt = new Date();
    // Provenance row is written through a dedicated short transaction so a
    // provider outage still leaves an honest failed-run record (spec 39).
    const run = await this.dataSource.transaction(async (em) => {
      const row = em.create(AiRun, {
        feature: params.feature,
        provider: provider.name,
        model: provider.model,
        status: 'running',
        userId: params.userId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        promptVersion: params.promptVersion,
        startedAt,
      });
      return em.save(row);
    });

    try {
      const result = await withBoundedRetries(
        () => provider.generateStructured(params.request),
        { maxRetries: params.maxRetries === undefined ? (configured?.policy.maxRetries ?? this.config.get<number>('ai.maxRetries', 2))
          : Math.min(configured?.policy.maxRetries ?? this.config.get<number>('ai.maxRetries', 2), params.maxRetries) },
      );
      await this.runs.update(run.id, {
        status: 'succeeded',
        completedAt: new Date(),
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      const saved = await this.runs.findOneOrFail({ where: { id: run.id } });
      return { data: result.data, run: saved, result };
    } catch (err) {
      const code = aiErrorCode(err);
      await this.runs.update(run.id, {
        status: 'failed',
        completedAt: new Date(),
        latencyMs: Date.now() - startedAt.getTime(),
        errorCode: code,
      });
      this.logger.warn(
        `AI run ${run.id} failed: ${code} (${err instanceof Error ? err.message : String(err)})`,
      );
      throw err;
    }
  }
}
