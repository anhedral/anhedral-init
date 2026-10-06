import { config } from "@workspace/eslint-config/base";
export default [...config, { ignores: ["dist/**", ".wrangler/**", "worker-configuration.d.ts"] }, { files: ["**/*.ts"], rules: { "no-undef": "off", "no-unused-vars": "off" } }];
