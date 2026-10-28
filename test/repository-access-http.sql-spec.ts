import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { DataSource } from "typeorm";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { ensureRbac } from "../src/bootstrap/ensure-rbac";
import { accessFixture } from "./support/repository-access-fixture";
let app: INestApplication, db: DataSource;
beforeAll(async () => {
  if (!/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? ""))
    throw Error("Disposable SQL only");
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  db = app.get(DataSource);
  await ensureRbac(db);
}, 120000);
afterAll(async () => {
  if (app) await app.close();
});
async function token(id: string, role: string) {
  await db.query(
    "INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code=@1",
    [id, role],
  );
  return app
    .get(JwtService)
    .signAsync({ sub: id, email: id + "@access.test", av: 0 });
}
const route = (session: string) =>
  `/api/v1/sessions/${session}/participation/repository-access-jobs`;
it("enforces login, staff permissions and session ownership while omitting credentials from job metadata", async () => {
  const f = await accessFixture(db),
    other = await accessFixture(db),
    teacher = await token(f.teacher, "instructor"),
    student = await token(f.target, "intern"),
    foreign = await token(other.teacher, "instructor");
  expect(
    (await request(app.getHttpServer()).get(route(f.sessionId))).status,
  ).toBe(401);
  for (const denied of [student, foreign])
    expect(
      (
        await request(app.getHttpServer())
          .get(route(f.sessionId))
          .auth(denied, { type: "bearer" })
      ).status,
    ).toBe(403);
  const read = await request(app.getHttpServer())
    .get(route(f.sessionId))
    .auth(teacher, { type: "bearer" });
  expect(read.status).toBe(200);
  expect(read.body.items).toHaveLength(1);
  expect(read.body.items[0].id.toLowerCase()).toBe(f.jobId.toLowerCase());
  expect(JSON.stringify(read.body)).not.toMatch(
    /passwordHash|tokenCiphertext|not-a-login/,
  );
});
it("requires a current revision and reason for scoped retry without creating a duplicate job", async () => {
  const f = await accessFixture(db),
    teacher = await token(f.teacher, "instructor"),
    base = route(f.sessionId),
    retry = base + "/" + f.jobId + "/retry";
  const read = () =>
    request(app.getHttpServer()).get(base).auth(teacher, { type: "bearer" });
  const original = (await read()).body.items[0];
  await db.query(
    "UPDATE repository_access_jobs SET status='failed',errorCode='GITHUB_ACCESS_REVIEW_REQUIRED',updatedAt=DATEADD(second,1,updatedAt) WHERE id=@0",
    [f.jobId],
  );
  expect(
    (
      await request(app.getHttpServer())
        .post(retry)
        .auth(teacher, { type: "bearer" })
        .send({
          expectedRevision: original.revision,
          reason: "Giảng viên đã kiểm tra và yêu cầu đối chiếu lại.",
        })
    ).status,
  ).toBe(409);
  const current = (await read()).body.items[0],
    body = {
      expectedRevision: current.revision,
      reason: "Giảng viên đã kiểm tra và yêu cầu đối chiếu lại.",
    };
  expect(
    (
      await request(app.getHttpServer())
        .post(retry)
        .auth(teacher, { type: "bearer" })
        .send({ ...body, reason: "          " })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app.getHttpServer())
        .post(retry)
        .auth(teacher, { type: "bearer" })
        .send({ ...body, force: true })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app.getHttpServer())
        .post(retry)
        .auth(teacher, { type: "bearer" })
        .send(body)
    ).status,
  ).toBe(201);
  expect(
    (
      await request(app.getHttpServer())
        .post(retry)
        .auth(teacher, { type: "bearer" })
        .send(body)
    ).status,
  ).toBe(409);
  expect(
    await db.query("SELECT id FROM repository_access_jobs WHERE sessionId=@0", [
      f.sessionId,
    ]),
  ).toHaveLength(1);
  expect(
    await db.query(
      "SELECT id FROM audit_logs WHERE targetId=@0 AND action='github.repository_access.retry_requested'",
      [f.jobId],
    ),
  ).toHaveLength(1);
});
it("returns only the signed-in student jobs and denies student retries", async () => {
  const f = await accessFixture(db);
  await accessFixture(db);
  const student = await token(f.target, "intern");
  const read = await request(app.getHttpServer())
    .get("/api/v1/github/me/repository-access")
    .auth(student, { type: "bearer" });
  expect(read.status).toBe(200);
  expect(read.body.items).toHaveLength(1);
  expect(read.body.items[0].id.toLowerCase()).toBe(f.jobId.toLowerCase());
  expect(
    (
      await request(app.getHttpServer())
        .post(route(f.sessionId) + "/" + f.jobId + "/retry")
        .auth(student, { type: "bearer" })
        .send({
          expectedRevision: read.body.items[0].revision,
          reason: "Sinh viên muốn tự cấp quyền không được phép.",
        })
    ).status,
  ).toBe(403);
});
