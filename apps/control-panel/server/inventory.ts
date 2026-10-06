import { bindings, readProjectFile } from "./projects.js";
import type { Resource } from "./status.js";

type Config = Record<string, any>;
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

function declaredBindings(worker: Config, base: Resource): Resource[] {
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

function runtimeBindings(worker: Config, base: Resource): Resource[] {
  const declarations = [
    ...bindings(worker.queues?.producers).map((binding) => ({
      value: binding.queue,
      kind: "Queue",
    })),
    ...bindings(worker.durable_objects?.bindings).map((binding) => ({
      value: binding.class_name,
      kind: "Durable Object",
    })),
  ];
  const resources = declarations.flatMap(({ value, kind }) => {
    const name = cleanId(value);
    return name
      ? [
          {
            ...base,
            id: `${kind}:${name}`,
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
): Resource[] {
  const worker = environment === "default" ? config : config.env?.[environment];
  if (!worker || typeof worker !== "object") return [];
  const name = cleanId(worker.name);
  if (!name) return [];
  const candidate = worker.account_id || config.account_id;
  const account =
    typeof candidate === "string" && /^[a-f0-9]{32}$/.test(candidate)
      ? candidate
      : undefined;
  const base: Resource = {
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
    ...runtimeBindings(worker, base),
  ];
}

export function workerResources(root: string, environment: string): Resource[] {
  const resources = [
    "web",
    "api",
    "jobs",
    "scheduled",
    "workflows",
    "realtime",
  ].flatMap((app) => {
    const config = readProjectFile(root, `apps/${app}/wrangler.jsonc`);
    return config ? configuredWorker(app, config, environment) : [];
  });
  return [
    ...new Map(resources.map((resource) => [resource.id, resource])).values(),
  ];
}
