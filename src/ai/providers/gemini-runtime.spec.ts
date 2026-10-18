import { GeminiProvider } from './gemini.provider';
import { AiFetchLike } from '../ai-provider.interface';
describe('Gemini runtime policy transport', () => {
  it('uses the selected model with the existing transport and preserves the original provider', async () => {
    const fetchImpl = jest.fn<ReturnType<AiFetchLike>, Parameters<AiFetchLike>>(async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }) }));
    const base = new GeminiProvider({ apiKey: 'test-only-credential', model: 'gemini-original', timeoutMs: 10000, fetchImpl });
    const configured = base.withRuntimeOptions({ model: 'gemini-selected', timeoutMs: 15000 });
    const response = await configured.generateStructured({ task: 'test-runtime', systemPrompt: 'Return an object', input: {}, schemaName: 'ok', validate: raw => raw });
    expect(response.data).toEqual({ ok: true });
    expect(fetchImpl.mock.calls[0][0]).toContain('/gemini-selected:generateContent');
    expect(configured.model).toBe('gemini-selected'); expect(base.model).toBe('gemini-original');
  });
});
