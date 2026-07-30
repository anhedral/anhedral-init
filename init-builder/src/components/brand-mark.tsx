import { cn } from "@/lib/utils"

interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-lg border border-white/15 bg-[#0b1722] shadow-[0_0_24px_rgb(217_249_0_/_0.08)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1820 2199" className="h-5 w-auto" fill="none">
        <path
          d="M1604.59 26.741C1694.33-39.675 1821.31 25.338 1819.89 136.971L1809.28 971.026C1774.28 969.39 1738.87 969.434 1703.15 971.237C1334.16 989.855 1017.8 1191.61 837.641 1484.06L122.496 1416.65C-.793 1405.03-44.685 1247.41 54.854 1173.73L1604.59 26.741Z"
          fill="currentColor"
        />
        <path
          d="M1795.36 2064.84C1793.79 2188.66 1640.25 2245.21 1558.74 2151.98L1083.84 1608.79C1214.01 1305.09 1479.98 1071.11 1809.07 987.262L1795.36 2064.84Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}
