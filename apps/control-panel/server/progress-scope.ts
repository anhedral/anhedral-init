import type { Environment } from "./status.js";

const cloudflareCapabilities = new Set([
  "hono",
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
  "email-routing",
  "email-sending",
  "domain",
]);
export function capabilityProvider(
  capability: string,
  hosting: string,
): string {
  if (capability === "neon") return "neon";
  return cloudflareCapabilities.has(capability) ||
    (capability === "next" && hosting === "cloudflare")
    ? "cloudflare"
    : "";
}
export function expectedScope(
  settings: Environment | undefined,
  provider: string,
): string | undefined {
  switch (provider.toLowerCase()) {
    case "cloudflare":
      return settings?.cloudflareAccountId;
    case "neon":
      return settings?.neonProjectId;
    default:
      return undefined;
  }
}
