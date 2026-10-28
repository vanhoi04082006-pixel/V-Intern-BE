import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import dataSource from "../database/data-source";
import { AppModule } from "../app.module";
import { KnowledgeStore } from "../knowledge/knowledge.store";
import { MINI_PROJECT_KNOWLEDGE } from "../knowledge/mini-project-knowledge";
import { ensureMiniProjectKnowledge } from "../knowledge/mini-project-knowledge-seed";
import { MINI_PROJECT_LIBRARY } from "../templates/mini-project-catalog";
import { ensureMiniProjectLibrary } from "../templates/mini-project-seed";
import { ensureMiniProjectAssessments } from "../templates/mini-project-assessment-seed";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply") || args.length > 1)
    throw Error(
      "Usage: seed:g2-content [--apply]. Default previews without changing content.",
    );
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "::1"].includes(
      process.env.DB_HOST ?? "localhost",
    )
  )
    throw Error("G2 bundled content is local-only.");
  if (!args.includes("--apply")) {
    const db = await dataSource.initialize();
    try {
      const templates: Array<{ code: string; version: number }> =
        await db.query("SELECT code,version FROM project_templates");
      const knowledge: Array<{ code: string; status: string }> = await db.query(
        "SELECT code,status FROM knowledge_entries",
      );
      process.stdout.write(
        JSON.stringify({
          mode: "preview",
          mutationsPerformed: 0,
          templates: MINI_PROJECT_LIBRARY.map((item) => ({
            code: item.code,
            action: templates.some((row) => row.code === item.code)
              ? "preserve; untouched v1 may gain private v2"
              : "insert",
          })),
          knowledge: MINI_PROJECT_KNOWLEDGE.map((item) => ({
            code: item.code,
            action: knowledge.some((row) => row.code === item.code)
              ? "preserve"
              : "publish reviewed bundle",
          })),
        }) + "\n",
      );
    } finally {
      await db.destroy();
    }
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const db = app.get(DataSource);
    const [admin]: Array<{ id: string }> = await db.query(
      "SELECT TOP(1) u.id FROM users u JOIN user_roles ur ON ur.userId=u.id JOIN roles r ON r.id=ur.roleId WHERE r.code='admin' AND u.status='active' ORDER BY u.createdAt",
    );
    if (!admin)
      throw Error(
        "An existing active local Admin is required. This seed never creates or resets users.",
      );
    const templates = await ensureMiniProjectLibrary(db, admin.id),
      assessments = await ensureMiniProjectAssessments(db, admin.id),
      knowledge = await ensureMiniProjectKnowledge(
        db,
        app.get(KnowledgeStore),
        admin.id,
      );
    process.stdout.write(
      JSON.stringify({ mode: "apply", templates, assessments, knowledge }) +
        "\n",
    );
  } finally {
    await app.close();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "G2 content seed failed.",
  );
  process.exitCode = 1;
});
