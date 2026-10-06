import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import type { Snapshot } from "../server/status.js";

const host = new App({ name: "Anhedral", version: "1.0.0" });
new OpenAIExtensions(host);
const preview = window.parent === window;
export async function call(
  name: string,
  args: Record<string, unknown> = {},
): Promise<Snapshot> {
  if (preview) {
    const response = await fetch("/api/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
    if (!response.ok)
      throw new Error(
        "Unable to complete the action. Check the project path and connection settings.",
      );
    return response.json();
  }
  const response = await host.callServerTool({ name, arguments: args });
  if (response.isError || !response.structuredContent)
    throw new Error("The control panel could not complete this action.");
  return response.structuredContent as Snapshot;
}

export async function connect(receive: (data: Snapshot) => void) {
  if (preview) {
    receive(await call("anhedral_open"));
    return;
  }
  host.ontoolresult = (result) => {
    if (result.structuredContent) receive(result.structuredContent as Snapshot);
  };
  const theme = (context: ReturnType<App["getHostContext"]>) => {
    if (context?.theme) applyDocumentTheme(context.theme);
    if (context?.styles?.variables)
      applyHostStyleVariables(context.styles.variables);
  };
  host.onhostcontextchanged = theme;
  await host.connect();
  theme(host.getHostContext());
}

export async function ask(text: string) {
  if (preview) {
    await navigator.clipboard.writeText(text);
    return "Copied the request. Paste it into Anhedral in ChatGPT.";
  }
  await host.sendMessage({ role: "user", content: [{ type: "text", text }] });
  return "Sent to the conversation.";
}

export async function openDashboard(url: string) {
  const target = new URL(url);
  if (
    target.username ||
    target.password ||
    target.port ||
    target.protocol !== "https:" ||
    !["dash.cloudflare.com", "console.neon.tech", "github.com"].includes(
      target.hostname,
    )
  )
    throw new Error("Dashboard host is not allowed.");
  if (preview) window.open(url, "_blank", "noopener,noreferrer");
  else await host.openLink({ url });
}
