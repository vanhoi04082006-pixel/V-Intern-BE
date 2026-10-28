import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { GithubRepositoriesService } from './github-repositories.service';

/** Bounded round-robin batches also pick up members who connect after Start. */
@Injectable()
export class GithubRepositorySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GithubRepositorySyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private after = '00000000-0000-0000-0000-000000000000';
  constructor(private readonly db: DataSource, private readonly repos: GithubRepositoriesService, private readonly config: ConfigService) {}
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const sessions: Array<{ id: string; leadInstructorId: string }> = await this.db.query(`SELECT TOP(3) se.id,se.leadInstructorId FROM internship_sessions se
        JOIN users lead ON lead.id=se.leadInstructorId AND lead.status='active'
        LEFT JOIN session_repositories r ON r.sessionId=se.id
        WHERE se.status='active' AND se.leadInstructorId IS NOT NULL
        AND (r.status='ready' OR EXISTS(SELECT 1 FROM github_repository_account WHERE id=1))
        ORDER BY CASE WHEN se.id>CAST(@0 AS uniqueidentifier) THEN 0 ELSE 1 END,se.id`, [this.after]);
      for (const session of sessions) {
        this.after = session.id;
        try { await this.repos.provision(session.id, session.leadInstructorId); }
        catch { this.logger.warn(`Repository sync requires configuration or retry for session ${session.id}.`); }
      }
    } catch { this.logger.warn('Repository sync is temporarily unavailable.'); }
    finally { this.running = false; }
  }
}
