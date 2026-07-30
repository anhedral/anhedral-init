import {
  siAppstore,
  siClerk,
  siCloudflare,
  siCloudflareworkers,
  siDocker,
  siDrizzle,
  siElectron,
  siExpo,
  siFastify,
  siGithub,
  siGooglechrome,
  siGoogleplay,
  siLetsencrypt,
  siNeon,
  siNextdotjs,
  siNginx,
  siPostgresql,
  siReact,
  siRevenuecat,
  siShadcnui,
  siStripe,
  siTailwindcss,
  siTypescript,
  siUbuntu,
  siVercel,
  siWxt,
  siZod,
  type SimpleIcon,
} from "simple-icons"

type BrandMark = {
  icon: SimpleIcon
  color?: string
}

export type BrandSpec = {
  label: string
  marks: readonly BrandMark[]
  custom?: "ably"
  suffix?: string
}

function mark(icon: SimpleIcon, color?: string): BrandMark {
  return { icon, color }
}

export const BRAND_SPECS = {
  next: {
    label: "Next.js",
    marks: [mark(siNextdotjs, "#f7f5f0")],
  },
  expo: {
    label: "Expo",
    marks: [mark(siExpo, "#f7f5f0")],
  },
  fastify: {
    label: "Fastify",
    marks: [mark(siFastify, "#f7f5f0")],
  },
  electron: {
    label: "Electron",
    marks: [mark(siElectron, "#51dce9")],
  },
  wxt: {
    label: "WXT",
    marks: [mark(siWxt, "#b9f500")],
  },
  "neon-drizzle": {
    label: "Neon and Drizzle",
    marks: [mark(siNeon), mark(siDrizzle)],
  },
  clerk: {
    label: "Clerk",
    marks: [mark(siClerk, "#f7f5f0")],
  },
  ably: {
    label: "Ably",
    marks: [],
    custom: "ably",
  },
  "revenuecat-stripe": {
    label: "RevenueCat and Stripe",
    marks: [mark(siRevenuecat), mark(siStripe)],
  },
  revenuecat: {
    label: "RevenueCat",
    marks: [mark(siRevenuecat)],
  },
  "worker-r2": {
    label: "Cloudflare Worker and R2",
    marks: [mark(siCloudflareworkers), mark(siCloudflare)],
    suffix: "R2",
  },
  "updater-r2": {
    label: "Electron updater, Cloudflare Worker, and R2",
    marks: [mark(siElectron, "#51dce9"), mark(siCloudflareworkers)],
    suffix: "R2",
  },
  ubuntu: {
    label: "Ubuntu",
    marks: [mark(siUbuntu)],
  },
  docker: {
    label: "Docker",
    marks: [mark(siDocker)],
  },
  "postgres-drizzle": {
    label: "PostgreSQL and Drizzle",
    marks: [mark(siPostgresql), mark(siDrizzle)],
  },
  nginx: {
    label: "Nginx",
    marks: [mark(siNginx)],
  },
  certbot: {
    label: "Certbot and Let's Encrypt",
    marks: [mark(siLetsencrypt, "#2e8bff")],
  },
  vercel: {
    label: "Vercel",
    marks: [mark(siVercel, "#f7f5f0")],
  },
  appstore: {
    label: "Apple App Store",
    marks: [mark(siAppstore)],
  },
  googleplay: {
    label: "Google Play",
    marks: [mark(siGoogleplay, "#2bd66f")],
  },
  chrome: {
    label: "Chrome Web Store",
    marks: [mark(siGooglechrome)],
  },
  "cloudflare-vercel": {
    label: "Cloudflare and Vercel",
    marks: [mark(siCloudflare), mark(siVercel, "#f7f5f0")],
  },
  tailwind: {
    label: "Tailwind CSS",
    marks: [mark(siTailwindcss)],
  },
  shadcn: {
    label: "shadcn/ui",
    marks: [mark(siShadcnui, "#f7f5f0")],
  },
  react: {
    label: "React",
    marks: [mark(siReact)],
  },
  typescript: {
    label: "TypeScript",
    marks: [mark(siTypescript)],
  },
  zod: {
    label: "Zod",
    marks: [mark(siZod)],
  },
  github: {
    label: "GitHub",
    marks: [mark(siGithub, "#f7f5f0")],
  },
} as const satisfies Record<string, BrandSpec>

export type BrandId = keyof typeof BRAND_SPECS

const WIDE_BRANDS = new Set<BrandId>([
  "neon-drizzle",
  "postgres-drizzle",
  "revenuecat-stripe",
  "worker-r2",
  "updater-r2",
  "cloudflare-vercel",
])

export function brandUsesWideLockup(brand: BrandId) {
  return WIDE_BRANDS.has(brand)
}

export function brandMarkColor(mark: BrandMark) {
  if (mark.color) return mark.color
  return `#${mark.icon.hex}`
}
