import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

async function load(entry, plugins = []) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}

const snapshot = (
  id,
  environment = "default",
  revision = 0,
  checkedAt = "2026-10-06T12:00:00Z",
) => ({
  project: { id },
  environment,
  progress: { revision },
  assembly: { revision },
  checkedAt,
});

test("user scope changes reject late snapshots but idle Codex notifications can select another project", async () => {
  const { SnapshotGate } = await load(
    "apps/control-panel/src/snapshot-gate.ts",
  );
  const gate = new SnapshotGate();
  assert.equal(gate.accept(snapshot("a"), "initial"), true);
  const slow = gate.begin();
  const fast = gate.begin();
  assert.equal(gate.accept(snapshot("a", "default", 3), "notification"), false);
  assert.equal(gate.accept(snapshot("b", "preview"), fast), true);
  gate.finish(slow);
  assert.equal(
    gate.accept(snapshot("a"), "notification"),
    false,
    "An obsolete completion cannot clear the pending current selection",
  );
  gate.finish(fast);
  assert.equal(
    gate.accept(
      snapshot("a", "default", 0, "2026-10-06T11:00:00Z"),
      "notification",
    ),
    false,
    "Late older-scope notifications cannot revert the completed selection",
  );
  assert.equal(gate.accept(snapshot("a"), slow), false);
  assert.equal(gate.accept(snapshot("a"), "initial"), false);
  assert.equal(gate.accept(snapshot("b", "preview", 2), "notification"), true);
  assert.equal(
    gate.accept(
      snapshot("b", "preview", 1, "2026-10-06T13:00:00Z"),
      "notification",
    ),
    false,
    "Older canonical progress cannot replace newer evidence",
  );
  assert.equal(
    gate.accept(
      snapshot("b", "preview", 2, "2026-10-06T11:00:00Z"),
      "notification",
    ),
    false,
  );
  assert.equal(
    gate.accept(snapshot("c", "production"), "notification"),
    true,
    "Intentional Codex selection remains possible when no UI read is pending",
  );
  const initial = new SnapshotGate();
  assert.equal(initial.accept(snapshot("c"), "notification"), true);
  assert.equal(
    initial.accept(snapshot("a"), "initial"),
    false,
    "Late startup read cannot undo a Codex notification",
  );
});

test("a slow older-scope snapshot cannot override a newer selection merely by finishing later", async () => {
  const { SnapshotGate } = await load("apps/control-panel/src/snapshot-gate.ts");
  const gate = new SnapshotGate();
  const scoped = (id, startedAt, checkedAt) => ({ ...snapshot(id, "default", 0, checkedAt), startedAt });
  gate.accept(scoped("a", "2026-10-06T12:00:00Z", "2026-10-06T12:00:00Z"), "initial");
  const selected = gate.begin();
  assert.equal(gate.accept(scoped("b", "2026-10-06T12:00:02Z", "2026-10-06T12:00:03Z"), selected), true);
  gate.finish(selected);
  assert.equal(gate.accept(scoped("a", "2026-10-06T12:00:01Z", "2026-10-06T12:00:09Z"), "notification"), false, "Earlier work can finish after the user selection");
  assert.equal(gate.accept(scoped("c", "2026-10-06T12:00:10Z", "2026-10-06T12:00:11Z"), "notification"), true, "A genuinely newer Codex selection remains possible");
  assert.equal(gate.accept(scoped("c", "2026-10-06T12:00:09Z", "2026-10-06T12:00:12Z"), "notification"), false, "Same-scope stale reads cannot win by completion order");
});

test("host-denied messages and links reject instead of reporting successful submission", async () => {
  const before = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { parent: {} };
  globalThis.document = { documentElement: { classList: { toggle() {} } } };
  const mocks = {
    name: "mock-host",
    setup(builder) {
      builder.onResolve(
        {
          filter:
            /^@modelcontextprotocol\/ext-apps$|^@openai\/mcp-extensions\/app$/,
        },
        (args) => ({ path: args.path, namespace: "host" }),
      );
      builder.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({
        loader: "js",
        contents: args.path.startsWith("@openai")
          ? "export class OpenAIExtensions {}"
          : `export class App { constructor() { globalThis.__auditHost = this; } sendMessage() { return Promise.resolve(globalThis.__auditReply); } openLink() { return Promise.resolve(globalThis.__auditReply); } } export function applyDocumentTheme() {} export function applyHostStyleVariables() {}`,
      }));
    },
  };
  try {
    const { ask, openApp } = await load("apps/control-panel/src/bridge.ts", [
      mocks,
    ]);
    globalThis.__auditReply = { isError: true };
    await assert.rejects(ask("Build my app"), /host rejected/);
    await assert.rejects(openApp("https://example.com"), /host rejected/);
    globalThis.__auditReply = {};
    assert.equal(await ask("Build my app"), "Sent to the conversation.");
    await openApp("https://example.com");
    await assert.rejects(openApp("javascript:alert(1)"), /Invalid app URL/);
    await assert.rejects(
      openApp("https://user:password@example.com"),
      /Invalid app URL/,
    );
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    delete globalThis.__auditHost;
    delete globalThis.__auditReply;
  }
});

test("discovery attention distinguishes failed required access from a working scoped alternative route", async () => {
  const { discoveryAttention } = await load("src/progress-view.ts");
  const record = (fields = {}) => ({
    provider: "cloudflare",
    route: "cli",
    check: "authorized",
    accountRef: "account-a",
    outcome: "failed",
    source: "agent",
    stale: false,
    ...fields,
  });
  const failed = record();
  assert.deepEqual(discoveryAttention([failed]), [failed]);
  assert.deepEqual(
    discoveryAttention([failed, record({ route: "api", outcome: "passed" })]),
    [],
  );
  assert.deepEqual(
    discoveryAttention([
      failed,
      record({ route: "api", outcome: "passed", accountRef: "account-b" }),
    ]),
    [failed],
  );
  assert.deepEqual(
    discoveryAttention([
      failed,
      record({ route: "api", outcome: "passed", stale: true }),
    ]),
    [failed],
  );
  assert.deepEqual(
    discoveryAttention([
      failed,
      record({ route: "plugin", outcome: "passed", check: "callable" }),
    ]),
    [failed],
    "Callable does not prove account access",
  );
  const independent = record({ source: "independent" });
  assert.deepEqual(
    discoveryAttention([
      independent,
      record({ route: "api", outcome: "passed" }),
    ]),
    [independent],
    "Agent claims cannot dismiss independent failures",
  );
  const integration = record({ check: "integration-tested" });
  assert.deepEqual(
    discoveryAttention([
      integration,
      record({ route: "api", outcome: "passed" }),
    ]),
    [integration],
    "Authorization does not prove integration behavior",
  );
  assert.deepEqual(discoveryAttention([record({ stale: true })]), []);
});
