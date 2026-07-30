"use client"

import { Check, Link2, Plus } from "lucide-react"

import { BrandIcon } from "@/components/brand-icon"
import { brandUsesWideLockup } from "@/lib/brand-icons"
import type { StackModule } from "@/lib/stack-modules"
import { cn } from "@/lib/utils"

interface ModuleCardProps {
  module: StackModule
  active: boolean
  requested: boolean
  emphasized?: boolean
  onToggle: () => void
}

export function ModuleCard({
  module,
  active,
  requested,
  emphasized = false,
  onToggle,
}: ModuleCardProps) {
  const wideLogo = brandUsesWideLockup(module.brand)
  const required = active && !requested

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${active ? "Remove" : "Add"} ${module.title}`}
      onClick={onToggle}
      className={cn(
        "group relative flex min-h-[178px] w-full flex-col overflow-hidden rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow,transform,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        emphasized && "min-h-[196px] sm:p-5",
        active
          ? "border-primary/55 bg-[linear-gradient(145deg,rgb(14_31_44_/_0.98),rgb(8_21_32_/_0.98))] shadow-[0_18px_50px_rgb(0_0_0_/_0.24),inset_0_1px_rgb(255_255_255_/_0.04)]"
          : "border-white/9 bg-[#09141e]/68 opacity-65 hover:-translate-y-0.5 hover:border-white/22 hover:bg-[#0b1925] hover:opacity-100",
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity",
          active ? "opacity-80" : "opacity-0 group-hover:opacity-35",
        )}
      />

      <span className="flex w-full items-start justify-between gap-3">
        <span
          className={cn(
            "relative flex h-14 items-center justify-center rounded-xl border border-white/10 bg-[#050d15] shadow-inner",
            wideLogo ? "w-[104px]" : "w-14",
            emphasized && (wideLogo ? "h-16 w-[120px]" : "size-16"),
          )}
        >
          <BrandIcon
            brand={module.brand}
            size={emphasized || wideLogo ? "lg" : "md"}
          />
          {active ? (
            <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_18px_rgb(217_249_0_/_0.35)]">
              <Check className="size-3" strokeWidth={3} />
            </span>
          ) : null}
        </span>

        <span className="flex items-center gap-2">
          <span className="rounded-md border border-white/9 bg-white/[0.025] px-2 py-1 font-mono text-[8px] tracking-[0.12em] text-white/34">
            --{module.productId}
          </span>
          {!active ? (
            <span className="flex size-7 items-center justify-center rounded-full border border-white/10 text-white/32 transition-colors group-hover:border-primary/35 group-hover:text-primary">
              <Plus className="size-3.5" />
            </span>
          ) : null}
        </span>
      </span>

      <span className="mt-5 block">
        <span className="block text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          {module.title}
        </span>
        <span className="mt-1 block text-[11px] font-medium text-white/48">
          {module.provider}
        </span>
        <span className="mt-2 block text-[11px] leading-[1.55] text-white/34">
          {module.description}
        </span>
      </span>

      <span className="mt-auto flex items-end justify-between gap-3 pt-4">
        <span className="font-mono text-[8px] font-medium tracking-[0.16em] text-white/24">
          {module.eyebrow}
        </span>
        {required ? (
          <span className="flex items-center gap-1 rounded-full border border-[#51dce9]/20 bg-[#51dce9]/6 px-2 py-1 font-mono text-[7px] font-semibold tracking-[0.12em] text-[#51dce9]">
            <Link2 className="size-2.5" />
            REQUIRED
          </span>
        ) : active ? (
          <span className="font-mono text-[8px] font-semibold tracking-[0.14em] text-primary">
            ACTIVE
          </span>
        ) : (
          <span className="font-mono text-[8px] font-semibold tracking-[0.14em] text-white/20">
            SELECT
          </span>
        )}
      </span>
    </button>
  )
}
