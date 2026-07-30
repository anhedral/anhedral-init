"use client"

import * as React from "react"
import { Check, Clipboard, Terminal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface CommandDockProps {
  command: string
}

export function CommandDock({ command }: CommandDockProps) {
  const [copied, setCopied] = React.useState(false)
  const copyResetTimer = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current)
      }
    }
  }, [])

  async function copyCommand() {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    if (copyResetTimer.current !== null) {
      window.clearTimeout(copyResetTimer.current)
    }
    copyResetTimer.current = window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section
      aria-labelledby="generated-command-heading"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#06101a]/94 px-4 py-3 shadow-[0_-20px_70px_rgb(0_0_0_/_0.38)] backdrop-blur-xl sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex shrink-0 items-center justify-between gap-3 sm:block">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-[#d9f900]" />
            <h2
              id="generated-command-heading"
              className="font-mono text-[9px] font-semibold tracking-[0.18em] text-white/48"
            >
              GENERATED COMMAND
            </h2>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[8px] text-[#d9f900]/60 sm:mt-1">
            <span className="size-1.5 rounded-full bg-[#d9f900]" />
            UPDATES LIVE
          </span>
        </div>

        <div className="relative min-w-0 flex-1">
          <Input
            value={command}
            readOnly
            aria-label="Generated Anhedral init command"
            onFocus={(event) => event.currentTarget.select()}
            className="h-11 border-white/10 bg-[#02080d]/72 px-3 font-mono text-[10px] text-white/62 shadow-inner selection:bg-[#d9f900]/25 selection:text-white focus-visible:border-[#d9f900]/35 focus-visible:ring-[#d9f900]/10 sm:text-xs"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="lg"
              onClick={copyCommand}
              className="h-11 w-full bg-[#d9f900] px-5 text-[#081019] shadow-[0_0_26px_rgb(217_249_0_/_0.12)] hover:bg-[#ecff2c] sm:w-auto sm:min-w-[116px]"
            >
              {copied ? <Check /> : <Clipboard />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Copy the generated init command
          </TooltipContent>
        </Tooltip>
      </div>
    </section>
  )
}
