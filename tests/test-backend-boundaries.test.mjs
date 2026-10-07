import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  registerProject,
  snapshot,
  updateSettings,
} from "../.artifacts/control-panel/status.js";
import {
  reportProjectProgress,
  validateProgressReport,
} from "../dist/progress.js";

const accounts = ["a", "b", "c"].map((character) => character.repeat(32));
function project(root, app, account, additions = {}) {
  const folder = app ? path.join(root, "apps", app) : root;
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, "wrangler.json"),
    JSON.stringify({
      name: app || "standalone",
      account_id: account,
      ...additions,
    }),
  );
}

test("inventory preserves distinct accounts and Durable Object namespaces while deduplicating truly shared resources", async () => {
  const temporary = mkdtempSync(
    path.join(tmpdir(), "anhedral-inventory-audit-"),
  );
  const previous = { ...process.env };
  try {
    process.env.ANHEDRAL_STATE_DIR = path.join(temporary, "state");
    delete process.env.ANHEDRAL_PROJECT_ROOTS;
    delete process.env.CLOUDFLARE_API_TOKEN;
    const root = path.join(temporary, "app");
    const bindings = {
      r2_buckets: [{ binding: "FILES", bucket_name: "same-name" }],
      durable_objects: { bindings: [{ name: "ROOM", class_name: "Room" }] },
    };
    project(root, "api", accounts[0], bindings);
    project(root, "realtime", accounts[1], bindings);
    writeFileSync(path.join(root, "package.json"), "{}");
    const registered = registerProject(root);
    let result = await snapshot(registered.id);
    assert.equal(
      result.resources.length,
      6,
      "Account collisions must not erase resources",
    );
    assert.equal(
      new Set(result.resources.map((resource) => resource.id)).size,
      6,
    );
    assert.ok(
      result.resources.every((resource) => resource.status === "error"),
      "Ambiguous account selection is explicit even without credentials",
    );
    const ids = result.resources.map((resource) => resource.id);
    assert.deepEqual(
      (await snapshot(registered.id)).resources.map((resource) => resource.id),
      ids,
      "Scoped IDs are stable",
    );
    project(root, "realtime", accounts[0], bindings);
    result = await snapshot(registered.id);
    assert.equal(
      result.resources.filter((resource) => resource.kind === "R2 bucket")
        .length,
      1,
      "Same account bucket is one resource",
    );
    assert.equal(
      result.resources.filter((resource) => resource.kind === "Durable Object")
        .length,
      2,
      "Local DO classes belong to separate worker namespaces",
    );
    assert.equal(
      result.resources.find((resource) => resource.kind === "R2 bucket").id,
      "R2 bucket:same-name",
      "Unambiguous saved IDs remain compatible",
    );
    updateSettings(registered.id, "default", {
      cloudflareAccountId: accounts[2],
    });
    assert.ok(
      (await snapshot(registered.id, "default", true)).resources.every(
        (resource) => resource.status === "error",
      ),
      "Known scope mismatch cannot appear configured when no API token exists",
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("named environments inherit worker names but not default resource bindings", async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "anhedral-env-inventory-"));
  const previous = { ...process.env };
  try {
    process.env.ANHEDRAL_STATE_DIR = path.join(temporary, "state");
    delete process.env.ANHEDRAL_PROJECT_ROOTS;
    const root = path.join(temporary, "app");
    project(root, "", accounts[0], {
      r2_buckets: [{ bucket_name: "default-only" }],
      triggers: { crons: ["* * * * *"] },
      env: {
        staging: {},
        production: { name: "explicit-production", triggers: { crons: [] } },
      },
    });
    writeFileSync(path.join(root, "package.json"), "{}");
    const registered = registerProject(root);
    const staging = await snapshot(registered.id, "staging");
    assert.equal(staging.resources.length, 2);
    assert.equal(
      staging.resources.filter((resource) => resource.kind === "Schedule")
        .length,
      1,
      "Named environments inherit Cron triggers",
    );
    assert.equal(staging.resources[0].name, "standalone-staging");
    const production = await snapshot(registered.id, "production");
    assert.equal(production.resources[0].name, "explicit-production");
    assert.equal(
      production.resources.length,
      1,
      "Explicit empty Cron configuration disables inherited schedules without inheriting default bindings",
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("CLI and MCP share environment visibility and reject secret-bearing evidence", async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "anhedral-env-contract-"));
  const root = path.join(temporary, "project");
  mkdirSync(root);
  writeFileSync(path.join(root, "package.json"), '{"name":"contract"}');
  const environment = "review." + "a".repeat(60);
  reportProjectProgress(root, {
    revision: 0,
    environment,
    nextAction: "Resume the scoped review",
  });
  const client = new Client({ name: "environment-contract", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("plugins/anhedral/server.mjs")],
    env: {
      PATH: process.env.PATH || "",
      ANHEDRAL_STATE_DIR: path.join(temporary, "state"),
    },
    stderr: "pipe",
  });
  const fakeKeys = [
    ["sk", "proj", "a".repeat(32)].join("-"),
    ["github", "pat", "a".repeat(32)].join("_"),
  ];
  try {
    await client.connect(transport);
    const registered = await client.callTool({
      name: "anhedral_register_project",
      arguments: { folder: root },
    });
    const id = registered.structuredContent.project.id;
    assert.ok(
      registered.structuredContent.environments.includes(environment),
      "CLI-created environments appear without registry settings",
    );
    const reopened = await client.callTool({
      name: "anhedral_open",
      arguments: { projectId: id, environment },
    });
    assert.equal(reopened.structuredContent.environment, environment);
    let revision = reopened.structuredContent.progress.revision;
    for (const valid of ["_preview", "-preview", environment]) {
      validateProgressReport({ revision: 1, environment: valid });
      const result = await client.callTool({
        name: "anhedral_report_project_progress",
        arguments: {
          projectId: id,
          report: {
            revision,
            environment: valid,
            nextAction: "Keep scoped evidence",
          },
        },
      });
      assert.equal(result.isError, undefined);
      revision = result.structuredContent.progress.revision;
    }
    for (const invalid of ["a".repeat(81), "__proto__", "white space"]) {
      assert.throws(() =>
        validateProgressReport({ revision: 1, environment: invalid }),
      );
      assert.equal(
        (
          await client.callTool({
            name: "anhedral_open",
            arguments: { projectId: id, environment: invalid },
          })
        ).isError,
        true,
      );
    }
    for (const fake of fakeKeys) {
      assert.throws(
        () =>
          validateProgressReport({
            revision: 1,
            environment: "default",
            nextAction: fake,
          }),
        /nonsecret/,
      );
      const rejected = await client.callTool({
        name: "anhedral_report_project_progress",
        arguments: {
          projectId: id,
          report: { revision, environment: "default", nextAction: fake },
        },
      });
      assert.equal(rejected.isError, true);
    }
    const planned = await client.callTool({
      name: "anhedral_plan_stack",
      arguments: { projectId: id, revision: 0, selected: ["hono"] },
    });
    assert.ok(
      planned.structuredContent.checklist
        .find((stage) => stage.id === "init")
        .requirements.every(
          (requirement) => !requirement.includes("Initialize the shadcn"),
        ),
    );
    const graph = {
      nodes: [
        {
          id: "api",
          label: "API",
          kind: "Hono",
          layer: "application",
          status: "configured",
          evidence: [fakeKeys[1]],
        },
      ],
      edges: [],
    };
    assert.equal(
      (
        await client.callTool({
          name: "anhedral_update_architecture",
          arguments: { projectId: id, revision: 1, architecture: graph },
        })
      ).isError,
      true,
      "Architecture and canonical progress use the same secret boundary",
    );
  } finally {
    await client.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});
