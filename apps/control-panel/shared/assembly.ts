import { architectureSchema } from "./architecture.js";
import { nonSecretText } from "./non-secret.js";
export { nonSecretText } from "./non-secret.js";
import { z } from "zod";
import { isProgressEnvironment } from "../../../src/evidence-validation.js";
import {
  CAPABILITIES,
  resolveStandardProducts,
} from "../../../src/capabilities.js";
import type { StandardProduct } from "../../../src/standard-products.js";

export const environmentId = z.string().min(1).max(80).refine(
  isProgressEnvironment,
  "Invalid environment name",
);

const groups: Record<string, string[]> = {
  Interfaces: ["next", "expo", "electron", "wxt", "hono"],
  Data: ["neon", "d1", "local-data", "r2", "kv"],
  Identity: ["clerk", "better-auth"],
  Processing: ["realtime", "queues", "cron", "workflows", "containers"],
  AI: ["openai", "ai-sdk", "workers-ai"],
  "Domain & mail": ["domain", "email-routing", "email-sending", "resend"],
  Billing: ["stripe", "revenuecat"],
  Insights: ["basin", "posthog", "sentry"],
  Shared: ["styling"],
};
const extras = {
  domain: {
    purpose: "Client domain and selected Cloudflare DNS recipe",
    tools: [
      "Client registrar access",
      "Cloudflare integration or API when DNS is selected",
    ],
    access: [
      "Client-owned registrar, renewal and recovery; selected Cloudflare zone/DNS access",
    ],
    credentials: [],
    resources: [
      "Purchase or reuse the client's domain; preserve suitable registrar/DNS; set Cloudflare nameservers only when selected and verify zone activation",
    ],
    verify: ["Authoritative DNS, TLS and intended application domains"],
    selection: {},
  },
  "email-routing": {
    purpose: "Inbound forwarding/processing via Cloudflare Email Routing",
    tools: ["Cloudflare plugin + cf/API"],
    access: ["Cloudflare Email Routing and verified destination access"],
    credentials: [],
    resources: [
      "Domain DNS, verified destinations and routing rules; not a business mailbox",
    ],
    verify: ["Inbound delivery to each intended destination"],
    selection: {},
  },
  "email-sending": {
    purpose: "Transactional Cloudflare Email Sending beta",
    tools: ["Cloudflare plugin + cf/API"],
    access: ["Cloudflare Email Sending eligibility and Workers Paid"],
    credentials: ["Environment-specific sending credentials or bindings"],
    resources: [
      "Verified domain, sender authentication and sending integration",
    ],
    verify: ["Delivery, bounce handling and sender authentication"],
    selection: {},
  },
  containers: {
    purpose: "Linux or native workloads",
    tools: ["Cloudflare plugin + cf/API", "Container build tooling"],
    access: ["Cloudflare Containers access and a supported plan"],
    credentials: [],
    resources: ["Container image, deployment and operating limits"],
    verify: ["Runtime health, resource limits, restart and failure recovery"],
    selection: {},
  },
};
const definitions = { ...CAPABILITIES, ...extras };
export const CATALOG = Object.entries(groups).flatMap(([group, ids]) =>
  ids.map((id) => ({
    id,
    group,
    ...definitions[id as keyof typeof definitions],
    initializer: Object.hasOwn(CAPABILITIES, id),
  })),
);
export const planInput = {
  selected: z
    .array(
      z
        .string()
        .refine(
          (id) => CATALOG.some((item) => item.id === id),
          "Unknown stack piece",
        ),
    )
    .max(CATALOG.length),
  hosting: z.enum(["cloudflare", "vercel"]).default("cloudflare"),
};
export const STAGES = [
  {
    id: "plan",
    title: "Choose the stack",
    detail: "Confirm the product, interfaces, budget and acceptance criteria.",
  },
  {
    id: "accounts",
    title: "Accounts & permissions",
    detail:
      "Use client-owned accounts. Verify identity, scope, billing and recovery.",
  },
  {
    id: "tools",
    title: "Plugins & developer tools",
    detail:
      "Connect the selected plugins and verify CLI access on this device.",
  },
  {
    id: "provision",
    title: "Provision infrastructure",
    detail:
      "Create or reuse selected resources in the intended account and environment.",
  },
  {
    id: "init",
    title: "Initialize or adapt code",
    detail: "Bootstrap new code; inspect and preserve existing applications.",
  },
  {
    id: "develop",
    title: "Build the application",
    detail:
      "Implement actual product workflows, integrations and authorization.",
  },
  {
    id: "test",
    title: "Test & audit",
    detail: "Run deterministic checks, security review and platform tests.",
  },
  {
    id: "deploy",
    title: "Deploy",
    detail: "Verify preview delivery, production authorization and rollback.",
  },
  {
    id: "verify",
    title: "Verify the release",
    detail: "Exercise deployed product flows and record operating ownership.",
  },
] as const;
export const stageId = z.enum(STAGES.map((stage) => stage.id));
export const progressInput = {
  stage: stageId,
  status: z.enum(["pending", "active", "blocked", "done"]),
  summary: nonSecretText.pipe(z.string().trim().min(1).max(1000)),
  evidence: z
    .array(nonSecretText.pipe(z.string().trim().min(1).max(500)))
    .max(12)
    .default([]),
};
export const pieceInput = {
  piece: z
    .string()
    .refine(
      (id) => CATALOG.some((item) => item.id === id),
      "Unknown stack piece",
    ),
  status: z.enum([
    "planned",
    "starter",
    "configured",
    "locally-verified",
    "preview-verified",
    "released",
    "blocked",
  ]),
  summary: progressInput.summary,
  evidence: progressInput.evidence,
};
export const assemblySchema = z
  .object({
    ...planInput,
    revision: z.number().int().nonnegative(),
    architecture: architectureSchema.optional(),
    pieces: z
      .record(
        z.string(),
        z
          .object({ ...pieceInput, updatedAt: z.string().datetime() })
          .strict()
          .omit({ piece: true }),
      )
      .default({}),
    progress: z
      .partialRecord(
        stageId,
        z
          .object({ ...progressInput, updatedAt: z.string().datetime() })
          .strict()
          .omit({ stage: true }),
      )
      .default({}),
  })
  .strict();
export type Assembly = z.infer<typeof assemblySchema>;
export type StageId = z.infer<typeof stageId>;
export const PREREQUISITES: Record<StageId, StageId[]> = {
  plan: [],
  accounts: ["plan"],
  tools: ["plan"],
  provision: ["accounts", "tools"],
  init: ["tools"],
  develop: ["init"],
  test: ["develop"],
  deploy: ["accounts", "provision", "test"],
  verify: ["deploy"],
};
export function dependsOn(stage: StageId, prerequisite: StageId): boolean {
  return PREREQUISITES[stage].some(
    (id) => id === prerequisite || dependsOn(id, prerequisite),
  );
}
export function validatePlan(
  selected: string[],
  hosting: "cloudflare" | "vercel",
) {
  if (new Set(selected).size !== selected.length)
    throw new Error("Select each stack piece once.");
  const products = new Set(
    selected.filter((id) =>
      Object.hasOwn(CAPABILITIES, id),
    ) as StandardProduct[],
  );
  if (![...products].some((id) => CAPABILITIES[id].selection.app))
    throw new Error("Choose at least one application interface.");
  resolveStandardProducts(products, hosting, hosting === "vercel");
  if (selected.includes("resend") && selected.includes("email-sending"))
    throw new Error("Choose Cloudflare Email Sending or Resend.");
  if (
    selected.some((id) => id === "email-routing" || id === "email-sending") &&
    !selected.includes("domain")
  )
    throw new Error("Domain mail requires the domain piece.");
}
export function needsCloudflare(selected: string[], hosting: string) {
  return (
    (selected.includes("next") && hosting === "cloudflare") ||
    selected.some((id) =>
      [
        "hono",
        "neon",
        "d1",
        "r2",
        "kv",
        "realtime",
        "queues",
        "cron",
        "workflows",
        "workers-ai",
        "basin",
        "containers",
        "domain",
        "email-routing",
        "email-sending",
      ].includes(id),
    )
  );
}
export function checklist(assembly: Assembly, existing: boolean) {
  const pieces = CATALOG.filter((item) => assembly.selected.includes(item.id));
  const cloudflare = needsCloudflare(assembly.selected, assembly.hosting);
  const hosted = cloudflare || assembly.selected.includes("next");
  const requirements: Record<StageId, string[]> = {
    plan: [
      "Confirm users, core workflows, budget and observable acceptance criteria",
      `Selected pieces: ${assembly.selected.join(", ") || "inspect and propose the necessary stack"}`,
    ],
    accounts: [
      "Client-owned source repository and CI permissions",
      ...(cloudflare
        ? [
            "Cloudflare account ID, scoped plugin/OAuth or API access; service-compatible plan",
          ]
        : []),
      ...(assembly.hosting === "vercel"
        ? ["Client-owned Vercel project access"]
        : []),
      ...pieces.flatMap((item) => [
        ...item.access,
        ...item.credentials.map(
          (name) => `Server-side credential required: ${name}`,
        ),
      ]),
    ],
    tools: [
      "Discover session-callable Anhedral/provider tools; browser/computer tools when useful",
      "Git and the selected recipe runtime/toolchain; pinned audit tools",
      "Cloudflare security audit skill",
      ...(cloudflare
        ? [
            "Cloudflare integration/API or project-compatible Wrangler; beta cf only after migration review",
          ]
        : []),
      ...(assembly.selected.includes("neon") ? ["Neon plugin or API"] : []),
      ...pieces.flatMap((item) => item.tools),
      "Discover available provider plugins; verify alternatives when unavailable",
    ],
    provision: [
      ...(hosted
        ? ["Environment-specific hosting, bindings and operational telemetry"]
        : []),
      ...pieces
        .filter(
          (item) => item.group !== "Interfaces" && item.group !== "Shared",
        )
        .flatMap((item) => item.resources),
    ],
    init: [
      existing
        ? "Inspect source, Git state and project instructions; preserve existing code and architecture; never reinitialize"
        : "Initialize the selected supported recipe and suitable single-app or shared-workspace foundation; generate only needed apps",
      "Record toolchain versions and lockfiles; configure environments and server-side secrets",
      ...pieces
        .filter((item) => !item.initializer)
        .map(
          (item) =>
            `${item.purpose}: agent integration required; no CLI starter`,
        ),
    ],
    develop: [
      "Implement the product acceptance criteria; starters are unfinished",
      "Enforce resource ownership, server/client boundaries and failure recovery",
    ],
    test: [
      "Lint, typecheck, Fallow audit, meaningful tests, build and integration checks",
      "Cloudflare security audit; address legitimate findings",
      ...pieces.flatMap((item) => item.verify),
    ],
    deploy: [
      "Verify preview checks and platform delivery",
      "Obtain required production approval; reuse existing approvals within their scope",
      "Record release version, rollback and deployment evidence",
    ],
    verify: [
      "Verify deployed authentication, permissions and selected integrations",
      "Exercise core user flows on target platforms",
      "Record release evidence, recovery and client operating ownership",
    ],
  };
  return STAGES.map((stage) => ({
    ...stage,
    prerequisites: PREREQUISITES[stage.id],
    available: PREREQUISITES[stage.id].every(
      (id) => assembly.progress[id]?.status === "done",
    ),
    requirements: [...new Set(requirements[stage.id])],
    ...assembly.progress[stage.id],
    status: assembly.progress[stage.id]?.status || "pending",
  }));
}
