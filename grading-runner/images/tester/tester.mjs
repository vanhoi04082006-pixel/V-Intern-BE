import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

// No student files, imports, test scripts, tokens or signing keys enter this container.
export async function runChecks(
  checks,
  { base = "http://127.0.0.1:3000", browserType, onFailure = () => {} } = {},
) {
  function target(relative) {
    const url = new URL(relative, base);
    if (url.origin !== base) throw Error("Test URL outside student app");
    return url.href;
  }
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(base, {
        redirect: "error",
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw Error("Student app did not start");
  let browser;
  const results = [];
  try {
    for (const check of checks) {
      try {
        if (check.kind === "http") {
          const response = await fetch(target(check.path), {
            method: check.method ?? "GET",
            redirect: "error",
            signal: AbortSignal.timeout(3000),
            headers: { "Content-Type": "application/json" },
            ...(check.body === undefined
              ? {}
              : { body: JSON.stringify(check.body) }),
          });
          assert.equal(response.status, check.status);
          if (check.jsonIncludes) {
            const json = await response.json();
            for (const [key, expected] of Object.entries(check.jsonIncludes))
              assert.deepEqual(json[key], expected);
          }
          await response.body?.cancel().catch(() => {});
        } else if (check.kind === "browser") {
          browserType ??= (await import("playwright")).chromium;
          browser ??= await browserType.launch({
            args: ["--disable-dev-shm-usage"],
          });
          const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            acceptDownloads: true,
          });
          try {
            await context.route("**/*", (route) => {
              const url = new URL(route.request().url());
              return url.origin === base ? route.continue() : route.abort();
            });
            const page = await context.newPage();
            page.setDefaultTimeout(5000);
            const errors = [];
            page.on("pageerror", (e) => errors.push(e.message));
            page.on("dialog", (dialog) =>
              check.dialog === "accept" ? dialog.accept() : dialog.dismiss(),
            );
            await page.goto(base, { timeout: 5000 });
            const runNonce = randomUUID();
            for (const sourceStep of check.steps) {
              const step = {
                ...sourceStep,
                value:
                  typeof sourceStep.value === "string"
                    ? sourceStep.value.replaceAll("{{nonce}}", runNonce)
                    : sourceStep.value,
              };
              const locator = step.testId
                ? page.getByTestId(step.testId)
                : null;
              switch (step.action) {
                case "fill":
                  await locator.fill(step.value);
                  break;
                case "click":
                  await locator.click();
                  break;
                case "reload":
                  await page.reload({ timeout: 5000 });
                  break;
                case "text":
                  await locator
                    .filter({ hasText: step.value })
                    .waitFor({ state: "visible" });
                  break;
                case "count":
                  assert.equal(await locator.count(), step.value);
                  break;
                case "value":
                  assert.equal(await locator.inputValue(), step.value);
                  break;
                case "press":
                  await locator.press(step.value);
                  break;
                default:
                  throw Error("Unknown trusted test action");
              }
            }
            assert.equal(errors.length, 0, "Uncaught browser errors");
          } finally {
            await context.close();
          }
        } else throw Error("Unknown trusted check type");
        results.push({ passed: true });
      } catch (error) {
        onFailure(check.name, error);
        results.push({ passed: false });
      }
    }
  } finally {
    await browser?.close();
  }
  return { results };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 100000) throw Error("Suite too large");
  }
  process.stdout.write(
    JSON.stringify(await runChecks(JSON.parse(input).checks)),
  );
}
