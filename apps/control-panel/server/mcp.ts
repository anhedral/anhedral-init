import { readFileSync } from "node:fs";
import {
  McpServer,
  type RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { normalizeObjectSchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
import { z } from "zod";
import { GENERATOR_VERSION } from "../../../src/version.js";
import { registerProject, snapshot, updateSettings } from "./status.js";

export const UI_URI = "ui://anhedral/control-panel.html";
export function createControlServer() {
  const icons = [
    {
      src: `data:image/svg+xml;base64,${readFileSync(new URL("./assets/anhedral.svg", import.meta.url)).toString("base64")}`,
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ];
  const server = new McpServer({
    name: "anhedral",
    version: GENERATOR_VERSION,
    icons,
  });
  new OpenAIExtensions(server);
  const html = readFileSync(
    new URL("./assets/control-panel.html", import.meta.url),
    "utf8",
  );
  registerAppResource(
    server,
    "anhedral-control-panel",
    UI_URI,
    {},
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: { csp: { connectDomains: [], resourceDomains: [] } },
            "openai/ui": {
              preferredDisplayMode: "fullscreen",
              availableDisplayModes: ["inline", "fullscreen", "pip"],
            },
          },
        },
      ],
    }),
  );
  const inputSchema = {
    projectId: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .optional(),
    environment: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,40}$/)
      .default("default"),
    refresh: z.boolean().default(false),
  };
  const open = registerAppTool(
    server,
    "anhedral_open",
    {
      title: "Anhedral",
      description:
        "Open the Anhedral developer control panel: projects, infrastructure, access requirements, local readiness and delivery checks.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        ui: { resourceUri: UI_URI },
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    async ({ projectId, environment, refresh }) => ({
      content: [
        {
          type: "text",
          text: "Anhedral control panel. Local configuration and provider verification are reported separately.",
        },
      ],
      structuredContent: await snapshot(projectId, environment, refresh),
    }),
  );
  const register = server.registerTool(
    "anhedral_register_project",
    {
      title: "Add a project to Anhedral",
      description:
        "Register a local project folder the user selected. Saves only its path and package name in the local Anhedral registry.",
      inputSchema: { folder: z.string().min(1).max(4096) },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ folder }) => {
      const project = registerProject(folder);
      return {
        content: [{ type: "text", text: "Project added." }],
        structuredContent: await snapshot(project.id),
      };
    },
  );
  const settings = server.registerTool(
    "anhedral_update_settings",
    {
      title: "Update project connection settings",
      description:
        "Save non-secret resource identifiers for a registered project and environment. Does not provision resources or store credentials.",
      inputSchema: {
        projectId: z.string().regex(/^[a-f0-9]{16}$/),
        environment: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
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
          .regex(
            /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/,
          )
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ projectId, environment, ...settings }) => {
      updateSettings(projectId, environment, settings);
      return {
        content: [{ type: "text", text: "Connection settings saved." }],
        structuredContent: await snapshot(projectId, environment),
      };
    },
  );
  // SDK 1.32's high-level registration omits standard MCP tool icons.
  const tools: [string, RegisteredTool][] = [
    ["anhedral_open", open],
    ["anhedral_register_project", register],
    ["anhedral_update_settings", settings],
  ];
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools
      .filter(([, tool]) => tool.enabled)
      .map(([name, tool]) => {
        const input = normalizeObjectSchema(tool.inputSchema);
        const output = normalizeObjectSchema(tool.outputSchema);
        return ToolSchema.parse({
          name,
          title: tool.title,
          description: tool.description,
          inputSchema: input
            ? toJsonSchemaCompat(input, {
                strictUnions: true,
                pipeStrategy: "input",
              })
            : { type: "object", properties: {} },
          ...(output
            ? {
                outputSchema: toJsonSchemaCompat(output, {
                  strictUnions: true,
                  pipeStrategy: "output",
                }),
              }
            : {}),
          annotations: tool.annotations,
          execution: tool.execution,
          _meta: tool._meta,
          ...(name === "anhedral_open" ? { icons } : {}),
        });
      }),
  }));
  return server;
}

if (process.argv[1]?.endsWith("server.mjs"))
  await createControlServer().connect(new StdioServerTransport());
