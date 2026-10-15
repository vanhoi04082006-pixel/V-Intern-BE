import { readdir, realpath, lstat, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { docker } from "./docker-worker.mjs";

export async function cleanupContainers(execute = docker) {
  const query = [
    "ps",
    "--all",
    "--quiet",
    "--filter",
    "label=io.vintern.grading=true",
  ];
  // Stop tester dependants before app namespaces. Retry handles daemon-dependent removal ordering.
  for (let attempt = 0; attempt < 2; attempt++) {
    const ids = (await execute(query, { timeout: 5000 }))
      .split(/\s+/)
      .filter(Boolean);
    if (!ids.length) return;
    if (ids.length > 1000 || ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id)))
      throw Error("Invalid owned container inventory");
    await execute(["rm", "--force", ...ids], { timeout: 10000 }).catch(
      () => {},
    );
  }
  if (await execute(query, { timeout: 5000 }))
    throw Error("Owned containers remain after cleanup");
}

async function cleanupArchives() {
  if (!process.getuid) return;
  const root = await realpath(tmpdir());
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !/^vintern-grade-[A-Za-z0-9]{6}$/.test(entry.name)
    )
      continue;
    const directory = await realpath(path.join(root, entry.name));
    if (
      path.dirname(directory) !== root ||
      (await lstat(directory)).uid !== process.getuid()
    )
      continue;
    const files = await readdir(directory);
    // Delete only our opaque archive, never recurse through unknown files/symlinks.
    if (files.some((name) => name !== "source.tar.gz")) continue;
    if (files.length) {
      const source = path.join(directory, "source.tar.gz");
      if (!(await lstat(source)).isFile()) continue;
      await unlink(source);
    }
    await rmdir(directory);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await cleanupContainers();
  await cleanupArchives();
}
