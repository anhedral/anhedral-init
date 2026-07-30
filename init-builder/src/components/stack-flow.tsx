"use client"

import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Cloud,
  Layers3,
  Network,
  ServerCog,
  Sparkles,
} from "lucide-react"

import { BrandIcon } from "@/components/brand-icon"
import { ModuleCard } from "@/components/module-card"
import { Button } from "@/components/ui/button"
import type { BrandId } from "@/lib/brand-icons"
import {
  moduleIsVisuallyActive,
  orderedModules,
  STACK_MODULE_BY_ID,
  STACK_PRESETS,
  type ModuleId,
} from "@/lib/stack-modules"
import { cn } from "@/lib/utils"

interface StackFlowProps {
  requested: ReadonlySet<ModuleId>
  resolved: ReadonlySet<ModuleId>
  onToggle: (moduleId: ModuleId) => void
  onSelectPreset: (modules: readonly ModuleId[]) => void
}

const APPLICATION_IDS = ["web", "mobile", "desktop", "extension"] as const
const SERVICE_IDS = [
  "db",
  "auth",
  "realtime",
  "billing",
  "native-subscriptions",
  "storage",
  "electron-updater",
] as const
const BACKEND_IDS = [
  "api",
  "db",
  "auth",
  "realtime",
  "billing",
  "native-subscriptions",
  "storage",
  "electron-updater",
] as const
const INFRASTRUCTURE_IDS = [
  "ubuntu",
  "docker",
  "postgres",
  "nginx",
  "certbot",
] as const

const FOUNDATION_TOOLS = [
  { label: "Tailwind", brand: "tailwind" },
  { label: "shadcn/ui", brand: "shadcn" },
  { label: "React", brand: "react" },
  { label: "TypeScript", brand: "typescript" },
  { label: "Zod", brand: "zod" },
  { label: "GitHub", brand: "github" },
] as const satisfies readonly { label: string; brand: BrandId }[]

function setsMatch(
  requested: ReadonlySet<ModuleId>,
  modules: readonly ModuleId[],
) {
  return requested.size === modules.length && modules.every((id) => requested.has(id))
}

export function StackFlow({
  requested,
  resolved,
  onToggle,
  onSelectPreset,
}: StackFlowProps) {
  const activeIds = orderedModules(resolved).filter((moduleId) =>
    moduleIsVisuallyActive(moduleId, resolved),
  )
  const activeApps = APPLICATION_IDS.filter((id) => resolved.has(id)).length
  const activeServices = BACKEND_IDS.filter((id) =>
    moduleIsVisuallyActive(id, resolved),
  ).length
  const activeInfrastructure = INFRASTRUCTURE_IDS.filter((id) =>
    resolved.has(id),
  ).length

  function renderModule(moduleId: ModuleId, emphasized = false) {
    const product = STACK_MODULE_BY_ID[moduleId]

    return (
      <ModuleCard
        key={moduleId}
        module={product}
        active={moduleIsVisuallyActive(moduleId, resolved)}
        requested={requested.has(moduleId)}
        emphasized={emphasized}
        onToggle={() => onToggle(moduleId)}
      />
    )
  }

  return (
    <>
      <section className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20 lg:px-10 lg:pt-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-end">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">
              <Network className="size-3.5" />
              ANHEDRAL ARCHITECTURE COMPOSER
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[0.98] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-[72px]">
              Build your stack
              <span className="block text-white/32">in the architecture.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-6 text-white/48 sm:text-base sm:leading-7">
              Select products directly in the flow. Dependencies connect and
              resolve automatically while the exact init command stays ready
              below.
            </p>
          </div>

          <div className="border-y border-white/10 py-5">
            <div className="font-mono text-[8px] font-semibold tracking-[0.18em] text-white/28">
              START WITH A REFERENCE STACK
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {STACK_PRESETS.map((preset) => {
                const active = setsMatch(requested, preset.modules)

                return (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={active}
                    onClick={() => onSelectPreset(preset.modules)}
                    className={cn(
                      "rounded-full border-white/10 bg-transparent px-3 font-mono text-[9px] text-white/48 hover:border-white/24 hover:bg-white/5 hover:text-white",
                      active &&
                        "border-primary/45 bg-primary/8 text-primary hover:border-primary/60 hover:bg-primary/10 hover:text-primary",
                    )}
                  >
                    {preset.label}
                  </Button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-3 border-y border-white/10 sm:mt-16">
          {[
            { value: activeApps, label: "client surfaces" },
            { value: activeServices, label: "backend services" },
            { value: activeInfrastructure, label: "VPS products" },
          ].map((metric, index) => (
            <div
              key={metric.label}
              className={cn(
                "py-4 text-center sm:flex sm:items-baseline sm:justify-center sm:gap-2 sm:py-5",
                index > 0 && "border-l border-white/10",
              )}
            >
              <span className="font-mono text-lg font-medium text-foreground sm:text-2xl">
                {metric.value}
              </span>
              <span className="mt-1 block font-mono text-[7px] tracking-[0.12em] text-white/30 sm:mt-0 sm:text-[9px]">
                {metric.label.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="rounded-3xl border border-white/10 bg-[#08141e]/88 px-4 py-4 shadow-[0_24px_70px_rgb(0_0_0_/_0.22)] sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-mono text-[8px] font-semibold tracking-[0.18em] text-primary">
                YOUR ACTIVE ARCHITECTURE
              </div>
              <p className="mt-1 text-[11px] text-white/34">
                {activeIds.length} products connected
              </p>
            </div>
            <Sparkles className="size-4 text-primary/60" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {activeIds.map((moduleId, index) => {
              const product = STACK_MODULE_BY_ID[moduleId]

              return (
                <div key={moduleId} className="contents">
                  {index > 0 ? (
                    <ArrowRight className="size-3 shrink-0 text-white/16" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onToggle(moduleId)}
                    aria-label={`Remove ${product.title}`}
                    className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-[#050d15] px-3 text-[10px] font-medium text-white/64 transition-colors hover:border-primary/35 hover:text-white"
                  >
                    <BrandIcon brand={product.brand} size="sm" />
                    {product.title}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-4 pb-40 pt-16 sm:px-6 sm:pt-20 lg:px-10">
        <div className="relative">
          <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 hidden w-px -translate-x-1/2 bg-gradient-to-b from-primary/0 via-primary/18 to-primary/0 lg:block" />

          <article className="relative rounded-[28px] border border-white/10 bg-[#07131d]/88 p-5 shadow-[0_24px_80px_rgb(0_0_0_/_0.2)] sm:p-8 lg:p-10">
            <div className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-primary">
                  <Layers3 className="size-3.5" />
                  01 · PRODUCT SURFACES
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">
                  Where your product lives
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
                  Choose every client your product needs. They share one
                  backend contract and deploy independently.
                </p>
              </div>
              <span className="font-mono text-[9px] text-white/28">
                {activeApps}/{APPLICATION_IDS.length} SELECTED
              </span>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {APPLICATION_IDS.map((moduleId) => renderModule(moduleId))}
            </div>
          </article>

          <div className="relative z-10 mx-auto flex h-24 w-fit flex-col items-center justify-center">
            <span className="h-5 w-px bg-primary/30" />
            <span className="my-2 flex items-center gap-2 rounded-full border border-primary/20 bg-[#071019] px-3 py-1 font-mono text-[8px] tracking-[0.14em] text-primary/70">
              <ArrowDown className="size-3" />
              SHARED API CONTRACT
            </span>
            <span className="h-5 w-px bg-primary/30" />
          </div>

          <article className="relative rounded-[28px] border border-white/10 bg-[#07131d]/92 p-5 shadow-[0_24px_80px_rgb(0_0_0_/_0.2)] sm:p-8 lg:p-10">
            <div className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-primary">
                  <ServerCog className="size-3.5" />
                  02 · BACKEND + SERVICES
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">
                  One backend, connected capabilities
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
                  Fastify anchors the graph. Select a capability and its
                  required API, identity, and data layers resolve with it.
                </p>
              </div>
              <span className="font-mono text-[9px] text-white/28">
                {activeServices}/{SERVICE_IDS.length + 1} ACTIVE
              </span>
            </div>

            <div className="mx-auto mt-8 max-w-sm">
              {renderModule("api", true)}
            </div>

            <div className="mx-auto h-14 max-w-[calc(100%-3rem)] border-x border-t border-primary/20 sm:max-w-[calc(100%-10rem)]" />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICE_IDS.map((moduleId) => renderModule(moduleId))}
            </div>
          </article>

          <div className="relative z-10 mx-auto flex h-24 w-fit flex-col items-center justify-center">
            <span className="h-5 w-px bg-[#51dce9]/30" />
            <span className="my-2 flex items-center gap-2 rounded-full border border-[#51dce9]/20 bg-[#071019] px-3 py-1 font-mono text-[8px] tracking-[0.14em] text-[#51dce9]/80">
              <ArrowDown className="size-3" />
              OPTIONAL SELF-HOSTING
            </span>
            <span className="h-5 w-px bg-[#51dce9]/30" />
          </div>

          <article className="relative overflow-hidden rounded-[28px] border border-[#2496ed]/18 bg-[linear-gradient(145deg,rgb(8_25_38_/_0.98),rgb(7_18_28_/_0.96))] p-5 shadow-[0_24px_80px_rgb(0_0_0_/_0.22)] sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute -right-24 -top-36 size-96 rounded-full bg-[#2496ed]/6 blur-3xl" />
            <div className="relative flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-[#51dce9]">
                  <Cloud className="size-3.5" />
                  03 · VPS INFRASTRUCTURE
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">
                  Take the stack onto your own host
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
                  Infrastructure is opt-in. Selecting a downstream product
                  automatically adds every runtime it needs.
                </p>
              </div>
              <span className="font-mono text-[9px] text-[#51dce9]/55">
                {activeInfrastructure}/{INFRASTRUCTURE_IDS.length} ACTIVE
              </span>
            </div>

            <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {INFRASTRUCTURE_IDS.map((moduleId) => renderModule(moduleId))}
            </div>

            <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2 font-mono text-[8px] tracking-[0.12em] text-white/24">
              <span>UBUNTU</span>
              <ArrowRight className="size-3 text-[#51dce9]/40" />
              <span>DOCKER</span>
              <ArrowRight className="size-3 text-[#51dce9]/40" />
              <span>POSTGRES / NGINX</span>
              <ArrowRight className="size-3 text-[#51dce9]/40" />
              <span>CERTBOT</span>
            </div>
          </article>
        </div>

        <div className="mt-16 border-y border-white/10 py-6 sm:mt-20">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Boxes className="size-4 text-white/36" />
              <div>
                <div className="font-mono text-[8px] font-semibold tracking-[0.18em] text-white/34">
                  INCLUDED FOUNDATIONS
                </div>
                <p className="mt-1 text-[11px] text-white/28">
                  Shared tooling configured across the generated workspace.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-6">
              {FOUNDATION_TOOLS.map((tool) => (
                <div
                  key={tool.label}
                  className="flex min-w-20 items-center gap-2 text-[10px] text-white/42"
                >
                  <BrandIcon brand={tool.brand} size="sm" />
                  {tool.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
