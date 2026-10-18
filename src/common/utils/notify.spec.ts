import { EntityManager } from 'typeorm';
import { notifyInTransaction } from './notify';

it('honors SQL Server UUID preferences and deduplicates mixed-case recipients', async () => {
  const insert = jest.fn();
  const em = { insert, getRepository: () => ({ find: async () => [{ userId: 'ABCD', enabled: false }] }) } as unknown as EntityManager;
  expect(await notifyInTransaction(em, ['abcd', 'ABCD', 'efab', 'EFAB'], { category: 'task', type: 'task.reviewed', title: 'Reviewed' })).toBe(1);
  expect(insert.mock.calls[0][1]).toEqual([{ userId: 'efab', type: 'task.reviewed', title: 'Reviewed', body: null, linkUrl: null }]);
});
