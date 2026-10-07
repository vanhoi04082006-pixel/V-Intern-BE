import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AiService } from '../ai.service';
import { aiErrorCode } from '../ai-errors';
import { AiMentorConversation } from './entities/ai-mentor-conversation.entity';
import { AiMentorMessage } from './entities/ai-mentor-message.entity';
import { AiMentorContextService } from './ai-mentor-context.service';
import {
  AI_MENTOR_PROMPT_VERSION,
  AI_MENTOR_TASK,
  buildMentorSystemPrompt,
  validateMentorAnswer,
} from './ai-mentor-prompt';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const notFound = (code: string, message: string) =>
  new NotFoundException({ statusCode: 404, code, message });
const conflict = (code: string, message: string) =>
  new ConflictException({ statusCode: 409, code, message });
const invalid = (code: string, message: string) =>
  new BadRequestException({ statusCode: 400, code, message });
const aiFailure = (code: string, message: string, details?: Record<string, unknown>) =>
  new ServiceUnavailableException({
    statusCode: 503,
    code,
    message,
    ...(details ? { details } : {}),
  });

const DEFAULT_HISTORY_WINDOW = 10;
const MAX_HISTORY_MESSAGES = 20;
const TITLE_MAX_CHARS = 120;

/**
 * AiMentorService (Phase 6, spec 10-15) — persisted contextual mentor
 * conversations for the AUTHENTICATED intern.
 *
 * AUTHORITY: advisory only (spec 19) — the mentor never mutates tasks,
 * evaluations, KPI, salary or certificates; no tool-calling exists here.
 *
 * FAILURE CONTRACT (spec 14/15/45): the user message is committed FIRST;
 * a provider failure leaves that row in place, records the failed AIRun,
 * and returns a controlled stable error — NO fake assistant message is
 * ever persisted and no canned advice is silently substituted. A retry
 * re-submits safely.
 *
 * OWNERSHIP (spec 12): every conversation access compares userId with the
 * authenticated principal; foreign conversations are 404-safe (never
 * reveal existence).
 */
@Injectable()
export class AiMentorService {
  private readonly logger = new Logger(AiMentorService.name);

  constructor(
    @InjectRepository(AiMentorConversation) private readonly conversations: Repository<AiMentorConversation>,
    @InjectRepository(AiMentorMessage) private readonly messages: Repository<AiMentorMessage>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contextService: AiMentorContextService,
    private readonly aiService: AiService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Own conversations, newest activity first (spec 12 — own only). */
  async listConversations(userId: string, q: { page: number; pageSize: number; status?: string }) {
    const qb = this.conversations
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .orderBy('c.lastMessageAt', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    if (q.status === 'active' || q.status === 'archived') {
      qb.andWhere('c.status = :status', { status: q.status });
    }
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((c) => this.toConversationDto(c)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async createConversation(userId: string, title: string | null, ctx: ActorContext) {
    const conversation = await this.conversations.save(
      this.conversations.create({
        userId,
        title: title ? title.trim().slice(0, TITLE_MAX_CHARS) : null,
        status: 'active',
      }),
    );
    await this.auditService.record({
      actorId: ctx.actorId ?? userId,
      action: 'ai_mentor.conversation_created',
      targetType: 'ai_mentor_conversation',
      targetId: conversation.id,
      detail: { conversationId: conversation.id },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return this.toConversationDto(conversation);
  }

  /**
   * Own conversation WITH messages (404-safe for foreign rows, spec 12).
   * Messages are ordered by createdAt (tiebreak id) — never by role.
   */
  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.conversations.findOne({
      where: { id: conversationId },
    });
    if (!conversation || conversation.userId !== userId) {
      throw notFound('AI_MENTOR_CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }
    const rows = await this.messages.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return {
      conversation: this.toConversationDto(conversation),
      messages: rows.map((m) => this.toMessageDto(m)),
    };
  }

  /**
   * The full message transaction (spec 14): persist user message → build
   * authorized context → AI run → validate → persist assistant message →
   * update lastMessageAt. Provider failure keeps the user message and
   * surfaces a controlled AI_* error (spec 15).
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
    // Phase 6 (spec 65/66): message sends are deliberately NOT audited and
    // produce NO activity/notification — the param stays for API symmetry.
    _ctx: ActorContext,
  ) {
    const maxChars = Math.max(
      1,
      Number(this.config.get<number>('ai.mentorMaxMessageChars', 8000)),
    );
    const text = typeof content === 'string' ? content.trim() : '';
    if (text.length === 0) {
      throw invalid('AI_MENTOR_MESSAGE_INVALID', 'Message must not be empty.');
    }
    if (text.length > maxChars) {
      throw invalid('AI_MENTOR_MESSAGE_TOO_LONG', `Message exceeds ${maxChars} characters.`);
    }

    // ── Step 1: claim the conversation (ownership + status under lock) ───
    const { conversation, userMessage } = await this.dataSource.transaction(async (em) => {
      const row = await em
        .getRepository(AiMentorConversation)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: conversationId })
        .getOne();
      if (!row || row.userId !== userId) {
        throw notFound('AI_MENTOR_CONVERSATION_NOT_FOUND', 'Conversation not found.');
      }
      if (row.status === 'archived') {
        throw conflict(
          'AI_MENTOR_CONVERSATION_ARCHIVED',
          'This conversation is archived — start a new conversation to continue.',
        );
      }
      const message = await em.save(
        em.create(AiMentorMessage, {
          conversationId: row.id,
          role: 'user' as const,
          content: text,
          aiRunId: null,
        }),
      );
      // First message names the conversation (stable, bounded).
      if (!row.title) {
        row.title = text.replace(/\s+/g, ' ').slice(0, TITLE_MAX_CHARS);
      }
      row.lastMessageAt = message.createdAt;
      row.updatedAt = new Date();
      await em.save(row);
      return { conversation: row, userMessage: message };
    });

    // ── Step 2: authorized context + bounded history (spec 7/8/57/58) ────
    const facts = await this.contextService.buildContext(userId);
    const history = await this.recentHistory(conversation.id);

    // ── Step 3: AI run + provider call (run row persisted inside) ────────
    let answer: { answer: string; summary: string; followUps: string[] };
    let runId: string;
    try {
      const result = await this.aiService.generateStructuredWithRun<{
        answer: string;
        summary: string;
        followUps: string[];
      }>({
        feature: AI_MENTOR_TASK,
        userId,
        resourceType: 'ai_mentor_conversation',
        resourceId: conversation.id,
        promptVersion: AI_MENTOR_PROMPT_VERSION,
        request: {
          task: AI_MENTOR_TASK,
          systemPrompt: buildMentorSystemPrompt(),
          input: {
            workspaceFacts: facts,
            conversationHistory: history,
            userMessage: text,
          },
          schemaName: 'AiMentorAnswer',
          validate: (raw) => validateMentorAnswer(raw, this.maxResponseChars()),
          modelOptions: { temperature: 0.4, maxOutputTokens: 4096 },
        },
      });
      answer = result.data;
      runId = result.run.id;
    } catch (err) {
      // spec 14/15: user message STAYS persisted; run row already records
      // the failure inside AiService; no assistant row is written.
      const code = aiErrorCode(err);
      this.logger.warn(
        `AI mentor run failed for conversation ${conversation.id}: ${code}`,
      );
      throw aiFailure(
        code,
        'The AI mentor is temporarily unavailable. Your message was saved — try again shortly.',
        err instanceof Error && 'reason' in err ? { reason: (err as { reason?: string }).reason } : undefined,
      );
    }

    // ── Step 4: persist the validated assistant message ──────────────────
    const saved = await this.dataSource.transaction(async (em) => {
      const assistant = await em.save(
        em.create(AiMentorMessage, {
          conversationId: conversation.id,
          role: 'assistant' as const,
          content: answer.answer,
          aiRunId: runId,
        }),
      );
      const row = await em.getRepository(AiMentorConversation).findOne({
        where: { id: conversation.id },
      });
      if (row && row.status === 'active') {
        row.lastMessageAt = assistant.createdAt;
        row.updatedAt = new Date();
        await em.save(row);
      }
      return assistant;
    });

    return {
      conversation: this.toConversationDto(conversation),
      userMessage: this.toMessageDto(userMessage),
      assistantMessage: this.toMessageDto(saved),
      summary: answer.summary,
      followUps: answer.followUps,
    };
  }

  /** Logical archive (spec 62) — idempotent, never a hard delete. */
  async archiveConversation(userId: string, conversationId: string, ctx: ActorContext) {
    const conversation = await this.dataSource.transaction(async (em) => {
      const row = await em
        .getRepository(AiMentorConversation)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: conversationId })
        .getOne();
      if (!row || row.userId !== userId) {
        throw notFound('AI_MENTOR_CONVERSATION_NOT_FOUND', 'Conversation not found.');
      }
      if (row.status === 'active') {
        row.status = 'archived';
        row.updatedAt = new Date();
        await em.save(row);
      }
      return row;
    });
    await this.auditService.record({
      actorId: ctx.actorId ?? userId,
      action: 'ai_mentor.conversation_archived',
      targetType: 'ai_mentor_conversation',
      targetId: conversation.id,
      detail: { conversationId: conversation.id },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return this.toConversationDto(conversation);
  }

  // ─────────────────────────── internals ───────────────────────────────

  /**
   * History window (spec 57/58): only the last N messages EVER reach the
   * provider; older rows stay persisted but are not sent. Bounded again by
   * MAX_HISTORY_MESSAGES regardless of configuration.
   */
  private async recentHistory(conversationId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const configured = Number(
      this.config.get<number>('ai.mentorHistoryWindow', DEFAULT_HISTORY_WINDOW),
    );
    const window = Math.max(1, Math.min(configured, MAX_HISTORY_MESSAGES));
    const rows = await this.messages
      .createQueryBuilder('m')
      .where('m.conversationId = :id', { id: conversationId })
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(window)
      .getMany();
    return rows
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));
  }

  private maxResponseChars(): number {
    return Math.max(
      1,
      Number(this.config.get<number>('ai.mentorMaxResponseChars', 8000)),
    );
  }

  private toConversationDto(c: AiMentorConversation) {
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessageAt: c.lastMessageAt,
    };
  }

  private toMessageDto(m: AiMentorMessage) {
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      aiRunId: m.aiRunId,
      createdAt: m.createdAt,
    };
  }
}
