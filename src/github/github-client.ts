import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { boundedJson } from "./github-security";

export class GithubApiError extends ServiceUnavailableException {
  constructor(readonly upstreamStatus: number) {
    super({
      code:
        upstreamStatus === 401
          ? "GITHUB_RECONNECT_REQUIRED"
          : upstreamStatus === 403 || upstreamStatus === 429
            ? "GITHUB_RATE_OR_PERMISSION"
            : "GITHUB_API_UNAVAILABLE",
      message:
        "GitHub chưa thực hiện được yêu cầu. Kiểm tra kết nối/quyền và thử lại.",
    });
  }
}
@Injectable()
export class GithubClient {
  async call<T>(
    path: string,
    token: string,
    method = "GET",
    body?: object,
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || /[\r\n]/.test(path))
      throw new Error("Invalid GitHub API path.");
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "V-INTERN",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new GithubApiError(response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await boundedJson(response)) as T;
  }
}
