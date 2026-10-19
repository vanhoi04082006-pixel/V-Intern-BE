import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { DataSource } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { isUniqueViolation } from "../common/utils/db-errors";
import { GithubClient } from "./github-client";
import { boundedJson, openToken, sealToken } from "./github-security";
import { canRefresh, CONNECTION_COLUMNS, GithubTokenRefresh } from './github-token-refresh';
import { parseOAuthTokens } from './github-oauth-tokens';

export interface GithubConnection {
  userId: string;
  githubUserId: string | number;
  login: string;
  tokenCiphertext: string;
  scopes: string;
  expiresAt: Date | null;
  refreshTokenCiphertext?: string | null;
  refreshExpiresAt?: Date | null;
  tokenVersion?: number;
}
interface OAuthState {
  userId: string;
  verifierCiphertext: string;
  returnRole: string;
  connectionVersion: number;
}
export interface GithubIdentity {
  id: number;
  login: string;
}

@Injectable()
export class GithubAuthService {
  private readonly refresher: GithubTokenRefresh;
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly client: GithubClient,
    private readonly permissions: PermissionsService,
  ) { this.refresher = new GithubTokenRefresh(db, config, client); }
  private secret(): string {
    return this.config.get<string>("GITHUB_TOKEN_ENCRYPTION_KEY", "");
  }
  get configured(): boolean {
    return Boolean(
      this.config.get("GITHUB_CLIENT_ID") &&
        this.config.get("GITHUB_CLIENT_SECRET") &&
        this.config.get("GITHUB_CALLBACK_URL") &&
        Buffer.from(this.secret(), "base64").length === 32,
    );
  }
  frontendOrigin(): string {
    const u = new URL(
      this.config.get<string>("FRONTEND_ORIGIN", "http://localhost:3001"),
    );
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      throw new Error("Invalid frontend origin.");
    return u.origin;
  }
  private requireConfigured(): void {
    if (!this.configured)
      throw new ServiceUnavailableException({
        code: "GITHUB_NOT_CONFIGURED",
        message:
          "Quản trị viên cần cấu hình GitHub OAuth App và khóa mã hóa tại server trước khi kết nối.",
      });
  }
  async connection(userId: string): Promise<GithubConnection | null> {
    const rows: GithubConnection[] = await this.db.query(
      `SELECT ${CONNECTION_COLUMNS} FROM github_connections WHERE userId=@0`,
      [userId],
    );
    return rows[0] ?? null;
  }
  async status(userId: string) {
    const c = await this.connection(userId);
    return {
      configured: this.configured,
      connected: Boolean(c),
      login: c?.login ?? null,
      githubUserId: c ? String(c.githubUserId) : null,
      canCreatePublicRepo: Boolean(
        c && (!c.expiresAt || c.expiresAt.getTime() > Date.now() || canRefresh(c)) &&
          c.scopes
            .split(/[ ,]+/)
            .some((s) => s === "repo" || s === "public_repo"),
      ),
      reconnectRequired: Boolean(
        c?.expiresAt && c.expiresAt.getTime() <= Date.now() && !canRefresh(c),
      ),
    };
  }
  async token(
    userId: string,
  ): Promise<{ token: string; connection: GithubConnection }> {
    const active = await this.db.query("SELECT id FROM users WHERE id=@0 AND status='active'", [userId]);
    if (!active.length) throw new ServiceUnavailableException({ code: 'GITHUB_ACCOUNT_INACTIVE', message: 'Tài khoản cung cấp kết nối GitHub đã bị khóa hoặc ngừng hoạt động.' });
    const existing = await this.connection(userId);
    if (!existing)
      throw new ServiceUnavailableException({
        code: "GITHUB_RECONNECT_REQUIRED",
        message: "Cần kết nối lại tài khoản GitHub.",
      });
    const c = await this.refresher.ensure(existing);
    return {
      token: openToken(c.tokenCiphertext, this.secret(), userId.toLowerCase()),
      connection: c,
    };
  }
  async begin(userId: string) {
    this.requireConfigured();
    const admin = await this.permissions.hasRole(userId, "admin");
    const instructor = await this.permissions.hasRole(userId, "instructor");
    if (!admin && !instructor && !(await this.permissions.hasRole(userId, "intern")))
      throw new ForbiddenException(
        "Tài khoản cần có vai trò Admin, giảng viên hoặc sinh viên.",
      );
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(state).digest("hex");
    const connection = await this.connection(userId);
    await this.db.query(
      "INSERT INTO github_oauth_states(stateHash,userId,verifierCiphertext,returnRole,expiresAt,connectionVersion) VALUES(@0,@1,@2,@3,@4,@5)",
      [
        hash,
        userId,
        sealToken(verifier, this.secret(), `oauth:${hash}`),
        admin ? "admin" : instructor ? "instructor" : "intern",
        new Date(Date.now() + 600000),
        connection ? connection.tokenVersion ?? 1 : 0,
      ],
    );
    const params = new URLSearchParams({
      client_id: this.config.get<string>("GITHUB_CLIENT_ID")!,
      redirect_uri: this.config.get<string>("GITHUB_CALLBACK_URL")!,
      scope: admin ? "read:user public_repo" : "read:user",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return {
      state,
      authorizeUrl: `https://github.com/login/oauth/authorize?${params}`,
    };
  }
  async finish(
    code: string,
    state: string,
    cookieState: string,
  ): Promise<string> {
    this.requireConfigured();
    if (
      !/^[\w-]{43}$/.test(state) ||
      !cookieState ||
      Buffer.byteLength(state) !== Buffer.byteLength(cookieState) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
    )
      throw new UnauthorizedException("GitHub OAuth state không hợp lệ.");
    const hash = createHash("sha256").update(state).digest("hex");
    const rows: OAuthState[] = await this.db.query(
      "UPDATE github_oauth_states SET usedAt=SYSUTCDATETIME() OUTPUT inserted.userId,inserted.verifierCiphertext,inserted.returnRole,inserted.connectionVersion WHERE stateHash=@0 AND usedAt IS NULL AND expiresAt>SYSUTCDATETIME()",
      [hash],
    );
    if (!rows.length)
      throw new UnauthorizedException(
        "Yêu cầu kết nối đã dùng hoặc hết hạn. Hãy bắt đầu lại.",
      );
    const userId = rows[0].userId.toLowerCase();
    const active = await this.db.query(
      "SELECT id FROM users WHERE id=@0 AND status='active'",
      [userId],
    );
    if (!active.length)
      throw new UnauthorizedException("Tài khoản không còn hoạt động.");
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: this.config.get("GITHUB_CLIENT_ID"),
          client_secret: this.config.get("GITHUB_CLIENT_SECRET"),
          code,
          redirect_uri: this.config.get("GITHUB_CALLBACK_URL"),
          code_verifier: openToken(
            rows[0].verifierCiphertext,
            this.secret(),
            `oauth:${hash}`,
          ),
        }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new ServiceUnavailableException(
        "GitHub chưa cấp được quyền kết nối.",
      );
    }
    const data = parseOAuthTokens(await boundedJson(response, 64000));
    const identity = await this.client.call<GithubIdentity>(
      "/user",
      data.access_token,
    );
    if (
      !Number.isSafeInteger(identity.id) ||
      identity.id <= 0 ||
      !/^[a-zA-Z0-9-]{1,39}$/.test(identity.login)
    )
      throw new UnauthorizedException("Danh tính GitHub không hợp lệ.");
    try {
      await this.db.transaction(async (em) => {
        const stateStillPresent = await em.query('SELECT stateHash FROM github_oauth_states WITH(UPDLOCK,HOLDLOCK) WHERE stateHash=@0 AND userId=@1 AND usedAt IS NOT NULL', [hash, userId]);
        if (!stateStillPresent.length) throw new UnauthorizedException('Yêu cầu kết nối đã bị hủy.');
        const stillActive = await em.query("SELECT id FROM users WHERE id=@0 AND status='active'", [userId]);
        if (!stillActive.length) throw new UnauthorizedException('Tài khoản không còn hoạt động.');
        const existing = await em.query(
          "SELECT userId,tokenVersion FROM github_connections WITH(UPDLOCK,HOLDLOCK) WHERE userId=@0",
          [userId],
        );
        const selected = await em.query('SELECT githubUserId FROM github_repository_account WHERE userId=@0', [userId]);
        if (selected[0] && String(selected[0].githubUserId) !== String(identity.id))
          throw new ConflictException('Không đổi danh tính tài khoản tạo repo chung qua kết nối lại. Hãy chọn Admin khác làm tài khoản chung trước.');
        if ((existing[0]?.tokenVersion ?? 0) !== rows[0].connectionVersion) throw new ConflictException({ code: 'GITHUB_CONNECTION_CHANGED', message: 'Kết nối đã thay đổi. Hãy bắt đầu lại.' });
        const params = [
          userId,
          identity.id,
          identity.login,
          sealToken(data.access_token!, this.secret(), userId),
          data.scope ?? "",
          data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : null,
          data.refresh_token ? sealToken(data.refresh_token, this.secret(), `github-refresh:${userId}`) : null,
          data.refresh_token_expires_in ? new Date(Date.now() + data.refresh_token_expires_in * 1000) : null,
        ];
        if (existing.length)
          await em.query(
            "UPDATE github_connections SET githubUserId=@1,login=@2,tokenCiphertext=@3,scopes=@4,expiresAt=@5,refreshTokenCiphertext=@6,refreshExpiresAt=@7,tokenVersion=tokenVersion+1,refreshLeaseId=NULL,refreshLeaseExpiresAt=NULL,connectedAt=SYSUTCDATETIME() WHERE userId=@0",
            params,
          );
        else
          await em.query(
            "INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes,expiresAt,refreshTokenCiphertext,refreshExpiresAt) VALUES(@0,@1,@2,@3,@4,@5,@6,@7)",
            params,
          );
      });
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException(
          "Tài khoản GitHub này đã liên kết với người dùng khác.",
        );
      throw e;
    }
    return rows[0].returnRole === 'admin'
      ? `${this.frontendOrigin()}/admin/settings?github=connected`
      : `${this.frontendOrigin()}/${rows[0].returnRole === "instructor" ? "instructor" : "intern"}/github?connected=1`;
  }
  async disconnect(userId: string): Promise<{ disconnected: true }> {
    await this.db.transaction(async (em) => {
      const selected = await em.query('SELECT id FROM github_repository_account WITH(UPDLOCK,HOLDLOCK) WHERE userId=@0', [userId]);
      if (selected.length) throw new ConflictException('Đây là tài khoản tạo repo chung. Chọn tài khoản Admin khác trước khi ngắt kết nối.');
      await em.query("DELETE FROM github_oauth_states WHERE userId=@0", [
        userId,
      ]);
      await em.query("DELETE FROM github_connections WHERE userId=@0", [
        userId,
      ]);
    });
    return { disconnected: true };
  }
}
