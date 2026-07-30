import {
  BRAND_SPECS,
  brandMarkColor,
  type BrandId,
  type BrandSpec,
} from "@/lib/brand-icons"
import { cn } from "@/lib/utils"

interface BrandIconProps {
  brand: BrandId
  size?: "sm" | "md" | "lg"
  className?: string
}

const ICON_SIZE = {
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
} as const

export function BrandIcon({
  brand,
  size = "md",
  className,
}: BrandIconProps) {
  const spec: BrandSpec = BRAND_SPECS[brand]

  if (spec.custom === "ably") {
    return (
      <span
        role="img"
        aria-label={spec.label}
        className={cn("inline-flex items-center justify-center", className)}
      >
        <svg
          viewBox="0 0 78 64"
          className={cn(ICON_SIZE[size], "h-auto")}
          aria-hidden="true"
        >
          <path
            d="M38.572 0 6.296 59.074 0 54.659 29.864 0h8.708Zm.449 0 32.276 59.074 6.296-4.415L47.729 0h-8.708Z"
            fill="#ff4712"
          />
          <path
            d="M70.848 59.421 38.797 34.32 6.745 59.421 13.287 64l25.51-19.971L64.307 64l6.541-4.579Z"
            fill="#ff5416"
          />
        </svg>
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={spec.label}
      className={cn("inline-flex items-center justify-center gap-1.5", className)}
    >
      {spec.marks.map((brandMark, index) => (
        <span
          key={brandMark.icon.slug}
          className="contents"
        >
          {index > 0 ? <span className="h-5 w-px bg-white/12" /> : null}
          <svg
            viewBox="0 0 24 24"
            className={cn(ICON_SIZE[size], "shrink-0")}
            aria-hidden="true"
          >
            <path
              d={brandMark.icon.path}
              fill={brandMarkColor(brandMark)}
            />
          </svg>
        </span>
      ))}
      {spec.suffix ? (
        <span className="font-mono text-[11px] font-bold tracking-[-0.06em] text-white">
          {spec.suffix}
        </span>
      ) : null}
    </span>
  )
}
