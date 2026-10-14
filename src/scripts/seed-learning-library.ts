import "reflect-metadata";
import "dotenv/config";
import { randomUUID } from "crypto";
import dataSource from "../database/data-source";
import { ensureRecruitmentQuestions } from "../recruitment/question-seed";
import { LEARNING_LIBRARY } from "../templates/learning-library";

async function main(): Promise<void> {
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "::1"].includes(
      process.env.DB_HOST ?? "localhost",
    )
  )
    throw new Error(
      "Learning library seed requires a local development database.",
    );
  const db = await dataSource.initialize();
  try {
    const admins: Array<{ id: string }> = await db.query(
      "SELECT TOP(1) u.id FROM users u JOIN user_roles ur ON ur.userId=u.id JOIN roles r ON r.id=ur.roleId WHERE r.code=@0 AND u.status=@1 ORDER BY u.createdAt",
      ["admin", "active"],
    );
    if (!admins.length)
      throw new Error("Run bootstrap:admin before seed:library.");
    let inserted = 0;
    for (const template of LEARNING_LIBRARY) {
      inserted += await db.transaction(async (em) => {
        const existing = await em.query(
          "SELECT id FROM project_templates WITH(UPDLOCK,HOLDLOCK) WHERE code=@0",
          [template.code],
        );
        if (existing.length) return 0;
        await em.query(
          "INSERT INTO project_templates(id,code,name,category,difficulty,definitionJson,createdById) VALUES(@0,@1,@2,@3,@4,@5,@6)",
          [
            randomUUID(),
            template.code,
            template.name,
            template.category,
            template.difficulty,
            JSON.stringify(template),
            admins[0].id,
          ],
        );
        return 1;
      });
    }
    process.stdout.write(
      JSON.stringify({
        templatesInserted: inserted,
        questions: await ensureRecruitmentQuestions(db),
      }) + "\n",
    );
  } finally {
    await db.destroy();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Library seed failed.",
  );
  process.exitCode = 1;
});
