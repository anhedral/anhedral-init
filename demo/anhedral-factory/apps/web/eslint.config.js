import { nextJsConfig } from "@workspace/eslint-config/next-js";
export default [...nextJsConfig, { ignores: [".open-next/**", ".wrangler/**", "cloudflare-env.d.ts"] }];
