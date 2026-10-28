import { randomUUID, createHash } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { CreateApplications1763241600000 } from "../src/database/migrations/1763241600000-CreateApplications";
import { ensureRbac } from "../src/bootstrap/ensure-rbac";
let db: DataSource, owner: string, before: string;
const identities = async () =>
  createHash("sha256")
    .update(
      JSON.stringify(
        await db.query(
          "SELECT id,email,username,passwordHash,status FROM users ORDER BY id",
        ),
      ),
    )
    .digest("hex");
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "",
    migrations = source.options.migrations;
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database) ||
    source.options.type !== "mssql" ||
    !Array.isArray(migrations)
  )
    throw Error("Fresh disposable migration database required");
  const index = migrations.indexOf(CreateApplications1763241600000);
  if (index < 0) throw Error("G3 migration not registered");
  db = new DataSource({
    ...source.options,
    database,
    migrations: migrations.slice(0, index),
  });
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
  if ((await db.query("SELECT OBJECT_ID('cv_applications','U') id"))[0].id)
    throw Error("Fresh database required; never reset");
  await ensureRbac(db);
  for (let i = 0; i < 3; i++) {
    const id = randomUUID();
    if (!i) owner = id;
    await db.query(
      "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,N'Protected migration fixture','unchanged-fixture-hash','active')",
      [id, `${id}@migration.test`],
    );
  }
  before = await identities();
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
it("adds G3 without changing original identities and round-trips only an unused schema", async () => {
  const q = db.createQueryRunner();
  await q.connect();
  try {
    const migration = new CreateApplications1763241600000();
    await migration.up(q);
    expect(await identities()).toBe(before);
    expect(
      (
        await db.query(
          "SELECT COUNT(*) n FROM users WHERE mustChangePassword=0 AND authVersion=0",
        )
      )[0].n,
    ).toBe(3);
    await migration.down(q);
    expect(await identities()).toBe(before);
    await migration.up(q);
    expect(await identities()).toBe(before);
    const grants = await db.query(
      "SELECT r.code FROM roles r JOIN role_permissions rp ON rp.roleId=r.id JOIN permissions p ON p.id=rp.permissionId WHERE p.code='applications.manage' ORDER BY r.code",
    );
    expect(grants.map((r: { code: string }) => r.code)).toEqual([
      "admin",
      "instructor",
    ]);
  } finally {
    await q.release();
  }
});
it("refuses to remove a password revocation even when no applications exist", async () => {
  await db.query("UPDATE users SET authVersion=1 WHERE id=@0", [owner]);
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await expect(new CreateApplications1763241600000().down(q)).rejects.toThrow(
      /Preserve/,
    );
  } finally {
    await q.release();
  }
  expect(
    (await db.query("SELECT authVersion FROM users WHERE id=@0", [owner]))[0]
      .authVersion,
  ).toBe(1);
});
