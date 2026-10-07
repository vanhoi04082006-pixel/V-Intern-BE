import 'reflect-metadata';
import 'dotenv/config';
import { hash } from 'bcryptjs';
import dataSource from '../database/data-source';
import { ensureRbac } from '../bootstrap/ensure-rbac';
import { Role } from '../rbac/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';

/**
 * DEV-ONLY seed (spec 32): explicit, guarded, idempotent.
 * - Refuses to run with NODE_ENV=production.
 * - Creates the four QA accounts used by the product walkthroughs.
 * - Does NOT port any SQLite snapshot records.
 */
interface DevUserSpec {
  email: string;
  username: string;
  displayName: string;
  password: string;
  roleCode: string;
}

const DEV_USERS: DevUserSpec[] = [
  { email: 'admin@vintern.edu.vn', username: 'admin', displayName: 'V-Intern Admin', password: 'Admin@123', roleCode: 'admin' },
  { email: 'teacher@vintern.edu.vn', username: 'teacher', displayName: 'Trần Giảng Viên', password: 'Demo@1234', roleCode: 'instructor' },
  { email: 'lehoang@vintern.edu.vn', username: 'lehoang', displayName: 'Lê Hoàng (Intern Active)', password: 'Demo@1234', roleCode: 'intern' },
  { email: 'waiting@vintern.edu.vn', username: 'waiting', displayName: 'Nguyễn Chờ Phân Công', password: 'Demo@1234', roleCode: 'intern' },
];

async function main(): Promise<void> {
  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    console.error('[seed:dev] REFUSED: dev seed must never run in production.');
    process.exit(1);
  }

  const ds = await dataSource.initialize();
  try {
    const rbac = await ensureRbac(ds);
    console.log(
      `[seed:dev] RBAC ensured — roles created: ${rbac.rolesCreated}, permissions created: ${rbac.permissionsCreated}.`,
    );

    const users = ds.getRepository(User);
    const roles = ds.getRepository(Role);
    const userRoles = ds.getRepository(UserRole);
    const notifications = new NotificationsService(
      ds.getRepository(Notification),
      ds.getRepository(NotificationPreference),
    );

    for (const spec of DEV_USERS) {
      const existing = await users.findOne({ where: { email: spec.email } });
      if (existing) {
        console.log(`[seed:dev] ${spec.email} exists — skipped (idempotent).`);
        continue;
      }
      const role = await roles.findOne({ where: { code: spec.roleCode } });
      if (!role) throw new Error(`role ${spec.roleCode} missing after ensureRbac.`);
      const passwordHash = await hash(spec.password, 10);
      const user = await users.save(
        users.create({
          email: spec.email,
          username: spec.username,
          displayName: spec.displayName,
          passwordHash,
          status: 'active',
        }),
      );
      await userRoles.insert({ userId: user.id, roleId: role.id });
      await notifications.notifyUsers([user.id], {
        type: 'system',
        title: 'Chào mừng đến V-Intern',
        body: 'Tài khoản demo (dev-only) đã sẵn sàng.',
        category: 'system',
      });
      console.log(`[seed:dev] created ${spec.email} (${spec.roleCode}).`);
    }
  } finally {
    await ds.destroy();
  }
}

void main().catch((err: unknown) => {
  console.error('[seed:dev] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
