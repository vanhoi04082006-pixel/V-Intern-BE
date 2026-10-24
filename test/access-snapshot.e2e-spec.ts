import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { PermissionsService } from "../src/rbac/permissions.service";
import { UserRole } from "../src/rbac/entities/user-role.entity";
import { Role } from "../src/rbac/entities/role.entity";
import { Permission } from "../src/rbac/entities/permission.entity";
import { RolePermission } from "../src/rbac/entities/role-permission.entity";
import { GroupMember } from "../src/groups/entities/group-member.entity";
import { GroupRole } from "../src/groups/entities/group-role.entity";

let db: DataSource;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "";
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database) ||
    source.options.type !== "mssql"
  )
    throw Error("Disposable SQL database required");
  db = new DataSource({ ...source.options, database });
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
});
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});

it("resolves direct/inherited/empty roles and immediately reflects grant and membership revocation on SQL", async () => {
  const actor = randomUUID(),
    direct = randomUUID(),
    inherited = randomUUID(),
    group = randomUUID(),
    permission = randomUUID();
  const code = `snapshot-${actor.slice(0, 8)}`;
  await db.query(
    "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,N'Snapshot fixture','not-a-login-hash','active')",
    [actor, `${actor}@qa.test`],
  );
  await db.query(
    "INSERT INTO roles(id,code,name) VALUES(@0,@1,'Direct fixture'),(@2,@3,'Inherited fixture')",
    [direct, `${code}-direct`, inherited, `${code}-inherited`],
  );
  await db.query(
    "INSERT INTO permissions(id,code,name) VALUES(@0,@1,'Snapshot fixture')",
    [permission, code],
  );
  await db.query(
    "INSERT INTO role_permissions(roleId,permissionId) VALUES(@0,@1)",
    [inherited, permission],
  );
  await db.query(
    "INSERT INTO user_groups(id,code,name) VALUES(@0,@1,'Snapshot fixture')",
    [group, code],
  );
  await db.query("INSERT INTO user_roles(userId,roleId) VALUES(@0,@1)", [
    actor,
    direct,
  ]);
  await db.query("INSERT INTO group_members(groupId,userId) VALUES(@0,@1)", [
    group,
    actor,
  ]);
  await db.query(
    "INSERT INTO group_roles(groupId,roleId) VALUES(@0,@1),(@0,@2)",
    [group, direct, inherited],
  );
  const service = new PermissionsService(
    db.getRepository(UserRole),
    db.getRepository(GroupMember),
    db.getRepository(GroupRole),
    db.getRepository(Role),
    db.getRepository(RolePermission),
    db.getRepository(Permission),
  );
  const first = await service.accessSnapshot(actor);
  expect([...first.roles].sort()).toEqual([
    `${code}-direct`,
    `${code}-inherited`,
  ]);
  expect([...first.permissions]).toEqual([code]);
  await db.query("DELETE FROM role_permissions WHERE roleId=@0", [inherited]);
  expect((await service.accessSnapshot(actor)).permissions.size).toBe(0);
  await db.query("DELETE FROM group_members WHERE groupId=@0 AND userId=@1", [
    group,
    actor,
  ]);
  expect([...(await service.accessSnapshot(actor)).roles]).toEqual([
    `${code}-direct`,
  ]);
});
