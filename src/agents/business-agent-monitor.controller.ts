import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { DataSource } from "typeorm";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { PermissionsService } from "../rbac/permissions.service";
import { BUSINESS_AGENTS } from "./definitions/business-agents";

class BusinessRunsQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BUSINESS_AGENTS.map(agent => agent.id) })
  @IsOptional()
  @IsIn(BUSINESS_AGENTS.map((agent) => agent.id))
  agentId?: string;
  @ApiPropertyOptional({ enum: ['queued','running','paused','succeeded','failed','cancelled'] })
  @IsOptional()
  @IsIn(["queued", "running", "paused", "succeeded", "failed", "cancelled"])
  status?: string;
}
@ApiTags("agents")
@ApiBearerAuth()
@Controller("admin/agents/business-runs")
@RequirePermissions("settings.read")
export class BusinessAgentMonitorController {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
  ) {}
  /** Metadata only. This route must never project request/output JSON or tool bodies. */
  @Get()
  async list(
    @CurrentUser("userId") actor: string,
    @Query() query: BusinessRunsQuery,
  ) {
    if (!(await this.permissions.hasRole(actor, "admin")))
      throw new ForbiddenException("Chỉ Admin được xem vận hành Agent.");
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const params: unknown[] = [
      JSON.stringify(BUSINESS_AGENTS.map((agent) => agent.id)),
    ];
    const clauses = ["agentId IN (SELECT [value] FROM OPENJSON(@0))"];
    for (const key of ["agentId", "status"] as const)
      if (query[key]) {
        params.push(query[key]);
        clauses.push(`${key}=@${params.length - 1}`);
      }
    const where = clauses.join(" AND "),
      [count]: Array<{ total: number }> = await this.db.query(
        `SELECT COUNT(*) total FROM agent_runs WHERE ${where}`,
        params,
      );
    const offset = params.length;
    params.push((page - 1) * pageSize, pageSize);
    const items = await this.db.query(
      `WITH selected AS (SELECT id,agentId,agentVersion,promptVersion,policyVersion,status,stepCount,attempts,inputTokens,outputTokens,errorCode,retryable,createdAt,updatedAt,outputJson FROM agent_runs WHERE ${where} ORDER BY createdAt DESC,id DESC OFFSET @${offset} ROWS FETCH NEXT @${offset + 1} ROWS ONLY)
      SELECT a.id,a.agentId,a.agentVersion,a.promptVersion,a.policyVersion,a.status,a.stepCount,a.attempts,a.inputTokens,a.outputTokens,a.errorCode,a.retryable,a.createdAt,a.updatedAt,r.model,
      (SELECT COUNT(*) FROM agent_tool_receipts t WHERE t.runId=a.id) toolCalls FROM selected a LEFT JOIN ai_runs r ON r.id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(a.outputJson,'$.aiRunId')) ORDER BY a.createdAt DESC,a.id DESC`,
      params,
    );
    return {
      definitions: BUSINESS_AGENTS.map(
        ({ id, version, promptVersion, features, tools, budget }) => ({
          id,
          version,
          promptVersion,
          features,
          tools,
          budget,
        }),
      ),
      items,
      total: Number(count.total),
      page,
      pageSize,
    };
  }
}
