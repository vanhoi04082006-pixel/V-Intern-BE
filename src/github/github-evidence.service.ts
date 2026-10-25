import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "crypto";
import { DataSource } from "typeorm";
import { GithubAuthService } from "./github-auth.service";
import { GithubClient } from "./github-client";
import { GithubRepositoriesService } from "./github-repositories.service";
import { parseGithubSource } from "./github-security";

interface PullRequest {
  user: { id: number };
  base: { sha: string; repo: { id: number } };
  head: { sha: string; repo: { full_name: string } };
  changed_files: number;
  state: string;
  merged: boolean;
}
interface Commit {
  sha: string;
  author: { id: number } | null;
}
interface RemoteFile {
  filename: string;
  sha: string;
  status: string;
  patch?: string;
}
export interface SubmissionSnapshot {
  headSha: string;
  baseSha: string;
  repositoryId: string | number;
  sourceKind: "pull" | "commit" | "branch";
  sourceRef: string;
  pullNumber: number | null;
}
export interface EvidenceFile {
  path: string;
  sha: string;
  content: string;
  patch: string;
  lineCount: number;
}
export interface CodeEvidence {
  headSha: string;
  baseSha: string;
  files: EvidenceFile[];
  complete: boolean;
  warnings: string[];
  checks: unknown[];
}
const SHA = /^[a-f0-9]{40}$/i;
const pathPart = encodeURIComponent;
const MAX_FILES = 20;

@Injectable()
export class GithubEvidenceService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: GithubAuthService,
    private readonly client: GithubClient,
    private readonly repos: GithubRepositoriesService,
  ) {}
  async isWorkflowTask(taskId: string): Promise<boolean> {
    const rows = await this.db.query(
      "SELECT TOP(1) tr.id FROM tasks t JOIN sprints sp ON sp.id=t.sprintId JOIN template_runs tr ON tr.sessionId=sp.sessionId AND tr.projectId=t.projectId WHERE t.id=@0",
      [taskId],
    );
    return rows.length > 0;
  }
  private async taskRepo(taskId: string) {
    const rows: Array<{ sessionId: string }> = await this.db.query(
      "SELECT sp.sessionId FROM tasks t JOIN sprints sp ON sp.id=t.sprintId WHERE t.id=@0 AND t.deletedAt IS NULL",
      [taskId],
    );
    const repo = rows[0] ? await this.repos.read(rows[0].sessionId) : null;
    if (!repo || repo.status !== "ready" || !repo.repoId || !repo.defaultBranch)
      throw new ConflictException({
        code: "SESSION_REPOSITORY_REQUIRED",
        message:
          "Repository của phiên chưa sẵn sàng. Admin cần kiểm tra tài khoản tạo repository chung.",
      });
    return repo;
  }
  async snapshot(
    taskId: string,
    internId: string,
    url: string,
    explicitRef?: string,
  ): Promise<SubmissionSnapshot> {
    const source = parseGithubSource(url, explicitRef),
      repo = await this.taskRepo(taskId);
    if (
      source.owner.toLowerCase() !== repo.ownerLogin.toLowerCase() ||
      source.repo.toLowerCase() !== repo.repoName.toLowerCase()
    )
      throw new BadRequestException(
        "Bài nộp phải thuộc repository của đúng phiên.",
      );
    const identity = await this.auth.connection(internId);
    if (!identity)
      throw new ConflictException({
        code: "GITHUB_IDENTITY_REQUIRED",
        message: "Sinh viên cần liên kết tài khoản GitHub trước khi nộp code.",
      });
    const { token } = await this.auth.token(repo.ownerUserId);
    const path = `/repos/${pathPart(repo.ownerLogin)}/${pathPart(repo.repoName)}`;
    const remote = await this.client.call<{ id: number }>(path, token);
    if (String(remote.id) !== String(repo.repoId))
      throw new ConflictException("Repository GitHub đã thay đổi.");
    let headSha: string, baseSha: string;
    if (source.kind === "pull") {
      const pr = await this.client.call<PullRequest>(
        `${path}/pulls/${source.pullNumber}`,
        token,
      );
      if (pr.state !== "open" || pr.merged)
        throw new BadRequestException(
          "Nộp pull request đang mở và chưa merge để review.",
        );
      if (
        String(pr.base.repo.id) !== String(repo.repoId) ||
        String(pr.user.id) !== String(identity.githubUserId)
      )
        throw new ForbiddenException(
          "PR phải thuộc phiên và do tài khoản GitHub đã liên kết của bạn tạo.",
        );
      headSha = pr.head.sha;
      baseSha = pr.base.sha;
    } else {
      const commit = await this.client.call<Commit>(
        `${path}/commits/${pathPart(source.ref)}`,
        token,
      );
      const base = await this.client.call<Commit>(
        `${path}/commits/${pathPart(repo.defaultBranch!)}`,
        token,
      );
      if (String(commit.author?.id) !== String(identity.githubUserId))
        throw new ForbiddenException(
          "Commit cuối phải gắn với danh tính GitHub của người nộp.",
        );
      headSha = commit.sha;
      baseSha = base.sha;
    }
    if (!SHA.test(headSha) || !SHA.test(baseSha) || headSha === baseSha)
      throw new BadRequestException(
        "Không có thay đổi code để chấm hoặc SHA không hợp lệ.",
      );
    return {
      headSha: headSha.toLowerCase(),
      baseSha: baseSha.toLowerCase(),
      repositoryId: repo.repoId!,
      sourceKind: source.kind,
      sourceRef: source.ref,
      pullNumber: source.pullNumber,
    };
  }
  async assertFresh(
    taskId: string,
    submission: SubmissionSnapshot,
  ): Promise<void> {
    const repo = await this.taskRepo(taskId);
    if (String(repo.repoId) !== String(submission.repositoryId))
      throw new ConflictException("Repository phiên đã thay đổi.");
    const { token } = await this.auth.token(repo.ownerUserId),
      path = `/repos/${pathPart(repo.ownerLogin)}/${pathPart(repo.repoName)}`;
    const remote = await this.client.call<{ id: number }>(path, token);
    if (String(remote.id) !== String(repo.repoId))
      throw new ConflictException("Repository GitHub không còn khớp phiên.");
    if (submission.sourceKind === "commit") {
      const commit = await this.client.call<Commit>(
        `${path}/commits/${submission.headSha}`,
        token,
      );
      if (commit.sha.toLowerCase() !== submission.headSha)
        throw new ConflictException("Commit không còn truy cập được.");
      return;
    }
    const live =
      submission.sourceKind === "pull"
        ? await this.client.call<PullRequest>(
            `${path}/pulls/${submission.pullNumber}`,
            token,
          )
        : await this.client.call<Commit>(
            `${path}/commits/${pathPart(submission.sourceRef)}`,
            token,
          );
    if (
      "head" in live &&
      (String(live.base.repo.id) !== String(repo.repoId) ||
        live.base.sha.toLowerCase() !== submission.baseSha.toLowerCase())
    )
      throw new ConflictException({
        code: "SUBMISSION_SHA_CHANGED",
        message:
          "Base của pull request đã thay đổi; cần nộp lại để kiểm tra đúng diff.",
      });
    const sha = "head" in live ? live.head.sha : live.sha;
    if (sha.toLowerCase() !== submission.headSha.toLowerCase())
      throw new ConflictException({
        code: "SUBMISSION_SHA_CHANGED",
        message:
          "Code đã thay đổi sau lúc nộp. Cần nộp hoặc chấm lại commit mới trước khi xác nhận.",
      });
  }
  async collect(
    taskId: string,
    submission: SubmissionSnapshot,
  ): Promise<CodeEvidence> {
    const repo = await this.taskRepo(taskId),
      { token } = await this.auth.token(repo.ownerUserId);
    await this.assertFresh(taskId, submission);
    const path = `/repos/${pathPart(repo.ownerLogin)}/${pathPart(repo.repoName)}`;
    const warnings: string[] = [];
    let headRepo = `${repo.ownerLogin}/${repo.repoName}`;
    if (submission.sourceKind === "pull") {
      const pr = await this.client.call<PullRequest>(
        `${path}/pulls/${submission.pullNumber}`,
        token,
      );
      if (
        pr.head.sha.toLowerCase() !== submission.headSha ||
        String(pr.base.repo.id) !== String(repo.repoId)
      )
        throw new ConflictException("Pull request đã thay đổi.");
      headRepo = pr.head.repo.full_name;
    }
    const compare = await this.client.call<{ files: RemoteFile[] }>(
      `${path}/compare/${submission.baseSha}...${submission.headSha}`,
      token,
    );
    const remoteFiles = compare.files;
    if (!Array.isArray(remoteFiles) || remoteFiles.length > MAX_FILES)
      warnings.push("Diff vượt giới hạn kiểm tra hoặc thiếu file.");
    if (!/^[\w.-]+\/[\w.-]+$/.test(headRepo))
      throw new ConflictException(
        "Không xác định được repository chứa commit.",
      );
    const [headOwner, headName] = headRepo.split("/");
    const files: EvidenceFile[] = [];
    let totalBytes = 0;
    const candidates = Array.isArray(remoteFiles)
      ? remoteFiles.slice(0, MAX_FILES)
      : [];
    for (let offset = 0; offset < candidates.length; offset += 4) {
      const results = await Promise.all(
        candidates
          .slice(offset, offset + 4)
          .map(async (file): Promise<EvidenceFile | null> => {
            if (
              typeof file.filename !== "string" ||
              !SHA.test(file.sha) ||
              file.filename.length > 512
            ) {
              warnings.push("Có file không hợp lệ.");
              return null;
            }
            if (
              /(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks)|id_rsa|id_ed25519)$/i.test(
                file.filename,
              )
            ) {
              warnings.push(
                `File chứa cấu hình/credential không được gửi AI: ${file.filename}`,
              );
              return null;
            }
            if (
              !/\.(?:tsx?|jsx?|cjs|mjs|json|css|html|md|sql|py|java|go|rs|ya?ml|sh|vue|svelte|txt)$/i.test(
                file.filename,
              ) &&
              !/(?:^|\/)(?:Dockerfile|Makefile|\.gitignore)$/.test(
                file.filename,
              )
            ) {
              warnings.push(`Chưa kiểm tra nội dung: ${file.filename}`);
              return null;
            }
            try {
              const blobRepo =
                file.status === "removed"
                  ? path
                  : `/repos/${pathPart(headOwner)}/${pathPart(headName)}`;
              const blob = await this.client.call<{
                content: string;
                encoding: string;
                size: number;
              }>(`${blobRepo}/git/blobs/${file.sha}`, token);
              if (
                blob.encoding !== "base64" ||
                blob.size > 30000 ||
                typeof blob.content !== "string"
              ) {
                warnings.push(
                  `File quá lớn hoặc không đọc được: ${file.filename}`,
                );
                return null;
              }
              const bytes = Buffer.from(blob.content, "base64");
              if (bytes.length !== blob.size) {
                warnings.push(`Kích thước file không khớp: ${file.filename}`);
                return null;
              }
              const content = new TextDecoder("utf-8", { fatal: true }).decode(
                bytes,
              );
              if (
                likelyCredential(content) ||
                likelyCredential(file.patch ?? "")
              ) {
                warnings.push(
                  `Đã loại file có dấu hiệu credential khỏi AI: ${file.filename}`,
                );
                return null;
              }
              if (!file.patch || file.patch.length > 30000)
                warnings.push(`Diff thiếu hoặc quá lớn: ${file.filename}`);
              return {
                path: file.filename,
                sha: file.sha,
                content,
                patch: (file.patch ?? "").slice(0, 30000),
                lineCount: content.split("\n").length,
              };
            } catch {
              warnings.push(`Không lấy được file: ${file.filename}`);
              return null;
            }
          }),
      );
      for (const file of results)
        if (file) {
          totalBytes += Buffer.byteLength(file.content);
          if (totalBytes <= 150000) files.push(file);
          else warnings.push("Tổng source vượt giới hạn ngữ cảnh.");
        }
    }
    if (!files.length)
      warnings.push("Không thu được source code có thể đánh giá.");
    let checks: unknown[] = [];
    try {
      const data = await this.client.call<{ check_runs: unknown[] }>(
        `${path}/commits/${submission.headSha}/check-runs?per_page=100`,
        token,
      );
      checks = Array.isArray(data.check_runs)
        ? data.check_runs.map((value) => {
            const c = value as {
              name?: unknown;
              status?: unknown;
              conclusion?: unknown;
            };
            return { name: c.name, status: c.status, conclusion: c.conclusion };
          })
        : [];
    } catch {
      warnings.push("Không lấy được trạng thái checks từ GitHub.");
    }
    await this.assertFresh(taskId, submission);
    return {
      headSha: submission.headSha,
      baseSha: submission.baseSha,
      files,
      complete: warnings.length === 0,
      warnings: [...new Set(warnings)],
      checks,
    };
  }
  evidenceSummary(e: CodeEvidence) {
    return {
      ...e,
      files: e.files.map(({ content, patch, ...file }) => ({
        ...file,
        contentHash: createHash("sha256").update(content).digest("hex"),
        patchHash: createHash("sha256").update(patch).digest("hex"),
      })),
    };
  }
}

function likelyCredential(text: string): boolean {
  return (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) ||
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,})\b/.test(
      text,
    ) ||
    /\b(?:api[_-]?key|password|secret|access[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*(?:['"][^'"\r\n]{8,}['"]|[^\s'"{},#][^\r\n#,}]{7,})/i.test(
      text,
    )
  );
}
