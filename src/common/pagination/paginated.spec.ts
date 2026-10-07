import { toPaginated } from './paginated';

describe('toPaginated — single pagination contract', () => {
  it('basic math: page 2, pageSize 20, total 45 → totalPages 3', () => {
    const result = toPaginated(['a'], 2, 20, 45);
    expect(result).toEqual({
      data: ['a'],
      meta: { page: 2, pageSize: 20, total: 45, totalPages: 3 },
    });
  });

  it('empty result: total 0 → totalPages 0 (honest, not 1)', () => {
    expect(toPaginated([], 1, 20, 0).meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('exact division: total 40, pageSize 20 → 2 pages', () => {
    expect(toPaginated([], 2, 20, 40).meta.totalPages).toBe(2);
  });

  it('data passes through untouched', () => {
    const items = [{ id: 'x' }, { id: 'y' }];
    expect(toPaginated(items, 1, 2, 2).data).toBe(items);
  });
});
