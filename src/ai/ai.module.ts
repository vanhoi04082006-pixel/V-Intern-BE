import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiRun } from './entities/ai-run.entity';
import { AiService } from './ai.service';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { RbacModule } from '../rbac/rbac.module';
import { AiRuntimeService } from './ai-runtime.service';
import { AiRuntimeController } from './ai-runtime.controller';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AgentPersistenceModule } from '../agents/persistence.module';
import { BusinessAgentEngine } from '../agents/runtime/business-agent-engine';
import { BusinessAgentScope } from '../agents/runtime/business-agent-scope.service';

/**
 * AI CORE module (Phase 4, spec 21/23/25).
 *
 * Provider resolution (spec 23/26):
 * - AI_PROVIDER unset           → NULL provider: every AI call fails
 *   honestly with AI_PROVIDER_UNAVAILABLE. NO fake fallback (spec 25).
 * - AI_PROVIDER=gemini          → real GeminiProvider (AI_API_KEY/AI_MODEL
 *   required — missing key fails FAST at boot, never mid-interview).
 * - any other code              → boot failure (typo-safe configuration).
 *
 * Tests override the AI_PROVIDER_TOKEN with a deterministic TestAIProvider
 * (spec 24/25/60); nothing here ever falls back to it at runtime.
 */
function resolveProvider(cs: ConfigService): AiProvider | null {
  const code = (cs.get<string>('AI_PROVIDER') ?? '').trim().toLowerCase();
  if (!code) return null;
  if (code === 'gemini') {
    const apiKey = cs.get<string>('AI_API_KEY') ?? '';
    const model = cs.get<string>('AI_MODEL') ?? '';
    if (!apiKey || !model) {
      throw new Error(
        'CONFIG ERROR: AI_PROVIDER=gemini requires AI_API_KEY and AI_MODEL. ' +
          'Refusing to boot with a half-configured AI provider.',
      );
    }
    return new GeminiProvider({
      apiKey,
      model,
      timeoutMs: Number(cs.get<string>('AI_TIMEOUT_MS', '60000')),
    });
  }
  throw new Error(
    `CONFIG ERROR: unsupported AI_PROVIDER '${code}'. Supported: gemini (or unset = disabled).`,
  );
}

const AiProviderTokenProvider: Provider = {
  provide: AI_PROVIDER_TOKEN,
  inject: [ConfigService],
  useFactory: resolveProvider,
};

@Module({
  imports: [RbacModule, KnowledgeModule, AgentPersistenceModule, TypeOrmModule.forFeature([AiRun])],
  controllers: [AiRuntimeController],
  providers: [AiRuntimeService, AiProviderTokenProvider, BusinessAgentScope, BusinessAgentEngine, AiService],
  exports: [AiService],
})
export class AiModule {}
