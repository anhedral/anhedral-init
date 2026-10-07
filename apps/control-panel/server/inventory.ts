import { bindings, readProjectFile } from "./projects.js";
import { createHash } from "node:crypto";
import type { Resource } from "./status.js";

type Config = Record<string, any>;
type ScopedResource = Resource & { inventoryScope: string };
const cleanId = (value: unknown) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9_-]{1,100}$/.test(value) &&
  !/^(?:TODO|REPLACE|YOUR)[_-]/i.test(value)
    ? value
    : undefined;
const declarations = [
  ["r2_buckets", "R2 bucket", "bucket_name", "r2/buckets"],
  ["hyperdrive", "Hyperdrive", "id", "hyperdrive/configs"],
  ["d1_databases", "D1 database", "database_id", "d1/database"],
  ["kv_namespaces", "KV namespace", "id", ""],
  ["pipelines", "Pipeline", "stream", ""],
  ["workflows", "Workflow", "name", ""],
] as const;

function declaredBindings(
  worker: Config,
  base: ScopedResource,
): ScopedResource[] {
  return declarations.flatMap(([key, kind, field, endpoint]) =>
    bindings(worker[key]).flatMap((binding) => {
      const value = cleanId(binding[field]);
      if (!value) return [];
      return [
        {
          ...base,
          id: `${kind}:${value}`,
          name: String(binding.binding || value).slice(0, 100),
          kind,
          endpoint: endpoint
            ? `${endpoint}/${encodeURIComponent(value)}`
            : undefined,
          detail:
            "Binding declared locally; resource availability and runtime behavior need verification.",
        },
      ];
    }),
  );
}

function runtimeBindings(
  worker: Config,
  base: ScopedResource,
): ScopedResource[] {
  const declarations = [
    ...bindings(worker.queues?.producers).map((binding) => ({
      value: binding.queue,
      kind: "Queue",
    })),
    ...bindings(worker.durable_objects?.bindings).map((binding) => ({
      value: binding.class_name,
      kind: "Durable Object",
      script: cleanId(binding.script_name) || base.name,
    })),
  ];
  const resources = declarations.flatMap((declaration) => {
    const { value, kind } = declaration;
    const name = cleanId(value);
    return name
      ? [
          {
            ...base,
            id: `${kind}:${name}`,
            inventoryScope:
              kind === "Durable Object"
                ? `${base.inventoryScope}:${"script" in declaration ? declaration.script : base.name}`
                : base.inventoryScope,
            name,
            kind,
            endpoint: undefined,
            detail:
              "Runtime binding configured; verify actual behavior with the provider integration.",
          },
        ]
      : [];
  });
  if (worker.ai?.binding)
    resources.push({
      ...base,
      id: `ai:${base.name}`,
      name: "Workers AI",
      kind: "AI binding",
      endpoint: undefined,
      detail:
        "AI binding configured; model access and response behavior need testing.",
    });
  if (Array.isArray(worker.triggers?.crons) && worker.triggers.crons.length)
    resources.push({
      ...base,
      id: `cron:${base.name}`,
      name: "Cron triggers",
      kind: "Schedule",
      endpoint: undefined,
      detail:
        "Scheduled triggers declared; execution and failure handling need testing.",
    });
  return resources;
}

function configuredWorker(
  app: string,
  config: Config,
  environment: string,
): ScopedResource[] {
  const worker = environment === "default" ? config : config.env?.[environment];
  if (!worker || typeof worker !== "object" || Array.isArray(worker)) return [];
  const name = cleanId(
    worker.name ??
      (environment !== "default" && cleanId(config.name)
        ? `${config.name}-${environment}`
        : undefined),
  );
  if (!name) return [];
  const candidate = worker.account_id || config.account_id;
  const account =
    typeof candidate === "string" && /^[a-f0-9]{32}$/.test(candidate)
      ? candidate
      : undefined;
  const base: ScopedResource = {
    inventoryScope: account || `unknown:${name}`,
    id: `worker:${app}`,
    name,
    kind: "Worker",
    provider: "Cloudflare",
    account,
    endpoint: `workers/scripts/${encodeURIComponent(name)}/settings`,
    status: "configured",
    detail: "Worker declared in Wrangler; deployment has not been checked.",
    dashboard: account
      ? `https://dash.cloudflare.com/${account}/workers-and-pages`
      : "https://dash.cloudflare.com/",
  };
  return [
    base,
    ...declaredBindings(worker, base),
    ...runtimeBindings(
      { ...worker, triggers: worker.triggers ?? config.triggers },
      base,
    ),
  ];
}

export function workerResources(root: string, environment: string): Resource[] {
  const standalone =
    readProjectFile(root, "wrangler.jsonc") ||
    readProjectFile(root, "wrangler.json");
  const resources = [
    ...(standalone ? configuredWorker("root", standalone, environment) : []),
    ...["web", "api", "jobs", "scheduled", "workflows", "realtime"].flatMap(
      (app) => {
        const config =
          readProjectFile(root, `apps/${app}/wrangler.jsonc`) ||
          readProjectFile(root, `apps/${app}/wrangler.json`);
        return config ? configuredWorker(app, config, environment) : [];
      },
    ),
  ];
  // Shared account resources deduplicate; equal names in different accounts or DO namespaces do not.
  // Preserve existing IDs while unambiguous, and scope every colliding ID deterministically.
  const groups = new Map<string, Map<string, ScopedResource>>();
  for (const resource of resources) {
    const group = groups.get(resource.id) || new Map<string, ScopedResource>();
    group.set(resource.inventoryScope, resource);
    groups.set(resource.id, group);
  }
  return [...groups.values()].flatMap((group) =>
    [...group.values()].map(({ inventoryScope, ...resource }) => ({
      ...resource,
      id:
        group.size > 1
          ? `${resource.id}:${createHash("sha256").update(inventoryScope).digest("hex").slice(0, 16)}`
          : resource.id,
    })),
  );
}
