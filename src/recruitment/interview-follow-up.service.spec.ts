import { DataSource } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { InterviewFollowUpService } from './interview-follow-up.service';

describe('adaptive interview follow-up', () => {
  function harness(status: string | null = null, owner = 'owner', count = 0) {
    let state = status;
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM interview_sessions WITH')) return params[1] === owner ? [{ status: 'in_progress', expiresAt: new Date(Date.now() + 100000) }] : [];
      if (sql.includes('COUNT(*)')) return [{ n: count }];
      if (sql.includes('SELECT TOP(1) q.id')) return [{ id: 'q1' }];
      if (sql.includes('SELECT t.*')) return [{ questionId: 'q1', prompt: 'Explain API validation', rubricSnapshot: '{}', followUpStatus: state, followUpStartedAt: new Date() }];
      if (sql.startsWith('UPDATE interview_conversation_turns')) state = params[2] as string;
      return [];
    });
    const db = { query, transaction: async (f: (em: unknown) => unknown) => f({ query }) };
    const ai = { generateStructuredWithRun: jest.fn().mockResolvedValue({ data: { needsFollowUp: true, message: 'Bạn có thể đưa ví dụ về kiểm tra quyền ở API vừa nêu không?' }, run: { id: 'ai1' } }) };
    const service = new InterviewFollowUpService(db as unknown as DataSource, ai as unknown as AiService);
    const view = { session: { questionCount: 10, roleCode: 'backend' }, questions: [{ id: 'q1', position: 3, category: 'technical', answered: true, prompt: 'Explain API validation', answerText: 'I check the user' }] };
    return { service, ai, query, view, state: () => state };
  }
  it('uses the actual prior answer, persists an adaptive question and waits for its answer', async () => {
    const h = harness();
    expect(await h.service.prepare('owner', 's1', h.view)).toBe(true);
    expect(h.state()).toBe('ready');
    expect(h.ai.generateStructuredWithRun.mock.calls[0][0].request.input.answer).toBe('I check the user');
  });
  it.each(['ready', 'generating'])('does not duplicate a %s follow-up', async status => {
    const h = harness(status);
    expect(await h.service.prepare('owner', 's1', h.view)).toBe(true);
    expect(h.ai.generateStructuredWithRun).not.toHaveBeenCalled();
  });
  it.each(['answered', 'skipped'])('continues after a %s follow-up', async status => {
    const h = harness(status);
    expect(await h.service.prepare('owner', 's1', h.view)).toBe(false);
    expect(h.ai.generateStructuredWithRun).not.toHaveBeenCalled();
  });
  it('caps supplementary questions at two and preserves legacy interviews', async () => {
    const h = harness(null, 'owner', 2);
    expect(await h.service.prepare('owner', 's1', h.view)).toBe(false);
    h.view.session.questionCount = 8;
    expect(await h.service.prepare('owner', 's1', h.view)).toBe(false);
    expect(h.ai.generateStructuredWithRun).not.toHaveBeenCalled();
  });
  it('does not call the provider for a different principal', async () => {
    const h = harness();
    await expect(h.service.prepare('foreign', 's1', h.view)).rejects.toThrow();
    expect(h.ai.generateStructuredWithRun).not.toHaveBeenCalled();
  });
});
