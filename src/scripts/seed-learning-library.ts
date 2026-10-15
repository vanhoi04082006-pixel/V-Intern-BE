import "reflect-metadata";
import "dotenv/config";
import dataSource from "../database/data-source";
import { ensureRecruitmentQuestions } from "../recruitment/question-seed";
import { ensureLearningLibrary } from "../templates/learning-library-seed";

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
    const library = await ensureLearningLibrary(db, admins[0].id);
    process.stdout.write(
      JSON.stringify({
        templates: library,
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
