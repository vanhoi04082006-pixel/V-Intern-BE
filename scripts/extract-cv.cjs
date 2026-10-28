/* Isolated, bounded parser. Never evaluates document JS/macros or follows document URLs. */
"use strict";
const { XMLParser } = require("fast-xml-parser"),
  yauzl = require("yauzl");
const MAX = 120000;
async function docx(bytes) {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error) return reject(error);
        let total = 0,
          entries = 0,
          document,
          contentTypes = false;
        const fail = () => {
          zip.close();
          reject(Error("CV_CONTAINER_INVALID"));
        };
        zip.on("error", fail);
        zip.on("entry", (entry) => {
          if (
            ++entries > 256 ||
            (total += entry.uncompressedSize) > 20 * 1024 * 1024 ||
            entry.uncompressedSize > 5 * 1024 * 1024 ||
            entry.generalPurposeBitFlag & 1 ||
            /(?:^|\/)\.\.(?:\/|$)|\\|vbaProject|\.bin$/i.test(entry.fileName)
          )
            return fail();
          if (entry.fileName === "[Content_Types].xml") contentTypes = true;
          if (entry.fileName !== "word/document.xml") return zip.readEntry();
          if (document) return fail();
          zip.openReadStream(entry, (err, stream) => {
            if (err) return fail();
            let size = 0;
            const chunks = [];
            stream.on("error", fail);
            stream.on("data", (chunk) => {
              size += chunk.length;
              if (size > 5 * 1024 * 1024) {
                stream.destroy();
                fail();
              } else chunks.push(chunk);
            });
            stream.on("end", () => {
              document = Buffer.concat(chunks).toString("utf8");
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (
            !contentTypes ||
            !document ||
            /<!DOCTYPE|<!ENTITY/i.test(document)
          )
            return reject(Error("CV_CONTAINER_INVALID"));
          try {
            const parsed = new XMLParser({
              preserveOrder: true,
              ignoreAttributes: true,
              processEntities: false,
            }).parse(document);
            const segments = [];
            let chars = 0,
              paragraph = 0;
            function text(node) {
              if (Array.isArray(node)) return node.map(text).join("");
              if (node && typeof node === "object")
                return Object.entries(node)
                  .map(([key, value]) =>
                    key === "#text" ? String(value) : text(value),
                  )
                  .join("");
              return "";
            }
            function visit(nodes) {
              if (!Array.isArray(nodes)) return;
              for (const node of nodes)
                for (const [key, value] of Object.entries(node)) {
                  if (key === "w:p") {
                    const valueText = text(value).trim();
                    paragraph++;
                    chars += valueText.length;
                    if (chars > MAX || paragraph > 4000)
                      throw Error("CV_TEXT_LIMIT");
                    if (valueText)
                      segments.push({
                        ref: `paragraph:${paragraph}`,
                        text: valueText,
                      });
                  } else visit(value);
                }
            }
            visit(parsed);
            resolve(segments);
          } catch {
            reject(Error("CV_PARSE_FAILED"));
          }
        });
        zip.readEntry();
      },
    ),
  );
}
async function pdf(bytes) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    disableAutoFetch: true,
    disableStream: true,
    isOffscreenCanvasSupported: false,
    useWasm: false,
    enableXfa: false,
    verbosity: 0,
  });
  const document = await task.promise;
  const segments = [];
  let chars = 0;
  try {
    if (document.numPages > 100) throw Error("CV_PAGE_LIMIT");
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      if (content.items.length > 10000) throw Error("CV_TEXT_LIMIT");
      const text = content.items
        .map((item) =>
          typeof item.str === "string"
            ? item.str + (item.hasEOL ? "\n" : " ")
            : "",
        )
        .join("")
        .trim();
      if ((chars += text.length) > MAX) throw Error("CV_TEXT_LIMIT");
      if (text) segments.push({ ref: `page:${page}`, text });
    }
    return segments;
  } finally {
    await task.destroy();
  }
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > 8 * 1024 * 1024) process.exit(2);
});
process.stdin.on("end", async () => {
  try {
    const value = JSON.parse(input),
      bytes = Buffer.from(value.bytes, "base64");
    const segments = await (value.format === "pdf" ? pdf(bytes) : docx(bytes));
    process.stdout.write(JSON.stringify(segments));
  } catch {
    process.exitCode = 2;
  }
});
