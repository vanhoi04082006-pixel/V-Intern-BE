import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CvSegment } from "./application-policy";
const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
@Injectable()
export class CvStorage {
  private activeParsers = 0;
  constructor(private readonly config: ConfigService) {}
  async extract(
    bytes: Buffer,
    mime: string,
    filename: string,
  ): Promise<{ format: "pdf" | "docx"; segments: CvSegment[] }> {
    const format = filename.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : filename.toLowerCase().endsWith(".docx")
        ? "docx"
        : null;
    if (
      !format ||
      mime !== MIME[format] ||
      bytes.length < 10 ||
      bytes.length > 5 * 1024 * 1024 ||
      (format === "pdf"
        ? !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
        : !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])))
    )
      throw new BadRequestException({
        code: "CV_FILE_INVALID",
        message: "Chỉ nhận PDF hoặc DOCX đúng định dạng, tối đa 5 MB.",
      });
    if (this.activeParsers >= 2)
      throw new ServiceUnavailableException({
        code: "CV_EXTRACTOR_BUSY",
        message: "Bộ đọc CV đang bận. Vui lòng chờ rồi gửi lại.",
      });
    this.activeParsers++;
    try {
      const segments = await new Promise<CvSegment[]>(
        (resolveResult, reject) => {
          const process = spawn(
            global.process.execPath,
            [
              "--max-old-space-size=128",
              join(global.process.cwd(), "scripts", "extract-cv.cjs"),
            ],
            { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
          );
          let result = "",
            settled = false;
          const fail = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            process.kill();
            reject(
              new BadRequestException({
                code: "CV_EXTRACTION_FAILED",
                message:
                  "Không đọc được CV hoặc tài liệu vượt giới hạn. Hãy xuất lại PDF có văn bản hoặc DOCX.",
              }),
            );
          };
          const timer = setTimeout(fail, 20000);
          timer.unref();
          process.on("error", fail);
          process.stdin.on("error", fail);
          process.stderr.on("data", () => undefined);
          process.stdout.on("data", (bytes) => {
            result += bytes.toString();
            if (Buffer.byteLength(result) > 512000) fail();
          });
          process.on("close", (code) => {
            if (settled) return;
            if (code !== 0) return fail();
            try {
              const parsed: unknown = JSON.parse(result);
              if (
                !Array.isArray(parsed) ||
                parsed.some(
                  (s) =>
                    !s ||
                    typeof s.ref !== "string" ||
                    typeof s.text !== "string",
                )
              )
                return fail();
              settled = true;
              clearTimeout(timer);
              resolveResult(parsed);
            } catch {
              fail();
            }
          });
          process.stdin.end(
            JSON.stringify({ format, bytes: bytes.toString("base64") }),
          );
        },
      );
      return { format, segments };
    } finally {
      this.activeParsers--;
    }
  }
  private async directory() {
    const workspace = resolve(global.process.cwd(), ".runtime"),
      root = resolve(
        this.config.get<string>("CV_STORAGE_DIR", "").trim() ||
          join(workspace, "cv"),
      );
    // Project deployment may configure a project root, never an arbitrary C: upload directory.
    const allowed = resolve(
      this.config.get<string>("PROJECT_STORAGE_ROOT", global.process.cwd()),
    );
    const rel = relative(allowed, root);
    if (!rel || rel.startsWith("..") || isAbsolute(rel))
      throw Error("CV_STORAGE_OUTSIDE_PROJECT");
    await mkdir(root, { recursive: true });
    const actual = await realpath(root),
      resolvedAllowed = await realpath(allowed),
      actualRel = relative(resolvedAllowed, actual);
    if (
      (await lstat(root)).isSymbolicLink() ||
      !actualRel ||
      actualRel.startsWith("..") ||
      isAbsolute(actualRel)
    )
      throw Error("CV_STORAGE_OUTSIDE_PROJECT");
    return actual;
  }
  async save(bytes: Buffer) {
    const id = randomUUID(),
      directory = await this.directory();
    await writeFile(join(directory, id), bytes, { flag: "wx", mode: 0o600 });
    return { id, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  private async path(id: string) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error("CV_ID_INVALID");
    const path = join(await this.directory(), id.toLowerCase());
    if ((await lstat(path)).isSymbolicLink()) throw Error("CV_LINK_INVALID");
    return path;
  }
  async read(id: string) {
    return readFile(await this.path(id));
  }
  async remove(id: string) {
    await unlink(await this.path(id));
  }
}
