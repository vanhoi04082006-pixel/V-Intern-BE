# Microsoft SQL Server 2019 — Setup Guide (V-Intern-BE)

Target: SQL Server 2019 (15.x) on Windows or Linux, reachable at `DB_HOST:DB_PORT`.

## 1. Install / assumptions

- **Edition**: Developer (local) or Standard/Enterprise (prod).
- **Authentication mode**: Mixed Mode (SQL logins enabled).
- **TCP/IP must be enabled** and the server listening on **port 1433** (SQL Server
  Configuration Manager → SQL Server Network Configuration → Protocols → TCP/IP;
  restart the service after changes).
- Firewall: allow inbound TCP 1433 from the app host only.

## 2. Create the database

```sql
CREATE DATABASE VIntern COLLATE Vietnamese_100_CI_AI;  -- or Latin1_General_100_CI_AI
GO
ALTER DATABASE VIntern SET READ_COMMITTED_SNAPSHOT ON; -- avoids reader/writer blocking
GO
```

## 3. Application login/user — least privilege

```sql
CREATE LOGIN vintern_app WITH PASSWORD = '<STRONG-PASSWORD>', CHECK_POLICY = ON;
GO
USE VIntern;
CREATE USER vintern_app FOR LOGIN vintern_app;
-- runtime role: read/write data only (no DDL)
EXEC sp_addrolemember N'db_datareader', N'vintern_app';
EXEC sp_addrolemember N'db_datawriter', N'vintern_app';
GO
```

> The login used to run migrations additionally needs `db_ddladmin`
> (or `db_owner` on non-shared dev servers). Prefer: run migrations with a
> migration login, run the app with `vintern_app`.

## 4. Environment variables (`.env` — NEVER committed)

| Var | Dev example | Production |
| --- | --- | --- |
| `DB_HOST` | `localhost` | internal hostname |
| `DB_PORT` | `1433` | `1433` |
| `DB_NAME` | `VIntern` | `VIntern` |
| `DB_USERNAME` | `vintern_app` | dedicated migration vs runtime logins |
| `DB_PASSWORD` | strong | strong + secret manager |
| `DB_ENCRYPT` | `false` | **`true`** |
| `DB_TRUST_SERVER_CERTIFICATE` | `true` | **`false`** (trusted CA chain) |

## 5. Migrations (the ONLY schema mechanism)

```bash
npm run migration:show      # status: pending/executed
npm run migration:run       # EMPTY DB → complete platform-core schema
npm run migration:revert    # rollback LAST migration (down path drops everything)
```

- The app boots with `synchronize: false` — schema drift is impossible through the app.
- `prisma db push` is NOT used anywhere in this backend.
- Never edit an executed migration; generate a new one (`npm run migration:generate`).

## 6. Bootstrap admin + dev seed

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@yourdomain.vn \
BOOTSTRAP_ADMIN_PASSWORD='<10-72 chars>' \
npm run bootstrap:admin         # idempotent; existing admin left untouched
```

`npm run seed:dev` is dev-only (refuses `NODE_ENV=production`).

## 7. Health verification

```bash
curl -s http://localhost:8080/api/v1/health
# → {"status":"ok","checks":{"backend":"ok","database":"ok","dbLatencyMs":<n>},...}
# A broken DB yields an honest HTTP 503 HEALTH_DB_UNAVAILABLE — never a fake ok.
```

## 8. TLS

- **Local dev**: `DB_ENCRYPT=false`, `DB_TRUST_SERVER_CERTIFICATE=true` (no cert on dev instances).
- **Production**: `DB_ENCRYPT=true`, `DB_TRUST_SERVER_CERTIFICATE=false`, server certificate from a trusted CA
  (or pin the CA into the container trust store). Never ship `trustServerCertificate=true` to prod.

## 9. Backups (minimum)

```sql
BACKUP DATABASE VIntern TO DISK = 'D:\backups\VIntern.bak' WITH INIT, COMPRESSION;
-- plus log backups (FULL recovery) every 15 min; test restores quarterly.
```

## 10. Common errors

| Symptom | Cause / fix |
| --- | --- |
| `Login failed for user 'vintern_app'` (18456) | Mixed Mode off, wrong password, or login not mapped in DB (`CREATE USER`) |
| `SQL Server does not exist or access denied` | TCP/IP disabled, firewall, wrong port — check port 1433 |
| `certificate: self signed certificate` | Prod TLS without CA — set trusted chain, keep `TRUST_SERVER_CERTIFICATE=false` |
| Error 2601/2627 during app inserts | Unique index violation — the API maps these to HTTP 409 |
| Deadlocks / blocking | Ensure `READ_COMMITTED_SNAPSHOT ON`; keep transactions short (refresh rotation) |
