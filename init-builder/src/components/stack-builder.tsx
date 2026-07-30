"use client"

import * as React from "react"

import { AppHeader } from "@/components/app-header"
import { CommandDock } from "@/components/command-dock"
import { StackFlow } from "@/components/stack-flow"
import {
  DEFAULT_SELECTION,
  moduleDependsOn,
  moduleIsVisuallyActive,
  orderedProductFlags,
  resolveModules,
  STACK_MODULES,
  type ModuleId,
} from "@/lib/stack-modules"

const AUTHJS_UNSUPPORTED = new Set<ModuleId>([
  "mobile",
  "desktop",
  "extension",
  "realtime",
  "billing",
  "storage",
  "native-subscriptions",
  "electron-updater",
])

export function StackBuilder() {
  const [requested, setRequested] = React.useState<Set<ModuleId>>(
    () => new Set(DEFAULT_SELECTION),
  )
  const [authProvider, setAuthProvider] = React.useState<"clerk" | "authjs">("clerk")
  const [adminMode, setAdminMode] = React.useState<"page" | "app">("page")
  const resolved = resolveModules(requested)
  const activeProductCount = STACK_MODULES.filter((module) =>
    moduleIsVisuallyActive(module.id, resolved),
  ).length
  const baseFlags = orderedProductFlags(resolved).filter(
    (flag) => flag !== "--clerk" && flag !== "--admin-page",
  )
  if (resolved.has("auth")) baseFlags.push(`--${authProvider}`)
  if (resolved.has("admin")) baseFlags.push(`--admin-${adminMode}`)
  const command = `pnpm dlx anhedral@latest init ${baseFlags.join(" ")}`

  function toggleModule(moduleId: ModuleId) {
    if (authProvider === "authjs" && AUTHJS_UNSUPPORTED.has(moduleId)) {
      setAuthProvider("clerk")
    }
    if (moduleId === "admin" && !resolved.has("admin")) setAuthProvider("authjs")
    setRequested((current) => {
      const next = new Set(current)
      const currentResolved = resolveModules(current)

      if (moduleId === "db" && currentResolved.has("postgres")) {
        next.delete("postgres")
        next.add("db")
        return next
      }

      if (moduleId === "postgres" && !currentResolved.has("postgres")) {
        next.delete("db")
        next.add("postgres")
        return next
      }

      if (!currentResolved.has(moduleId)) {
        next.add(moduleId)
        return next
      }

      for (const requestedModule of current) {
        if (moduleDependsOn(requestedModule, moduleId)) {
          next.delete(requestedModule)
        }
      }

      return resolveModules(next).size > 0 ? next : current
    })
  }

  function selectPreset(modules: readonly ModuleId[]) {
    setRequested(new Set(modules))
  }

  function resetSelection() {
    setRequested(new Set(DEFAULT_SELECTION))
    setAuthProvider("clerk")
    setAdminMode("page")
  }

  function chooseAuthProvider(provider: "clerk" | "authjs") {
    setAuthProvider(provider)
    if (provider === "clerk") {
      setRequested((current) => {
        const next = new Set(current)
        next.delete("admin")
        return next
      })
    } else {
      setRequested((current) => {
        const next = new Set(current)
        for (const moduleId of AUTHJS_UNSUPPORTED) next.delete(moduleId)
        return next
      })
    }
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-transparent">
      <AppHeader
        selectedCount={activeProductCount}
        onReset={resetSelection}
      />
      <section className="mx-auto grid w-full max-w-5xl gap-4 px-6 pb-6 md:grid-cols-2">
        <fieldset className="rounded-xl border border-white/10 bg-black/20 p-4">
          <legend className="px-2 text-xs font-medium uppercase tracking-[0.18em] text-white/55">
            Authentication
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["clerk", "authjs"] as const).map((provider) => (
              <button
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  authProvider === provider
                    ? "border-white/50 bg-white text-black"
                    : "border-white/10 text-white/70 hover:border-white/30"
                }`}
                key={provider}
                onClick={() => chooseAuthProvider(provider)}
                type="button"
              >
                {provider === "clerk" ? "Clerk" : "Auth.js"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/45">
            Auth.js currently supports the Next.js, Fastify, database, and admin topology. Native, extension, and provider capabilities require Clerk.
          </p>
        </fieldset>
        <fieldset className="rounded-xl border border-white/10 bg-black/20 p-4">
          <legend className="px-2 text-xs font-medium uppercase tracking-[0.18em] text-white/55">
            Admin structure
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["page", "app"] as const).map((mode) => (
              <button
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  adminMode === mode
                    ? "border-white/50 bg-white text-black"
                    : "border-white/10 text-white/70 hover:border-white/30"
                }`}
                disabled={!resolved.has("admin")}
                key={mode}
                onClick={() => setAdminMode(mode)}
                type="button"
              >
                {mode === "page" ? "(admin) page group" : "Separate admin app"}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
      <StackFlow
        requested={requested}
        resolved={resolved}
        onToggle={toggleModule}
        onSelectPreset={selectPreset}
      />
      <CommandDock command={command} />
    </main>
  )
}
