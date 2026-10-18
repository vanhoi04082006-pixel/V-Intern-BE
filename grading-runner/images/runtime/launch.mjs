import { spawnSync, spawn } from "node:child_process";
import { lstat, realpath, symlink } from "node:fs/promises";

// Extraction and all configuration/build code execute only inside the disposable student container.
const extract = spawnSync(
  "tar",
  [
    "-xzf",
    "/submission/source.tar.gz",
    "--strip-components=1",
    "--no-same-owner",
    "--no-same-permissions",
    "-C",
    "/work",
  ],
  { timeout: 10000, maxBuffer: 64000 },
);
if (extract.status !== 0) process.exit(1);
try {
  await lstat("/work/node_modules");
  process.exit(1);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await symlink("/opt/runtime/node_modules", "/work/node_modules", "dir");
const profile = process.argv[2] ?? 'vite';
if (!['vite', 'node-http'].includes(profile)) process.exit(1);
let executable = '/opt/runtime/node_modules/.bin/vite';
let args = ['--config', '/opt/runtime/vite.config.mjs', '--configLoader', 'runner', '--host', '0.0.0.0', '--port', '3000', '--strictPort'];
if (profile === 'node-http') {
  const entry = process.argv[3];
  if (typeof entry !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,199}\.(mjs|cjs|js)$/.test(entry)) process.exit(1);
  const resolved = await realpath('/work/' + entry);
  if (!resolved.startsWith('/work/') || !(await lstat(resolved)).isFile()) process.exit(1);
  executable = process.execPath; args = [resolved];
}
const child = spawn(
  executable,
  args,
  {
    cwd: "/work",
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      HOME: "/tmp",
      NODE_ENV: "test",
      PORT: '3000', HOST: '127.0.0.1',
      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: "student",
    },
  },
);
child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
