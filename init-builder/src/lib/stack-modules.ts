import type { BrandId } from "@/lib/brand-icons"

export const MODULE_ORDER = [
  "web",
  "admin",
  "mobile",
  "api",
  "desktop",
  "extension",
  "db",
  "auth",
  "realtime",
  "billing",
  "storage",
  "native-subscriptions",
  "electron-updater",
  "ubuntu",
  "docker",
  "postgres",
  "nginx",
  "certbot",
] as const

export type ModuleId = (typeof MODULE_ORDER)[number]

export type StackModule = {
  id: ModuleId
  title: string
  provider: string
  productId: string
  eyebrow: string
  description: string
  kind: "surface" | "capability" | "infrastructure"
  brand: BrandId
  accent: string
  requires: readonly ModuleId[]
}

export const STACK_MODULES: readonly StackModule[] = [
  {
    id: "web",
    title: "Web",
    provider: "Next.js",
    productId: "next",
    eyebrow: "APP SURFACE",
    description: "Server-rendered web app, routes, and shadcn/ui foundation.",
    kind: "surface",
    brand: "next",
    accent: "#f7f5f0",
    requires: [],
  },
  {
    id: "mobile",
    title: "Mobile",
    provider: "Expo",
    productId: "expo",
    eyebrow: "APP SURFACE",
    description: "Native iOS and Android app with shared React primitives.",
    kind: "surface",
    brand: "expo",
    accent: "#f7f5f0",
    requires: [],
  },
  {
    id: "admin",
    title: "Admin",
    provider: "Next.js route group or app",
    productId: "admin-page",
    eyebrow: "APP SURFACE",
    description: "Restricted administration as an in-app route group or separate deployment.",
    kind: "surface",
    brand: "next",
    accent: "#f7f5f0",
    requires: ["web", "auth", "db"],
  },
  {
    id: "api",
    title: "API",
    provider: "Fastify",
    productId: "fastify",
    eyebrow: "BACKEND CORE",
    description: "Typed API and business logic shared by every client.",
    kind: "surface",
    brand: "fastify",
    accent: "#f7f5f0",
    requires: [],
  },
  {
    id: "desktop",
    title: "Desktop",
    provider: "Electron",
    productId: "electron",
    eyebrow: "APP SURFACE",
    description: "Cross-platform desktop shell for macOS, Windows, and Linux.",
    kind: "surface",
    brand: "electron",
    accent: "#51dce9",
    requires: [],
  },
  {
    id: "extension",
    title: "Extension",
    provider: "WXT",
    productId: "wxt",
    eyebrow: "APP SURFACE",
    description: "Manifest V3 browser extension for Chrome, Firefox, and Edge.",
    kind: "surface",
    brand: "wxt",
    accent: "#f48120",
    requires: [],
  },
  {
    id: "native-subscriptions",
    title: "Native subs",
    provider: "RevenueCat",
    productId: "revenuecat-native",
    eyebrow: "CAPABILITY",
    description: "Native App Store and Google Play purchase experiences.",
    kind: "capability",
    brand: "revenuecat",
    accent: "#f48120",
    requires: ["mobile", "billing"],
  },
  {
    id: "billing",
    title: "Billing",
    provider: "RevenueCat + Stripe",
    productId: "revenuecat",
    eyebrow: "CAPABILITY",
    description: "Web checkout and shared subscription entitlements.",
    kind: "capability",
    brand: "revenuecat-stripe",
    accent: "#f48120",
    requires: ["realtime"],
  },
  {
    id: "realtime",
    title: "Realtime",
    provider: "Ably",
    productId: "ably",
    eyebrow: "CAPABILITY",
    description: "Authenticated realtime events across every active client.",
    kind: "capability",
    brand: "ably",
    accent: "#f48120",
    requires: ["auth"],
  },
  {
    id: "auth",
    title: "Authentication",
    provider: "Clerk",
    productId: "clerk",
    eyebrow: "CAPABILITY",
    description: "Identity, sessions, and verified server-side authentication.",
    kind: "capability",
    brand: "clerk",
    accent: "#8d5cff",
    requires: ["api", "db"],
  },
  {
    id: "db",
    title: "Managed database",
    provider: "Neon + Drizzle (default)",
    productId: "neon",
    eyebrow: "CAPABILITY",
    description: "Managed Postgres with Drizzle schemas and migrations.",
    kind: "capability",
    brand: "neon-drizzle",
    accent: "#35d6a8",
    requires: [],
  },
  {
    id: "storage",
    title: "Storage",
    provider: "Private Cloudflare R2",
    productId: "r2",
    eyebrow: "CAPABILITY",
    description: "Private asset storage served through an authorized Worker.",
    kind: "capability",
    brand: "worker-r2",
    accent: "#f48120",
    requires: ["auth"],
  },
  {
    id: "electron-updater",
    title: "App updates",
    provider: "Electron + R2",
    productId: "electron-updater",
    eyebrow: "CAPABILITY",
    description: "Private desktop release channel backed by a Worker and R2.",
    kind: "capability",
    brand: "updater-r2",
    accent: "#51dce9",
    requires: ["desktop"],
  },
  {
    id: "ubuntu",
    title: "VPS host",
    provider: "Ubuntu Server",
    productId: "ubuntu",
    eyebrow: "INFRASTRUCTURE",
    description: "Hardened Ubuntu host baseline for a self-managed VPS.",
    kind: "infrastructure",
    brand: "ubuntu",
    accent: "#e95420",
    requires: [],
  },
  {
    id: "docker",
    title: "Containers",
    provider: "Docker Engine + Compose",
    productId: "docker",
    eyebrow: "INFRASTRUCTURE",
    description: "Docker Engine and Compose runtime for the application stack.",
    kind: "infrastructure",
    brand: "docker",
    accent: "#2496ed",
    requires: ["ubuntu"],
  },
  {
    id: "postgres",
    title: "Self-hosted database",
    provider: "PostgreSQL + Drizzle",
    productId: "postgres",
    eyebrow: "INFRASTRUCTURE",
    description: "Self-hosted PostgreSQL and Drizzle on the private network.",
    kind: "infrastructure",
    brand: "postgres-drizzle",
    accent: "#4169e1",
    requires: ["db", "docker"],
  },
  {
    id: "nginx",
    title: "Reverse proxy",
    provider: "Nginx",
    productId: "nginx",
    eyebrow: "INFRASTRUCTURE",
    description: "Containerized reverse proxy for public application traffic.",
    kind: "infrastructure",
    brand: "nginx",
    accent: "#009639",
    requires: ["docker"],
  },
  {
    id: "certbot",
    title: "TLS certificates",
    provider: "Certbot + Let’s Encrypt",
    productId: "certbot",
    eyebrow: "INFRASTRUCTURE",
    description: "Automated Let’s Encrypt TLS certificate lifecycle.",
    kind: "infrastructure",
    brand: "certbot",
    accent: "#2e8bff",
    requires: ["nginx"],
  },
] as const

export const STACK_MODULE_BY_ID = Object.fromEntries(
  STACK_MODULES.map((module) => [module.id, module]),
) as Record<ModuleId, StackModule>

export const STACK_PRESETS = [
  { label: "Web starter", modules: ["web", "api", "db", "auth"] },
  {
    label: "Native product",
    modules: [
      "mobile",
      "api",
      "db",
      "auth",
      "realtime",
      "billing",
      "native-subscriptions",
    ],
  },
  { label: "API only", modules: ["api", "db"] },
  {
    label: "VPS production",
    modules: ["web", "api", "postgres", "ubuntu", "docker", "nginx", "certbot"],
  },
  { label: "Everything", modules: MODULE_ORDER },
] satisfies readonly { label: string; modules: readonly ModuleId[] }[]

export const DEFAULT_SELECTION: readonly ModuleId[] = STACK_PRESETS[0].modules

export function resolveModules(requested: ReadonlySet<ModuleId>): Set<ModuleId> {
  const resolved = new Set<ModuleId>()

  function include(moduleId: ModuleId) {
    if (resolved.has(moduleId)) return
    resolved.add(moduleId)
    for (const required of STACK_MODULE_BY_ID[moduleId].requires) include(required)
  }

  for (const moduleId of requested) include(moduleId)
  return resolved
}

export function moduleDependsOn(moduleId: ModuleId, dependency: ModuleId): boolean {
  if (moduleId === dependency) return true
  return STACK_MODULE_BY_ID[moduleId].requires.some(
    (required) => required === dependency || moduleDependsOn(required, dependency),
  )
}

export function orderedModules(modules: ReadonlySet<ModuleId>): ModuleId[] {
  return MODULE_ORDER.filter((moduleId) => modules.has(moduleId))
}

export function orderedProductFlags(modules: ReadonlySet<ModuleId>): string[] {
  const flags: string[] = []

  for (const moduleId of MODULE_ORDER) {
    if (!modules.has(moduleId)) continue
    if (moduleId === "db" && modules.has("postgres")) continue
    flags.push(`--${STACK_MODULE_BY_ID[moduleId].productId}`)
  }

  return flags
}

export function moduleIsVisuallyActive(
  moduleId: ModuleId,
  resolved: ReadonlySet<ModuleId>,
) {
  if (moduleId === "db" && resolved.has("postgres")) return false
  return resolved.has(moduleId)
}
