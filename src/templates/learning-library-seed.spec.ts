import { DataSource } from 'typeorm';
import { ensureLearningLibrary } from './learning-library-seed';
import { LEARNING_LIBRARY, LEGACY_LEARNING_LIBRARY } from './learning-library';
describe('preserving library seed', () => {
  it('upgrades only untouched bundled content and preserves edits, archives and later versions on retry', async () => {
    const rows = new Map(LEGACY_LEARNING_LIBRARY.map((definition, index) => [definition.code, { id: String(index), version: 1, status: 'active', definitionJson: JSON.stringify(definition) }]));
    rows.get(LEGACY_LEARNING_LIBRARY[1].code)!.definitionJson = JSON.stringify({ ...LEGACY_LEARNING_LIBRARY[1], name: 'Instructor custom content' });
    rows.get(LEGACY_LEARNING_LIBRARY[2].code)!.status = 'archived';
    const query = jest.fn(async (sql: string, args: unknown[]) => {
      if (sql.startsWith('SELECT')) return rows.has(args[0] as string) ? [rows.get(args[0] as string)] : [];
      if (sql.startsWith('INSERT')) rows.set(args[1] as string, { id: args[0] as string, version: 1, status: 'active', definitionJson: args[5] as string });
      if (sql.startsWith('UPDATE')) { const row = [...rows.values()].find(r => r.id === args[0])!; row.definitionJson = args[1] as string; row.version++; }
      return [];
    });
    const db = { transaction: async (work: (em: { query: typeof query }) => Promise<unknown>) => work({ query }) } as unknown as DataSource;
    expect(await ensureLearningLibrary(db, 'admin')).toEqual({ upgraded: 1, inserted: 3, preserved: 2 });
    expect(await ensureLearningLibrary(db, 'admin')).toEqual({ upgraded: 0, inserted: 0, preserved: 6 });
    expect(JSON.parse(rows.get(LEARNING_LIBRARY[1].code)!.definitionJson).name).toBe('Instructor custom content');
    expect(query.mock.calls.every(([sql]) => !sql.includes('template_runs'))).toBe(true);
  });
});
