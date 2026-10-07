import 'reflect-metadata';
import 'dotenv/config';
import { hash } from 'bcryptjs';
import dataSource from '../database/data-source';
import { ensureRbac } from '../bootstrap/ensure-rbac';
import { Role } from '../rbac/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../rbac/entities/user-role.entity';

/**
 * Production-safe initial admin bootstrap (spec 31):
 * - idempotent (safe to re-run; existing admin is never overwritten)
 * - explicit (all inputs from env; nothing invented)
 * - documented (README + SQLSERVER2019_SETUP.md)
 *
 * Usage: BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... npm run bootstrap:admin
 */
async function main(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME ?? 'System Admin';

  if (!email || !password) {
    console.error('[bootstrap:admin] Refusing to run: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.');
    process.exit(1);
  }
  if (password.length < 10 || password.length > 72) {
    console.error('[bootstrap:admin] Refusing to run: password must be 10-72 characters.');
    process.exit(1);
  }

  const ds = await dataSource.initialize();
  try {
    const rbac = await ensureRbac(ds);
    console.log(
      `[bootstrap:admin] RBAC ensured — roles created: ${rbac.rolesCreated}, permissions created: ${rbac.permissionsCreated}, grants added: ${rbac.rolePermissionsAdded}.`,
    );

    const users = ds.getRepository(User);
    const roles = ds.getRepository(Role);
    const userRoles = ds.getRepository(UserRole);

    const existing = await users.findOne({ where: { email } });
    if (existing) {
      console.log(`[bootstrap:admin] Admin user ${email} already exists — left untouched (idempotent).`);
      return;
    }

    const adminRole = await roles.findOne({ where: { code: 'admin' } });
    if (!adminRole) throw new Error('admin role missing after ensureRbac.');

    const passwordHash = await hash(password, 10);
    const admin = await users.save(
      users.create({
        email,
        username: 'admin',
        displayName,
        passwordHash,
        status: 'active',
      }),
    );
    await userRoles.insert({ userId: admin.id, roleId: adminRole.id });
    console.log(`[bootstrap:admin] Created initial admin ${email} (role: admin). Change the password after first login.`);
  } finally {
    await ds.destroy();
  }
}

void main().catch((err: unknown) => {
  console.error('[bootstrap:admin] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
