import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";

function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32)
    throw new ServiceUnavailableException({
      code: "GITHUB_NOT_CONFIGURED",
      message: "Cần khóa mã hóa GitHub 32 byte (base64) ở server.",
    });
  return key;
}
export function sealToken(
  value: string,
  secret: string,
  context: string,
): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function openToken(
  value: string,
  secret: string,
  context: string,
): string {
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra)
    throw new Error("Invalid encrypted credential.");
  if (
    [iv, tag, ciphertext].some(
      (part) => Buffer.from(part, "base64url").toString("base64url") !== part,
    )
  )
    throw new Error("Non-canonical encrypted credential.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export interface GithubSource {
  owner: string;
  repo: string;
  kind: "pull" | "commit" | "branch";
  pullNumber: number | null;
  ref: string;
  url: string;
}
export function parseGithubSource(
  value: string,
  explicitRef?: string,
): GithubSource {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new BadRequestException("Link GitHub không hợp lệ.");
  }
  if (
    u.protocol !== "https:" ||
    u.hostname !== "github.com" ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new BadRequestException(
      "Chỉ nhận link HTTPS github.com không có query hoặc thông tin đăng nhập.",
    );
  const parts = u.pathname.replace(/\/$/, "").split("/").slice(1);
  const [owner, repo, type, ...tail] = parts;
  if (
    !/^[a-zA-Z0-9-]{1,39}$/.test(owner ?? "") ||
    !/^[a-zA-Z0-9][\w.-]{0,99}$/.test(repo ?? "")
  )
    throw new BadRequestException("Owner/repository không hợp lệ.");
  if (type === "pull" && tail.length === 1 && /^[1-9]\d{0,8}$/.test(tail[0]))
    return {
      owner,
      repo,
      kind: "pull",
      pullNumber: Number(tail[0]),
      ref: tail[0],
      url: u.href,
    };
  if (
    type === "commit" &&
    tail.length === 1 &&
    /^[a-fA-F0-9]{40}$/.test(tail[0])
  )
    return {
      owner,
      repo,
      kind: "commit",
      pullNumber: null,
      ref: tail[0].toLowerCase(),
      url: u.href,
    };
  let ref: string;
  try {
    ref =
      type === "tree" && tail.length
        ? decodeURIComponent(tail.join("/"))
        : !type
          ? (explicitRef ?? "")
          : "";
  } catch {
    ref = "";
  }
  if (
    !ref ||
    ref.length > 200 ||
    /[\x00-\x20~^:?*\[\\]/.test(ref) ||
    ref.includes("..") ||
    ref.startsWith("/") ||
    ref.endsWith("/")
  )
    throw new BadRequestException(
      "Link repository cần branch/ref rõ ràng; commit cần SHA đầy đủ 40 ký tự.",
    );
  return { owner, repo, kind: "branch", pullNumber: null, ref, url: u.href };
}

export async function boundedJson(
  response: Response,
  maxBytes = 2_000_000,
): Promise<unknown> {
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
    throw new Error("Upstream response is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty upstream response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maxBytes) throw new Error("Upstream response is too large.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
