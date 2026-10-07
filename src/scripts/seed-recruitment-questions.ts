import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../database/entities';
import { ensureRecruitmentQuestions } from '../recruitment/question-seed';

/**
 * Idempotent recruitment question-bank seed CLI (Phase 4, spec 50).
 * Never seeds answers/results/profiles — the bank is product configuration.
 * Exit codes: 0 = ok, 1 = failure.
 */
async function main(): Promise<void> {
  const dbName = (process.env.DB_NAME ?? '').trim();
  if (!dbName) {
    console.error('[seed:recruitment] DB_NAME is required.');
    process.exit(1);
  }
  const ds = new DataSource({
    type: 'mssql',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    database: dbName,
    username: process.env.DB_USERNAME ?? 'vintern_app',
    password: process.env.DB_PASSWORD ?? '',
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
    },
    entities: ENTITIES,
    synchronize: false,
    logging: false,
  });
  try {
    await ds.initialize();
    const result = await ensureRecruitmentQuestions(ds);
    console.log(
      `[seed:recruitment] inserted=${result.inserted} totalPerRole=${JSON.stringify(result.totalPerRole)}`,
    );
    process.exit(0);
  } catch (err) {
    console.error(
      '[seed:recruitment] FAILED:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  } finally {
    await ds.destroy().catch(() => undefined);
  }
}

void main();
