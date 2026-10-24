import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { ParticipationLedger } from "./participation-ledger.service";
@Injectable()
export class ParticipationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private after = "00000000-0000-0000-0000-000000000000";
  private readonly logger = new Logger(ParticipationWorker.name);
  constructor(
    private readonly db: DataSource,
    private readonly ledger: ParticipationLedger,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (
      this.config.get("NODE_ENV") === "test" ||
      this.config.get("PARTICIPATION_WORKER_ENABLED", "true") !== "true"
    )
      return;
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick(sessionId: string | null = null) {
    if (this.running) return { processed: 0, busy: true };
    this.running = true;
    let processed = 0;
    try {
      const tasks: Array<{ id: string }> = await this.db.query(
        `SELECT TOP(50) t.id FROM tasks t JOIN sprints s ON s.id=t.sprintId
        JOIN internship_sessions se ON se.id=s.sessionId AND se.status='active'
        JOIN participation_policies p ON p.sessionId=se.id
        WHERE t.deletedAt IS NULL AND t.assigneeId IS NOT NULL AND t.status IN('todo','doing','review')
        AND (@0 IS NULL OR se.id=@0) AND (t.dueDate<SYSUTCDATETIME() OR EXISTS(SELECT 1 FROM participation_incidents i WHERE i.taskId=t.id AND i.status='active'))
        ORDER BY CASE WHEN t.id>CAST(@1 AS uniqueidentifier) THEN 0 ELSE 1 END,t.id`,
        [sessionId, this.after],
      );
      for (const task of tasks) {
        this.after = task.id;
        try {
          await this.ledger.syncTask(task.id);
          processed++;
        } catch {
          this.logger.warn("Participation task reconciliation will retry.");
        }
      }
      return { processed, batchLimit: 50 };
    } catch {
      this.logger.warn("Participation scan temporarily unavailable.");
      return { processed, failed: true };
    } finally {
      this.running = false;
    }
  }
}
