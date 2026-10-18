import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { LearningAlertsService } from './learning-alerts.service';

describe('learning alert worker lifecycle', () => {
  function worker(settings: Record<string, unknown> = {}) {
    const query = jest.fn().mockResolvedValue([]);
    const service = new LearningAlertsService({ query } as unknown as DataSource, new ConfigService(settings));
    return { service, query };
  }
  it.each([{ NODE_ENV: 'test' }, { LEARNING_ALERTS_ENABLED: 'false' }])('does not start a disabled worker: %o', settings => {
    const { service, query } = worker(settings); service.onApplicationBootstrap();
    expect(service.status().enabled).toBe(false); expect(query).not.toHaveBeenCalled(); service.onModuleDestroy();
  });
  it.each([[1, 30], [99999, 3600], ['invalid', 60]])('bounds interval %s to %s seconds', (value, expected) => {
    expect(worker({ LEARNING_ALERTS_INTERVAL_SECONDS: value }).service.status().intervalSeconds).toBe(expected);
  });
  it('skips an overlapping scan and records only safe outcome/error metadata', async () => {
    const { service, query } = worker(); let release!: (value: unknown[]) => void;
    query.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = service.scan(); expect(service.status().running).toBe(true);
    expect(await service.scan()).toMatchObject({ busy: true, processed: 0 }); expect(query).toHaveBeenCalledTimes(1);
    release([]); await pending;
    expect(service.status()).toMatchObject({ running: false, lastErrorCode: null, lastResult: { processed: 0 } });
    query.mockRejectedValueOnce(new Error('private database connection detail'));
    await expect(service.scan()).rejects.toThrow('private database');
    expect(service.status().lastErrorCode).toBe('LEARNING_ALERT_SCAN_FAILED');
    expect(JSON.stringify(service.status())).not.toContain('private database');
    await service.scan(); expect(service.status().lastErrorCode).toBeNull();
  });
});
