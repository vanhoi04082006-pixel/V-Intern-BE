import { VirtualSalaryService } from './virtual-salary.service';
import { KpiPeriod } from '../kpi/entities/kpi-period.entity';
import { KpiResult } from '../kpi/entities/kpi-result.entity';
import { VirtualSalaryLedger } from './entities/virtual-salary-ledger.entity';

describe('Virtual salary generation zero earning', () => {
  it('skips a calculated zero instead of violating the nonzero ledger CHECK', async () => {
    const insert = jest.fn();
    const em = { getRepository: jest.fn(() => ({ findOne: jest.fn(async () => null), find: jest.fn(async () => []) })), insert };
    const ds = {
      getRepository: (entity: unknown) => entity === KpiPeriod ? { findOne: async () => ({ status: 'finalized', code: 'P1', ruleVersion: 'kpi-v1' }) } : entity === KpiResult ? { find: async () => [{ id: 'r0', userId: 'u0', finalScore: 0, ruleVersion: 'kpi-v1' }] } : null,
      transaction: async (work: (manager: typeof em) => Promise<unknown>) => work(em),
    };
    const settings = { get: async (key: string) => key.endsWith('base_amount') ? '10000000' : 'VND_VIRTUAL' };
    const service = new VirtualSalaryService({} as never, settings as never, ds as never);
    await expect(service.generateForPeriod('p1', 'admin', {})).resolves.toEqual({ kpiPeriodId: 'p1', generated: 0, skipped: 1, unit: 'VND_VIRTUAL' });
    expect(insert).not.toHaveBeenCalledWith(VirtualSalaryLedger, expect.anything());
    expect(insert).not.toHaveBeenCalled();
  });
});

