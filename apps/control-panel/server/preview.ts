import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { registerProject, snapshot, updateSettings } from "./status.js";

const port = Number(process.env.ANHEDRAL_PANEL_PORT || 4317);
const origin = `http://127.0.0.1:${port}`;
const identifiers = {
  projectId: z.string().regex(/^[a-f0-9]{16}$/),
  environment: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,40}$/)
    .default("default"),
};
const openInput = z
  .object({
    ...identifiers,
    projectId: identifiers.projectId.optional(),
    refresh: z.boolean().default(false),
  })
  .strict();
const settingsInput = z
  .object({
    ...identifiers,
    cloudflareAccountId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    neonProjectId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
    repository: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/)
      .optional(),
  })
  .strict();
async function dispatch(name: string, input: unknown) {
  if (name === "anhedral_open") {
    const data = openInput.parse(input);
    return snapshot(data.projectId, data.environment, data.refresh);
  }
  if (name === "anhedral_register_project") {
    const data = z
      .object({ folder: z.string().min(1).max(4096) })
      .strict()
      .parse(input);
    return snapshot(registerProject(data.folder).id);
  }
  if (name === "anhedral_update_settings") {
    const { projectId, environment, ...settings } = settingsInput.parse(input);
    updateSettings(projectId, environment, settings);
    return snapshot(projectId, environment);
  }
  throw new Error("Unknown control-panel action.");
}
createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.headers.host !== `127.0.0.1:${port}`) {
    response.writeHead(403).end();
    return;
  }
  if (
    request.method === "GET" &&
    request.url?.split("?")[0] === "/"
  ) {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'self'; frame-ancestors 'none'",
    );
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(readFileSync("plugins/anhedral/assets/control-panel.html"));
    return;
  }
  if (
    request.method !== "POST" ||
    request.url !== "/api/tool" ||
    request.headers.origin !== origin ||
    !request.headers["content-type"]?.startsWith("application/json")
  ) {
    response.writeHead(403).end();
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 16384) throw new Error("Request is too large.");
    }
    const action = z
      .object({
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(JSON.parse(body));
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(await dispatch(action.name, action.arguments)));
  } catch {
    response
      .writeHead(400)
      .end(
        JSON.stringify({ error: "Invalid request or unavailable project." }),
      );
  }
}).listen(port, "127.0.0.1", () => console.log(`Anhedral preview: ${origin}`));
