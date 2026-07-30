import { RotateCcw } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"

interface AppHeaderProps {
  selectedCount: number
  onReset: () => void
}

export function AppHeader({ selectedCount, onReset }: AppHeaderProps) {
  return (
    <header className="relative z-40 border-b border-white/8">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1440px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight text-[#f7f5f0]">
                Anhedral
              </span>
              <span className="rounded border border-[#d9f900]/25 bg-[#d9f900]/8 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.16em] text-[#d9f900]">
                INIT BUILDER
              </span>
            </div>
            <p className="mt-0.5 hidden text-[11px] text-white/42 sm:block">
              Architecture, configured in one command.
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 text-xs text-white/48">
            <span className="size-1.5 animate-[status-pulse_2s_ease-in-out_infinite] rounded-full bg-[#d9f900] shadow-[0_0_0_3px_rgb(217_249_0_/_0.14)]" />
            <span className="font-mono text-white/78">{selectedCount}</span>
            <span className="hidden sm:inline">products active</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-white/55 hover:bg-white/6 hover:text-white"
          >
            <RotateCcw data-icon="inline-start" />
            <span className="hidden sm:inline">Reset</span>
            <span className="sr-only sm:hidden">Reset selection</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
