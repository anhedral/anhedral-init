import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { build } from "esbuild";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const output = "plugins/anhedral";
const aliases = {
  "jsonc-parser": path.resolve("node_modules/jsonc-parser/lib/esm/main.js"),
};
mkdirSync(`${output}/assets`, { recursive: true });
mkdirSync(".artifacts/control-panel", { recursive: true });
const stylesheet = "apps/control-panel/src/styles.css";
const compiler = await compile(readFileSync(stylesheet, "utf8"), {
  base: path.dirname(path.resolve(stylesheet)),
  from: path.resolve(stylesheet),
  onDependency() {},
});
const scanner = new Scanner({ sources: compiler.sources });
const compiledCss = compiler.build(scanner.scan());
const browser = await build({
  tsconfig: "apps/control-panel/tsconfig.json",
  plugins: [
    {
      name: "compiled-tailwind",
      setup(builder) {
        builder.onLoad(
          { filter: /apps[\\/]control-panel[\\/]src[\\/]styles\.css$/ },
          () => ({
            contents: compiledCss,
            loader: "css",
          }),
        );
      },
    },
  ],
  entryPoints: ["apps/control-panel/src/App.tsx"],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  target: "es2022",
  outfile: "control-panel.js",
  loader: { ".svg": "text" },
  metafile: true,
});
const javascript = browser.outputFiles
  .find((file) => file.path.endsWith(".js"))
  .text.replaceAll("</script", "<\\/script");
const css = browser.outputFiles
  .find((file) => file.path.endsWith(".css"))
  .text.replaceAll("</style", "<\\/style");
writeFileSync(
  `${output}/assets/control-panel.html`,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Anhedral</title><style>${css}</style></head><body><div id="root"></div><script>${javascript}</script></body></html>\n`,
);
const server = await build({
  entryPoints: ["apps/control-panel/server/mcp.ts"],
  bundle: true,
  minify: true,
  platform: "node",
  alias: aliases,
  format: "esm",
  target: "node20",
  outfile: `${output}/server.mjs`,
  metafile: true,
  banner: {
    js: 'import { createRequire } from "node:module";const require=createRequire(import.meta.url);',
  },
});
// Bundled dependencies retain their upstream notices; normalize generated text only.
const serverPath = `${output}/server.mjs`;
writeFileSync(
  serverPath,
  readFileSync(serverPath, "utf8")
    .replaceAll("\r", "")
    .replace(/[ \t]+$/gm, ""),
);
const licenses = new Map([
  [
    "shadcn@4.21.1 (generated components and CSS)",
    readFileSync("apps/control-panel/src/components/ui/LICENSE.txt", "utf8"),
  ],
]);
for (const input of [
  ...Object.keys(browser.metafile.inputs),
  ...Object.keys(server.metafile.inputs),
  "node_modules/tw-animate-css/dist/tw-animate.css",
  "node_modules/tailwindcss/index.css",
]) {
  if (!input.includes("node_modules/")) continue;
  let directory = path.dirname(path.resolve(input));
  while (
    (!existsSync(path.join(directory, "package.json")) ||
      !JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"))
        .name) &&
    directory !== path.dirname(directory)
  )
    directory = path.dirname(directory);
  const manifest = JSON.parse(
    readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  const license = readdirSync(directory).find((file) =>
    /^licen[cs]e(?:\.|$)/i.test(file),
  );
  if (license)
    licenses.set(
      `${manifest.name}@${manifest.version}`,
      readFileSync(path.join(directory, license), "utf8")
        .replaceAll("\r", "")
        .replace(/[ \t]+$/gm, ""),
    );
}
writeFileSync(
  `${output}/THIRD_PARTY_NOTICES.txt`,
  [...licenses]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, license]) => `${name}\n${license}`)
    .join("\n\n") + "\n",
);
mkdirSync(".artifacts/control-panel", { recursive: true });
await build({
  entryPoints: [
    "apps/control-panel/server/status.ts",
    "apps/control-panel/server/preview.ts",
  ],
  bundle: true,
  platform: "node",
  alias: aliases,
  format: "esm",
  target: "node20",
  outdir: ".artifacts/control-panel",
  banner: {
    js: 'import { createRequire } from "node:module";const require=createRequire(import.meta.url);',
  },
});
console.log("Built the Anhedral MCP runtime and embedded control panel");
