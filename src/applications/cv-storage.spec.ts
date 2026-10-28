import { CvStorage } from "./cv-storage";
import { ConfigService } from "@nestjs/config";
describe("private CV intake", () => {
  const storage = new CvStorage(new ConfigService());
  it("rejects oversize, unsupported MIME, disguised file and unsafe format before parsing", async () => {
    for (const [buffer, mime, name] of [
      [Buffer.alloc(5 * 1024 * 1024 + 1), "application/pdf", "cv.pdf"],
      [Buffer.from("<script>bad</script>"), "application/pdf", "cv.pdf"],
      [Buffer.from("%PDF-1.7\n"), "image/png", "cv.pdf"],
      [
        Buffer.from("PK\x03\x04not-docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cv.docm",
      ],
    ] as const)
      await expect(storage.extract(buffer, mime, name)).rejects.toThrow();
  });
  it("does not accept malformed PDF as readable evidence", async () => {
    await expect(
      storage.extract(
        Buffer.from("%PDF-1.7\nmalformed"),
        "application/pdf",
        "cv.pdf",
      ),
    ).rejects.toThrow();
  });
  it("bounds concurrent parsers instead of spawning an unbounded number of processes", async () => {
    const bytes = Buffer.from("%PDF-1.7\nmalformed");
    const one = storage
      .extract(bytes, "application/pdf", "cv.pdf")
      .catch((error) => error);
    const two = storage
      .extract(bytes, "application/pdf", "cv.pdf")
      .catch((error) => error);
    await expect(
      storage.extract(bytes, "application/pdf", "cv.pdf"),
    ).rejects.toMatchObject({ response: { code: "CV_EXTRACTOR_BUSY" } });
    await Promise.allSettled([one, two]);
  });
});
