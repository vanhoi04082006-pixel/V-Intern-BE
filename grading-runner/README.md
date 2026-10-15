# Isolated grading worker

Node 22 service for a **separate Linux Docker host**, outside the API/database host. It downloads public GitHub source at the exact submitted commit, runs the app and trusted acceptance tests in two separate containers, and signs results outside both containers. The service itself has no external Node dependencies.

## Files and boundaries

- `server.mjs`: authenticated `/grade`, one active job, bounded requests, replay protection and HMAC. Infrastructure errors return503 without a signed pass.
- Signed results include measured execution time, a deterministic test score and each trusted check's name/outcome/bounded diagnostic. The server cross-checks counts before signing; backend validates all fields and preserves them in review evidence. Raw student output does not become trusted logs.
- `docker-worker.mjs`: fixed codeload GitHub HTTPS, immutable SHA, 20MiB maximum archive, no host extraction, loopback-only network namespace, verified cleanup after success/failure.
- `images/runtime`: React/Vite or native Node HTTP with locked preinstalled dependencies, trusted launcher/config and source extracted only into container tmpfs. Student install scripts are not used. Other dependencies require a reviewed runtime image.
- `images/tester`: independent HTTP/Playwright checker, no student filesystem mounts. It receives instructor checks on stdin and calculates counts itself. Neither student stdout nor student-authored tests supply authoritative counts.
- `suites`: Notes foundation/persistence and Tasks API CRUD/validation/ownership acceptance checks. They are opt-in contracts agreed with students before work starts; select only checks that match the individual task's criteria.

Containers use a read-only root, non-root UID, dropped capabilities, no-new-privileges, CPU/RAM/PID/output/deadline limits, private shared memory and bounded tmpfs. The app starts with `--network none`; the tester joins that app's loopback-only namespace with `--network container:...` and connects to127.0.0.1:3000. There is no bridge, host gateway, Internet or published port. Outer container isolation applies; there is no host IPC, privileged mode, secret, or Docker socket in either container. Keep the worker daemon on a dedicated patched host; the service's daemon access remains privileged infrastructure. These flags follow the official [none driver](https://docs.docker.com/engine/network/drivers/none/) and [shared namespace](https://docs.docker.com/engine/network/) contracts; Docker smoke still must validate the deployment.

## Build and verify

Run `npm test` here. On Linux, review digest-pinned base images and build:

A new dedicated Ubuntu24.04/amd64 worker can install Docker Engine from its signed official apt repository and checksum-verified Node22 using `sh provision-ubuntu.sh` as root. This script is for that worker only; it does not install Docker Desktop or change the Windows API host. `sh build-and-smoke.sh` then builds the reviewed image definitions and checks valid/broken fixtures. Production image digests still require review.

```sh
docker build --build-arg NODE_IMAGE='node@sha256:<reviewed-digest>' -t vintern-runtime images/runtime
docker build --build-arg NODE_IMAGE='node@sha256:<reviewed-digest>' -t vintern-tester images/tester
docker image inspect vintern-runtime --format '{{.Id}}'
docker image inspect vintern-tester --format '{{.Id}}'
```

Set `RUNTIME_IMAGE` and `TESTER_IMAGE` to these immutable local `sha256:...` IDs, or pinned registry manifests. Run `node test/docker-smoke.mjs`. It must pass a correct fixture and reject broken empty-title validation. No student code executes on the host. The dedicated GitHub Actions workflow runs the same smoke on disposable Ubuntu with no application secrets. Its fixture base resolution does not approve production image changes. Image lockfiles and `npm ci --ignore-scripts` prevent dependency/install-script drift.

## Bind to a real task

Export the raw specification object from authenticated `GET /api/v1/tasks/:id/spec/source` into private `task-spec.json`, removing any API envelope. This endpoint checks the same task access as the display endpoint. Preserve key order: the adapter hashes `JSON.stringify` of the persisted object. Do not seal the `/spec` display response: it enriches dependencies with live status and adds `blocked`, so it has a different hash and changes as prerequisites finish. Choose checks for that task's agreed criteria; do not apply a whole-project suite to an early task.

Private operator plan example:

```json
[{"id":"notes-foundation-reviewed-v1","templateCode":"LEARN-NOTES-V1","repository":"https://github.com/INSTRUCTOR/SESSION-REPO","taskId":"REAL-TASK-UUID","specFile":"task-spec.json","checksFile":"/absolute/path/to/suites/notes-foundation.json","runtimeImage":"sha256:IMAGE-ID","testerImage":"sha256:IMAGE-ID","command":["node","/runner/launch.mjs"]}]
```

Generate configuration with `node prepare-catalog.mjs /private/operator-plan.json > /private/generated.json`. Save `generated.catalog` as runner catalog JSON and set backend `GRADING_SUITES_JSON` to `generated.backendSuites`. Keys are **`templateCode:taskId`**. The suite digest covers exact repository, task, spec hash, immutable images, command and all checks. Changed requirements/checks require review and regeneration. No matching task suite means no automatic pass.

Notes selector contract (`data-testid`): `note-new`, `note-title`, `note-content`, `note-save`, `note-error`, `note-card`, `note-edit`. Supplied empty-title checks expect the word `title`; localize the trusted check with the agreed UI before sealing its digest. Each browser check starts with clean storage at390px. Actions: fill/click/press/reload/text/count/value; no evaluated plan code. HTTP checks support path/method/body/status and top-level `jsonIncludes`. Other templates need reviewed acceptance suites and compatible runtime images. Student Actions/tests remain supplementary.

### Backend API contract

For a native Node HTTP application use command `["node","/runner/launch.mjs","node-http","server.mjs"]`. The reviewed launcher resolves a real regular file inside `/work`, refuses traversal/symlinks outside it, and starts Node with only test env plus PORT=3000/HOST=127.0.0.1. It runs inside the same restricted student container, never on the host. This profile supports built-in Node modules and preinstalled reviewed dependencies; it does not install packages, launch arbitrary project scripts, supply external SQL access or imply every framework is supported. A compiled Node entry or another dependency set requires a reviewed image/entry contract.

`suites/tasks-api.json` specifies `/api/register` and `/api/tasks`: unique registration returns `{id,token}` without password/hash; Bearer authorization; 401 unauthenticated, 422 invalid input, 409 duplicate email, 404 foreign/missing task; create/read/update/delete and own list `{items,total}`. Four checks cover validation, normal CRUD, a second account's read/write/delete denial, and owner deletion followed by new reads. They do not verify password hashing, durable storage across process restart or a particular database engine; add separate reviewed checks for those requirements. The owned fixture exists only to prove that the grader distinguishes valid behavior from removed validation or removed ownership.

API checks use `kind:"api"` with at most20 HTTP steps. Each step has path/method/status, optional JSON body, bearer, jsonIncludes (dot-path keys), jsonAbsent (top-level keys), and capture `{variable:"response.path"}`. Captures accept bounded primitive values; `{{variable}}` substitutes exact typed values in bodies/assertions, URL-encodes path values and preserves one random `{{nonce}}` per check. Variables never cross checks. The checker enforces the student origin, denies redirects, limits responses to256KiB and bounds each request to3seconds. Captured credentials stay in the independent tester's memory and are not returned in logs. No plan-supplied JavaScript is evaluated.

Browser step values may contain `{{nonce}}`, replaced by a fresh random value for each check. Supplied Notes suites use this to avoid fixed demonstration titles being mistaken for implemented behavior. Browser assertions wait up to5s per action, within the85s total worker deadline; missing behavior still fails.

## Deploy

Inject two different random credentials (at least32characters) using the host secret manager: `GRADING_RUNNER_TOKEN`, `GRADING_RUNNER_SIGNING_KEY`. Configure the same values privately in the API. Set `RUNNER_CATALOG_PATH` to the catalog file. `HOST=127.0.0.1 PORT=8090 node server.mjs` starts only when Docker confirms Linux. Keep8090private, use a restricted HTTPS reverse proxy with response timeout above120s, and set BE `GRADING_RUNNER_URL=https://your-private-worker/grade`. Do not expose the Docker daemon or raw worker API to students. OAuth/repo ownership remains with each instructor's linked GitHub account.

## Verification boundary

On2026-10-16,16runner tests passed on both Windows and WSL. A dedicated Ubuntu24.04.5 WSL2 environment `VIntern-Grader` runs Docker29.9.0 and Node22.23.3, with Windows drive automount/interop disabled. Real Docker smoke passed Notes2/2 and rejected broken validation1/2; Tasks API4/4, removed validation3/4, removed ownership3/4. The compiled Windows BE adapter verified signed per-check results, measured time and score100/50 through HTTP/HMAC using real app/test containers under the worker service user.

Live acceptance subsequently used two actual GitHub identities, an instructor-owned public repository and a student-authored PR. The service downloaded immutable commits through GitHub codeload: broken validation failed1/2, corrected source passed2/2. A reviewed foundation-task binding was sealed against its persisted specification. Real Gemini feedback and instructor approval completed the application flow; this remains an owned synthetic integration fixture. The service test found and fixed UMask0077 masking archive0444 to0400: explicit chmod restores sandbox read access while its opaque directory remains0700 and bind mount read-only. See [live evidence](../../docs/GITHUB-LIVE-ACCEPTANCE.md). Remote GitHub CI has not run.

The local systemd unit is `vintern-grader.service`; secrets are root-readable `/etc/vintern-grader.env`, with catalog `/etc/vintern-grader-catalog.json`. `TMPDIR=/var/lib/vintern-grader/tmp` keeps opaque bind-mounted archives visible to the Docker daemon even with `PrivateTmp=true`. Startup/stop cleanup removes only labelled worker containers and owned archive files. Windows starts the local worker using `scripts/start-grading-worker.ps1` from the BE repository: keep that terminal open so WSL stays alive. Local service transport is localhost:8090; production requires a separate worker host and HTTPS. The current catalog contains one approved QA task; other tasks require their own reviewed bindings.
