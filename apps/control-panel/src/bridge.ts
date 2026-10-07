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
function setTheme(theme: "light" | "dark") {
  applyDocumentTheme(theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}
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

export async function connect(
  receive: (data: Snapshot, origin: "initial" | "notification") => void,
) {
  if (preview) {
    const previewTheme = new URLSearchParams(location.search).get("theme");
    if (previewTheme === "light" || previewTheme === "dark")
      setTheme(previewTheme);
    receive(await call("anhedral_open"), "initial");
    return;
  }
  host.ontoolresult = (result) => {
    if (result.structuredContent)
      receive(result.structuredContent as Snapshot, "notification");
  };
  const theme = (context: ReturnType<App["getHostContext"]>) => {
    if (context?.theme) setTheme(context.theme);
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
  const result = await host.sendMessage({
    role: "user",
    content: [{ type: "text", text }],
  });
  if (result.isError) throw new Error("The host rejected the request.");
  return "Sent to the conversation.";
}

export async function openApp(url: string) {
  const target = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    target.hostname,
  );
  if (
    target.username ||
    target.password ||
    (target.protocol !== "https:" && !(loopback && target.protocol === "http:"))
  )
    throw new Error("Invalid app URL.");
  if (preview) window.open(target.href, "_blank", "noopener,noreferrer");
  else {
    const result = await host.openLink({ url: target.href });
    if (result.isError) throw new Error("The host rejected the app link.");
  }
}
