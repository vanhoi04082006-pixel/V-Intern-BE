import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * PHASE 3.5 (spec 10) — create the DISPOSABLE E2E database + app login.
 *
 * SAFETY CONTRACT:
 * - Connects ONLY to `master` (plus the freshly-validated E2E database for
 *   the user mapping step — both connections use the ADMIN credentials).
 * - Validates the requested database name: it MUST clearly indicate a
 *   disposable test/e2e environment (must contain E2E, TEST or CI).
 *   Production-like names are REJECTED before any connection is made.
 * - Identifiers are bracket-quoted with `]` escaping (defense in depth).
 * - Values go through parameterized queries wherever T-SQL allows it.
 * - Never logs passwords — secrets stay inside the process env.
 * - Exit codes: 0 = ready, 1 = failure, 2 = invalid input.
 */

const ALLOWED_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,63}$/;
const TEST_TOKEN = /(E2E|TEST|CI)/i;
const FORBIDDEN_TOKEN = /(PROD|MASTER|TEMPDB|MODEL|MSDB|LIVE)/i;

function fail(message: string, exitCode: number): never {
  console.error(`[create-e2e-database] ${message}`);
  process.exit(exitCode);
}

/** Database names must CLEARLY mark a disposable test/e2e environment. */
function validateDatabaseName(name: string): string {
  if (
    !ALLOWED_NAME_PATTERN.test(name) ||
    !TEST_TOKEN.test(name) ||
    FORBIDDEN_TOKEN.test(name)
  ) {
    fail(
      `Refusing unsafe database name. The name must be alphanumeric/underscore, ` +
        `contain an E2E/TEST/CI token, and never look production-like.`,
      2,
    );
  }
  return `[${name.replace(/]/g, ']]')}]`;
}

/** Login/user identifiers: safe charset + bracket quoting (no E2E token needed). */
function quoteIdentifier(name: string): string {
  if (!ALLOWED_NAME_PATTERN.test(name) || FORBIDDEN_TOKEN.test(name)) {
    fail(`Refusing unsafe login/user identifier.`, 2);
  }
  return `[${name.replace(/]/g, ']]')}]`;
}

async function main(): Promise<void> {
  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = Number(process.env.DB_PORT ?? 1433);
  const dbName = (process.env.E2E_DB_NAME ?? '').trim();
  if (!dbName) fail('E2E_DB_NAME is required (a disposable test/e2e database name).', 2);

  const adminUser = (process.env.DB_ADMIN_USERNAME ?? process.env.DB_USERNAME ?? '').trim();
  const adminPass = process.env.DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD ?? '';
  const appUser = (process.env.DB_USERNAME ?? '').trim();
  const appPass = process.env.DB_PASSWORD ?? '';

  if (!adminUser || !adminPass) fail('DB_ADMIN_USERNAME/DB_ADMIN_PASSWORD (or app credentials) are required.', 2);
  if (!appUser || !appPass) fail('DB_USERNAME/DB_PASSWORD are required (the app login to provision).', 2);

  const quotedDb = validateDatabaseName(dbName);
  const encrypt = (process.env.DB_ENCRYPT ?? 'false') !== 'false';
  const dbNameSqlLiteral = `N'${dbName.replace(/'/g, "''")}'`;

  const master = new DataSource({
    type: 'mssql',
    host,
    port,
    database: 'master',
    username: adminUser,
    password: adminPass,
    options: { encrypt, trustServerCertificate: true },
    logging: false,
  });

  let inDb: DataSource | null = null;
  try {
    await master.initialize();

    // 1) Create the database when missing. NEVER drop — the disposable
    //    lifetime of the database is owned by the CI environment.
    await master.query(`IF DB_ID(${dbNameSqlLiteral}) IS NULL CREATE DATABASE ${quotedDb};`);
    console.log(`[create-e2e-database] database ready: ${dbName}`);

    // 2) Provision the app login/user (skipped when the app IS the admin, e.g. sa).
    if (appUser.toLowerCase() !== adminUser.toLowerCase()) {
      const loginRows = (await master.query(`SELECT 1 AS one FROM sys.sql_logins WHERE name = @0;`, [
        appUser,
      ])) as Array<{ one: number }>;
      if (loginRows.length === 0) {
        await master.query(
          `CREATE LOGIN ${quoteIdentifier(appUser)} WITH PASSWORD = @0;`,
          [appPass],
        );
        console.log('[create-e2e-database] app login created (password never logged).');
      } else {
        console.log('[create-e2e-database] app login already exists (left untouched).');
      }

      inDb = new DataSource({
        type: 'mssql',
        host,
        port,
        database: dbName,
        username: adminUser,
        password: adminPass,
        options: { encrypt, trustServerCertificate: true },
        logging: false,
      });
      await inDb.initialize();
      await inDb.query(
        `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @0 AND type = 'S')
         BEGIN
           CREATE USER ${quoteIdentifier(appUser)} FOR LOGIN ${quoteIdentifier(appUser)};
         END;
         IF IS_ROLEMEMBER('db_owner', @0) = 0
         BEGIN
           ALTER ROLE db_owner ADD MEMBER ${quoteIdentifier(appUser)};
         END;`,
        [appUser],
      );
      console.log(`[create-e2e-database] app user mapped in ${dbName} (db_owner — disposable env only).`);
    }

    console.log('[create-e2e-database] PASS');
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`FAILED: ${message.split('\n')[0]}`, 1);
  } finally {
    await inDb?.destroy().catch(() => undefined);
    await master.destroy().catch(() => undefined);
  }
}

void main();
