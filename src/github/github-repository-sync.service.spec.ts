import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { GithubRepositoriesService } from './github-repositories.service';
import { GithubRepositorySyncService } from './github-repository-sync.service';

describe('automatic repository synchronization', () => {
  it('processes a bounded session batch and continues after one failure', async () => {
    const query = jest.fn(async (_sql: string) => [{ id: 's1', leadInstructorId: 't1' }, { id: 's2', leadInstructorId: 't2' }]);
    const provision = jest.fn().mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValueOnce({});
    const sync = new GithubRepositorySyncService({ query } as unknown as DataSource, { provision } as unknown as GithubRepositoriesService, new ConfigService({ NODE_ENV: 'test' }));
    await sync.tick();
    expect(query.mock.calls[0][0]).toContain('TOP(3)');
    expect(provision.mock.calls).toEqual([['s1', 't1'], ['s2', 't2']]);
  });
});
