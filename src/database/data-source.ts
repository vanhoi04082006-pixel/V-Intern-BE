import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { InitPlatformCore1759872000000 } from './migrations/1759872000000-InitPlatformCore';

/**
 * Standalone DataSource for the TypeORM CLI (migrations ONLY).
 * The Nest app builds its own pool in AppModule with identical options.
 * synchronize is ALWAYS false — schema changes go exclusively through
 * versioned migrations (production-safe, reviewable, revertible).
 */
export default new DataSource({
  type: 'mssql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 1433),
  database: process.env.DB_NAME ?? 'VIntern',
  username: process.env.DB_USERNAME ?? 'vintern_app',
  password: process.env.DB_PASSWORD ?? '',
  options: {
    encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false',
    trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
  },
  synchronize: false,
  logging: false,
  entities: ENTITIES,
  migrations: [InitPlatformCore1759872000000],
});
