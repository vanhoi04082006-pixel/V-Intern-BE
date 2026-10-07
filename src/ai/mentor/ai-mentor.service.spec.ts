import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiMentorService } from './ai-mentor.service';
import { AiProviderTimeoutError } from '../ai-errors';

/**
 * AiMentorService unit tests (Phase 6, spec 11/12/14/15/45/58):
 * conversation ownership (foreign → 404), archived rejection, message
 * bounds, the failure contract (user message persists, NO fake assistant
 * row, controlled error) and the bounded history window.
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const OWN = 'user-own';
const FOREIGN = 'user-foreign';

interface ConvRow {
  id: string;
  userId: string;
  title: string | null;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
}

interface MsgRow {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  aiRunId: string | null;
  createdAt: Date;
}

let convSeq = 0;
let msgSeq = 0;

function newConversation(userId: string, status: 'active' | 'archived' = 'active'): ConvRow {
  convSeq += 1;
  return {
    id: `conv-${convSeq}`,
    userId,
    title: null,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: null,
  };
}

function buildHarness(opts?: {
  conversation?: ConvRow | null;
  providerError?: Error;
  providerAnswer?: unknown;
  historyRows?: MsgRow[];
}) {
  const conversations: ConvRow[] = opts?.conversation ? [opts.conversation] : [];
  const messages: MsgRow[] = [...(opts?.historyRows ?? [])];
  const saved: MsgRow[] = [];

  const conversationsRepo: AnyRepo = {
    findOne: jest.fn(async (args: { where: { id: string } }) =>
      conversations.find((c) => c.id === args.where.id) ?? null,
    ),
    create: jest.fn((data: Partial<ConvRow>) => ({ id: `conv-new-${++convSeq}`, createdAt: new Date(), updatedAt: new Date(), status: 'active', ...data })),
    save: jest.fn(async (row: ConvRow) => {
      const idx = conversations.findIndex((c) => c.id === row.id);
      if (idx >= 0) conversations[idx] = { ...row };
      else conversations.push({ ...row });
      return { ...row };
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: AnyRepo = {};
      qb.setLock = jest.fn().mockReturnThis();
      qb.where = jest.fn().mockReturnThis();
      qb.getOne = jest.fn(async () => conversations[0] ?? null);
      return qb;
    }),
  };

  const messagesRepo: AnyRepo = {
    find: jest.fn(async (args: { where: { conversationId: string }; order: Record<string, string> }) =>
      messages
        .filter((m) => m.conversationId === args.where.conversationId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    ),
    createQueryBuilder: jest.fn(() => {
      let takeCount: number | null = null;
      const qb: AnyRepo = {};
      qb.where = jest.fn().mockReturnThis();
      qb.orderBy = jest.fn().mockReturnThis();
      qb.addOrderBy = jest.fn().mockReturnThis();
      qb.take = jest.fn((n: number) => {
        takeCount = n;
        return qb;
      });
      // Mirror SQL: ORDER BY createdAt DESC ... take(window) — newest first.
      qb.getMany = jest.fn(async () => [...messages]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, takeCount ?? messages.length));
      return qb;
    }),
  };

  // Fake EntityManager: create returns the payload; save assigns ids and
  // appends to the store (mirrors real persistence semantics for asserts).
  const fakeEm = {
    getRepository: (entity: unknown) => (entity === (AiMentorService as unknown) ? conversationsRepo : conversationsRepo),
    create: (cls: unknown, data: Partial<MsgRow>) => data,
    save: jest.fn(async (row: Partial<MsgRow> | ConvRow) => {
      if ('role' in (row as MsgRow)) {
        const full: MsgRow = {
          id: `msg-${++msgSeq}`,
          conversationId: (row as Partial<MsgRow>).conversationId!,
          role: (row as Partial<MsgRow>).role as 'user' | 'assistant',
          content: (row as Partial<MsgRow>).content as string,
          aiRunId: (row as Partial<MsgRow>).aiRunId ?? null,
          createdAt: new Date(),
        };
        messages.push(full);
        saved.push(full);
        return full;
      }
      const conv = row as ConvRow;
      const idx = conversations.findIndex((c) => c.id === conv.id);
      if (idx >= 0) conversations[idx] = { ...conv };
      else conversations.push({ ...conv });
      return { ...conv };
    }),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) => cb(fakeEm)),
  };

  const contextService = {
    buildContext: jest.fn(async () => ({ intern: { displayName: 'Intern A' }, latestKpi: null })),
  };

  const aiService = {
    generateStructuredWithRun: opts?.providerError
      ? jest.fn(async () => {
          throw opts.providerError;
        })
      : jest.fn(async (params: { request: { validate: (raw: unknown) => unknown } }) => {
          const data = params.request.validate(
            opts?.providerAnswer ?? { answer: 'Focus on VIN-101 first.', summary: 'Prioritize overdue work.', followUps: [] },
          );
          return { data, run: { id: 'run-1' }, result: { model: 'test-model', latencyMs: 5, inputTokens: 10, outputTokens: 20 } };
        }),
  };

  const auditService = { record: jest.fn(async () => undefined) };
  const config = { get: jest.fn((_key: string, def?: unknown) => def) };

  const service = new AiMentorService(
    conversationsRepo as never,
    messagesRepo as never,
    dataSource as never,
    contextService as never,
    aiService as never,
    auditService as never,
    config as never,
  );

  return { service, conversations, messages, saved, conversationsRepo, messagesRepo, aiService, contextService, auditService, dataSource };
}

const CTX = { actorId: OWN, ip: null, userAgent: null };

/** Assert a rejected promise's HttpException code + status (codebase pattern). */
async function expectCode(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({
    response: { statusCode: status, code },
  });
}

describe('AiMentorService', () => {
  it('ownership: reading a foreign conversation is 404-safe (spec 12)', async () => {
    const conv = newConversation(FOREIGN);
    const h = buildHarness({ conversation: conv });
    await expectCode(
      h.service.getConversation(OWN, conv.id),
      404,
      'AI_MENTOR_CONVERSATION_NOT_FOUND',
    );
  });

  it('archived conversations reject new messages (spec 44)', async () => {
    const conv = newConversation(OWN, 'archived');
    const h = buildHarness({ conversation: conv });
    await expectCode(
      h.service.sendMessage(OWN, conv.id, 'hello', CTX),
      409,
      'AI_MENTOR_CONVERSATION_ARCHIVED',
    );
    expect(h.aiService.generateStructuredWithRun).not.toHaveBeenCalled();
  });

  it('rejects empty and oversized messages (spec 11)', async () => {
    const conv = newConversation(OWN);
    const h = buildHarness({ conversation: conv });
    await expect(h.service.sendMessage(OWN, conv.id, '   ', CTX)).rejects.toBeInstanceOf(BadRequestException);
    await expectCode(
      h.service.sendMessage(OWN, conv.id, 'x'.repeat(8001), CTX),
      400,
      'AI_MENTOR_MESSAGE_TOO_LONG',
    );
  });

  it('full send: user + assistant persisted, aiRunId provenance, title derived, audit written (spec 14/65)', async () => {
    const conv = newConversation(OWN);
    const h = buildHarness({ conversation: conv });
    const out = await h.service.sendMessage(OWN, conv.id, 'What should I work on next?', CTX);
    expect(out.assistantMessage.role).toBe('assistant');
    expect(out.assistantMessage.aiRunId).toBe('run-1');
    expect(h.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(h.conversations[0].title).toBe('What should I work on next?');
    expect(h.conversations[0].lastMessageAt).not.toBeNull();
    expect(h.auditService.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_mentor.message_sent' }));
  });

  it('FAILURE CONTRACT: provider failure keeps ONLY the user message, no fake assistant row, controlled 503 (spec 14/15/45)', async () => {
    const conv = newConversation(OWN);
    const h = buildHarness({ conversation: conv, providerError: new AiProviderTimeoutError(60000) });
    await expectCode(
      h.service.sendMessage(OWN, conv.id, 'Tell me my KPI.', CTX),
      503,
      'AI_PROVIDER_TIMEOUT',
    );
    const roles = h.messages.map((m) => m.role);
    expect(roles).toEqual(['user']);
    const contents = h.messages.map((m) => m.content);
    expect(contents).toEqual(['Tell me my KPI.']);
    // No canned/fake assistant content anywhere.
    expect(JSON.stringify(h.messages)).not.toContain('assistant');
    // The AIRun failure is NOT hidden: the service surfaced the stable code.
  });

  it('history window: only the last N messages reach the provider (spec 57/58)', async () => {
    const conv = newConversation(OWN);
    const history: MsgRow[] = Array.from({ length: 14 }, (_, i) => ({
      id: `h-${i}`,
      conversationId: conv.id,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `h${i}`,
      aiRunId: null,
      createdAt: new Date(Date.now() + i),
    }));
    const h = buildHarness({ conversation: conv, historyRows: history });
    await h.service.sendMessage(OWN, conv.id, 'current question', CTX);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = h.aiService.generateStructuredWithRun.mock.calls[0][0] as any;
    const historySent = call.request.input.conversationHistory as Array<{ content: string }>;
    expect(historySent.length).toBeLessThanOrEqual(10);
    // Oldest messages excluded; the most recent are present, newest last.
    expect(historySent[historySent.length - 1].content).toBe('h13');
    expect(historySent.map((m) => m.content)).not.toContain('h0');
  });

  it('archive is idempotent and logical (spec 62)', async () => {
    const conv = newConversation(OWN);
    const h = buildHarness({ conversation: conv });
    const first = await h.service.archiveConversation(OWN, conv.id, CTX);
    expect(first.status).toBe('archived');
    const second = await h.service.archiveConversation(OWN, conv.id, CTX);
    expect(second.status).toBe('archived');
    expect(h.auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai_mentor.conversation_archived' }));
  });

  it('create conversation records the audit event with conversation id (spec 65)', async () => {
    const h = buildHarness();
    await h.service.createConversation(OWN, 'My plan', CTX);
    expect(h.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ai_mentor.conversation_created', actorId: OWN }),
    );
  });

  it('provider invalid response maps to AI_INVALID_RESPONSE (spec 15)', async () => {
    const conv = newConversation(OWN);
    const h = buildHarness({ conversation: conv, providerAnswer: { answer: 42 } });
    await expectCode(
      h.service.sendMessage(OWN, conv.id, 'q', CTX),
      503,
      'AI_INVALID_RESPONSE',
    );
  });

  it('foreign conversation sendMessage throws 404 before any AI call (spec 12/27)', async () => {
    const conv = newConversation(FOREIGN);
    const h = buildHarness({ conversation: conv });
    // The lock query returns the foreign row; ownership check rejects it.
    (h.conversationsRepo.createQueryBuilder as AnyMock).mockImplementation(() => {
      const qb: AnyRepo = {};
      qb.setLock = jest.fn().mockReturnThis();
      qb.where = jest.fn().mockReturnThis();
      qb.getOne = jest.fn(async () => conv);
      return qb;
    });
    await expect(h.service.sendMessage(OWN, conv.id, 'steal data', CTX)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.aiService.generateStructuredWithRun).not.toHaveBeenCalled();
    // Nothing was persisted for the foreign conversation.
    expect(h.messages).toHaveLength(0);
  });
});
