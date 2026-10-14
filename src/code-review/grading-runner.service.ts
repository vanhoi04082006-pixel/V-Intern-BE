import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { boundedJson } from "../github/github-security";

export interface RunnerResult {
  status: "completed" | "not_configured" | "failed";
  passed: number;
  failed: number;
  summary: string;
  suiteId: string | null;
  suiteDigest: string | null;
}
interface Suite {
  id: string;
  digest: string;
}
@Injectable()
export class GradingRunnerService {
  constructor(private readonly config: ConfigService) {}
  async grade(input: {
    repository: string;
    headSha: string;
    baseSha: string;
    templateCode: string;
  }): Promise<RunnerResult> {
    const unavailable: RunnerResult = {
      status: "not_configured",
      passed: 0,
      failed: 0,
      summary:
        "Chưa có runner cách ly và bộ kiểm thử tin cậy cho mẫu dự án này.",
      suiteId: null,
      suiteDigest: null,
    };
    const url = this.config.get<string>("GRADING_RUNNER_URL"),
      token = this.config.get<string>("GRADING_RUNNER_TOKEN"),
      signingKey = this.config.get<string>("GRADING_RUNNER_SIGNING_KEY");
    if (!url || !token || !signingKey) return unavailable;
    try {
      const endpoint = new URL(url);
      if (
        endpoint.protocol !== "https:" &&
        !(
          this.config.get("NODE_ENV") !== "production" &&
          ["localhost", "127.0.0.1"].includes(endpoint.hostname) &&
          endpoint.protocol === "http:"
        )
      )
        throw new Error("Runner must use HTTPS.");
      const suites = JSON.parse(
        this.config.get<string>("GRADING_SUITES_JSON", "{}"),
      ) as Record<string, Suite>;
      const suite = suites[input.templateCode];
      if (
        !suite ||
        typeof suite.id !== "string" ||
        !/^[a-f0-9]{64}$/i.test(suite.digest)
      )
        return unavailable;
      const requestData = {
        ...input,
        suiteId: suite.id,
        suiteDigest: suite.digest,
        nonce: randomUUID(),
      };
      const requestHash = createHash("sha256")
        .update(JSON.stringify(requestData))
        .digest("hex");
      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...requestData, requestHash }),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Runner unavailable.");
      }
      const envelope = (await boundedJson(response, 64000)) as {
        payload?: Record<string, unknown>;
        signature?: string;
      };
      if (
        !envelope.payload ||
        typeof envelope.signature !== "string" ||
        !/^[a-f0-9]{64}$/i.test(envelope.signature)
      )
        throw new Error("Unsigned runner result.");
      const digest = createHmac("sha256", signingKey)
        .update(JSON.stringify(envelope.payload))
        .digest();
      if (!timingSafeEqual(digest, Buffer.from(envelope.signature, "hex")))
        throw new Error("Runner signature mismatch.");
      const p = envelope.payload;
      if (
        p.requestHash !== requestHash ||
        p.headSha !== input.headSha ||
        p.suiteId !== suite.id ||
        p.suiteDigest !== suite.digest ||
        p.status !== "completed" ||
        !Number.isSafeInteger(p.passed) ||
        !Number.isSafeInteger(p.failed) ||
        Number(p.passed) < 0 ||
        Number(p.failed) < 0 ||
        typeof p.summary !== "string" ||
        p.summary.length > 4000
      )
        throw new Error("Runner result not bound to this submission.");
      return {
        status: "completed",
        passed: Number(p.passed),
        failed: Number(p.failed),
        summary: p.summary,
        suiteId: suite.id,
        suiteDigest: suite.digest,
      };
    } catch {
      return {
        ...unavailable,
        status: "failed",
        summary: "Runner không trả được bằng chứng hợp lệ cho commit này.",
      };
    }
  }
}
