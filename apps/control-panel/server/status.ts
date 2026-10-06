import { CAPABILITIES } from "../../../src/capabilities.js";
import { inspectProject } from "../../../src/readiness.js";
import {
  bindings,
  projects,
  projectFor,
  readRegistry,
  readProjectFile,
} from "./projects.js";
import { workerResources } from "./inventory.js";
export { registerProject, updateSettings } from "./projects.js";
export type Status =
  "verified" | "configured" | "missing" | "unverified" | "error";
export type Resource = {
  id: string;
  name: string;
  kind: string;
  provider: string;
  status: Status;
  detail: string;
  dashboard: string;
  endpoint?: string;
  account?: string;
};
export type Project = { id: string; name: string; root: string };
export type Environment = {
  cloudflareAccountId?: string;
  neonProjectId?: string;
  repository?: string;
};
export type Settings = Record<string, Environment>;
export async function providerGet(
  url: string,
  token?: string,
): Promise<{ ok: boolean; status: number; data?: any }> {
  const target = new URL(url);
  if (
    target.username ||
    target.password ||
    target.port ||
    target.protocol !== "https:" ||
    !["api.cloudflare.com", "api.github.com", "console.neon.tech"].includes(
      target.hostname,
    )
  )
    throw new Error("Provider host is not allowed.");
  try {
    const result = await fetch(url, {
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": "Anhedral-Control-Panel",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) return { ok: false, status: result.status };
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (result.body)
      for await (const chunk of result.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          return { ok: false, status: 502 };
        }
        chunks.push(chunk);
      }
    return {
      ok: true,
      status: result.status,
      data: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function verifyResource(
  resource: Resource,
  settings: Environment,
): Promise<Resource> {
  if (!resource.endpoint || !process.env.CLOUDFLARE_API_TOKEN) return resource;
  const account = settings.cloudflareAccountId || resource.account;
  if (!account || (resource.account && resource.account !== account))
    return {
      ...resource,
      status: "error",
      detail:
        "Selected Cloudflare account does not match the project configuration.",
    };
  const result = await providerGet(
    `https://api.cloudflare.com/client/v4/accounts/${account}/${resource.endpoint}`,
    process.env.CLOUDFLARE_API_TOKEN,
  );
  return {
    ...resource,
    status: result.ok && result.data?.success ? "verified" : "error",
    detail:
      result.ok && result.data?.success
        ? "Provider API confirmed this resource exists. Product behavior still requires testing."
        : `Provider check could not confirm availability (HTTP ${result.status || "unreachable"}).`,
  };
}

async function delivery(repository?: string) {
  if (!repository)
    return {
      status: "missing" as Status,
      detail: "Connect the project repository in settings.",
      runs: [],
    };
  const result = await providerGet(
    `https://api.github.com/repos/${repository}/actions/runs?per_page=5`,
    process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  );
  if (!result.ok)
    return {
      status: "error" as Status,
      detail: "Repository checks are unavailable. Verify repository access.",
      runs: [],
    };
  return {
    status: "verified" as Status,
    detail: "Recent GitHub Actions runs retrieved; CI is not deployment proof.",
    runs: bindings(result.data?.workflow_runs)
      .slice(0, 5)
      .map((run: any) => ({
        name: String(run.name).slice(0, 100),
        status: String(run.conclusion || run.status),
        date: String(run.created_at),
        url: `https://github.com/${repository}/actions/runs/${Number(run.id)}`,
      })),
  };
}

async function neonResources(
  selected: Environment,
  refresh: boolean,
): Promise<Resource[]> {
  if (selected.neonProjectId) {
    const neon =
      refresh && process.env.NEON_API_KEY
        ? await providerGet(
            `https://console.neon.tech/api/v2/projects/${selected.neonProjectId}`,
            process.env.NEON_API_KEY,
          )
        : null;
    return [
      {
        id: "neon",
        name: selected.neonProjectId,
        kind: "Postgres",
        provider: "Neon",
        status: neon
          ? neon.ok && neon.data?.project?.id === selected.neonProjectId
            ? "verified"
            : "error"
          : "configured",
        detail:
          neon?.ok && neon.data?.project?.id === selected.neonProjectId
            ? "Neon API confirmed project access; database behavior needs verification."
            : "Neon project recorded. Refresh with server-side Neon credentials to verify access.",
        dashboard: `https://console.neon.tech/app/projects/${selected.neonProjectId}`,
      },
    ];
  }
  return [];
}

async function checkResources(
  resources: Resource[],
  selected: Environment,
  refresh: boolean,
) {
  const checked = [];
  for (let index = 0; index < resources.length; index += 4)
    checked.push(
      ...(await Promise.all(
        resources
          .slice(index, index + 4)
          .map((resource) =>
            refresh && index < 24
              ? verifyResource(resource, selected)
              : resource,
          ),
      )),
    );
  return checked;
}

function connections(products: string[]) {
  const providers = [
    ["cloudflare", "Cloudflare", "CLOUDFLARE_API_TOKEN"],
    ["neon", "Neon", "NEON_API_KEY"],
    ["resend", "Resend", "RESEND_API_KEY"],
    ["stripe", "Stripe", "STRIPE_SECRET_KEY"],
    ["sentry", "Sentry", "SENTRY_DSN"],
    ["posthog", "PostHog", "POSTHOG_API_KEY"],
    ["openai", "OpenAI", "OPENAI_API_KEY"],
    ["revenuecat", "RevenueCat", "REVENUECAT_SECRET_API_KEY"],
  ];
  return [
    ...providers
      .filter(
        ([id]) =>
          id === "cloudflare" || id === "neon" || products.includes(id!),
      )
      .map(([, name, credential]) => ({
        name: name!,
        available: Boolean(process.env[credential!]),
      })),
    {
      name: "GitHub",
      available: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
      publicRead: true,
    },
  ];
}

export async function snapshot(
  id?: string,
  environment = "default",
  refresh = false,
) {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(environment))
    throw new Error("Invalid environment name.");
  const list = projects();
  if (!list.length)
    return {
      projects: list,
      project: null,
      environment,
      resources: [],
      capabilities: [],
      checkedAt: new Date().toISOString(),
    };
  const project = projectFor(id || list[0]!.id);
  const settings = readRegistry().settings[project.id] || {};
  const selected = settings[environment] || {};
  const standard = readProjectFile(project.root, "anhedral.standard.json");
  const products = Array.isArray(standard?.products)
    ? (standard.products.filter((id: string) =>
        Object.hasOwn(CAPABILITIES, id),
      ) as (keyof typeof CAPABILITIES)[])
    : [];
  const capabilities = products.map((id) => ({
    id,
    ...CAPABILITIES[id],
    status: "starter",
  }));
  const resources = workerResources(project.root, environment);
  resources.push(...(await neonResources(selected, refresh)));
  // Preflight the files read by the CLI inspector to enforce the same project boundary.
  for (const file of ["anhedral.setup.json", "anhedral.standard.json"])
    readProjectFile(project.root, file);
  const checked = await checkResources(resources, selected, refresh);
  return {
    projects: list,
    project,
    environment,
    environments: [...new Set(["default", ...Object.keys(settings)])],
    settings: selected,
    resources: checked.map(
      ({ endpoint: _endpoint, account: _account, ...resource }) => resource,
    ),
    capabilities,
    readiness: inspectProject(project.root),
    connections: connections(products),
    delivery: refresh
      ? await delivery(selected.repository)
      : {
          status: "unverified" as Status,
          detail: "Refresh to retrieve repository checks.",
          runs: [],
        },
    checkedAt: new Date().toISOString(),
    refreshed: refresh,
  };
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
