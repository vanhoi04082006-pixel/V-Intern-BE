# V-Intern-BE

NestJS backend for V-Intern — **Phase 1: platform core** on Microsoft SQL Server 2019.

```
Next.js FE (V-Intern-FE) ──HTTPS /api/v1──▶ NestJS BE (this repo) ──TypeORM/mssql──▶ SQL Server 2019
```

## Stack

- NestJS 11 (Express), TypeScript 5 (strict)
- TypeORM 0.3 + `mssql` (tedious) — **`synchronize: false`**, schema = versioned migrations only
- @nestjs/jwt (HS256, 15-min access), refresh tokens SHA-256-hashed at rest with rotation + family reuse detection
- class-validator global ValidationPipe (`whitelist` + `forbidNonWhitelisted` + `transform`)
- Swagger at `/api/docs`, unified error contract, unified pagination contract
- helmet, CORS allowlist + credentials, @nestjs/throttler (in-memory)

## Quick start (dev)

```bash
cp .env.example .env            # fill DB_* + JWT_SECRET (>= 32 chars)
npm install
npm run migration:run           # EMPTY DB → complete platform-core schema
npm run bootstrap:admin         # idempotent RBAC + initial admin (env-driven)
npm run seed:dev                # DEV-ONLY demo accounts (refuses in production)
npm run start:dev               # http://localhost:8080, Swagger /api/docs
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Production compile (nest build) |
| `npm run lint` | ESLint (typescript-eslint strict-ish) |
| `npm test` | Unit tests (mocked repos — no DB needed) |
| `npm run test:e2e` | Integration — requires reachable SQL Server **and** explicit `E2E_DB_NAME` (disposable DB). Without it: fail-fast `[E2E BLOCKED]` |
| `npm run migration:run` / `revert` / `show` / `generate` | Migration deploy / rollback / status / diff |
| `npm run bootstrap:admin` | Idempotent initial admin (env: `BOOTSTRAP_ADMIN_*`) |
| `npm run seed:dev` | Dev-only demo users (refuses `NODE_ENV=production`) |

## API surface (Phase 1)

- `POST /api/v1/auth/login` · `POST /api/v1/auth/refresh` · `POST /api/v1/auth/logout` (204) · `GET /api/v1/auth/me`
- `GET|POST /api/v1/users`, `GET|PATCH /api/v1/users/:id`, `PATCH /api/v1/users/:id/status`
- `GET /api/v1/roles` · `GET /api/v1/permissions`
- `GET|POST /api/v1/groups`, `PATCH /api/v1/groups/:id`, `GET|POST /api/v1/groups/:id/members`, `DELETE /api/v1/groups/:id/members/:userId`, `PUT /api/v1/groups/:id/roles`
- `GET|POST /api/v1/catalogs/types|items`, `PATCH /api/v1/catalogs/items/:id`
- `GET|PATCH /api/v1/settings`
- `GET /api/v1/audit-logs` · `GET /api/v1/activity-events`
- `GET /api/v1/notifications` (+ `unread-count`, `preferences`, `:id/read`, `read-all`)
- `GET /api/v1/health` (real DB check; honest 503)

Pagination (every list endpoint): `{ data: [], meta: { page, pageSize, total, totalPages } }`, max pageSize 100.
Errors: `{ statusCode, code, message, details?, traceId? }` — never leaks SQL/stack/secrets.

## Auth design

- Access JWT (sub+email, 15 min) returned in body; stored in FE memory only.
- Refresh token: 48 random bytes → `base64url`, **SHA-256-hashed** in DB, HttpOnly cookie `vintern_refresh` scoped `Path=/api/v1/auth`, `SameSite=Lax`, `Secure` in production.
- Rotation: every refresh revokes the old row and sets `replacedById` (transactional), same `familyId`.
- **Reuse detection**: presenting a revoked token revokes the ENTIRE family and audits `auth.refresh_reuse_detected`.
- Guards: `JwtAuthGuard` (re-loads user from DB every request; locked/deleted rejected) → `PermissionsGuard` (effective permissions = direct roles ∪ group-inherited roles, resolved from DB per request — revocation is immediate).
- Login rejects locked/pending/deleted with distinct codes; failures audited with generic 401 (no user enumeration).

## Known limitations (honest)

- **Throttling is per-process in-memory** (@nestjs/throttler). Behind a single instance this is fine; for multi-instance deployments introduce a distributed store (Redis) before relying on it.
- **SQL Server integration tests are BLOCKED/NOT VERIFIED** in environments without SQL Server — the e2e suite fails fast with `[E2E BLOCKED]` rather than faking a pass. Unit tests (mocked repos) cover auth rotation/reuse, permission resolution, notification preference filtering and pagination math.
- Dev seed (`seed:dev`) contains demo accounts — dev-only by explicit guard, never in production.

## Docs

- `docs/database/SQLSERVER2019_SETUP.md` — full DB provisioning, least-privilege, TLS, backup, troubleshooting
- `docs/architecture/domain-model.md` — implemented Phase-1 schema + PLANNED (not implemented) domains
