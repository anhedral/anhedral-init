import { useEffect, useState, type FormEvent } from "react";
import type { Snapshot } from "../server/status.js";
import { ask, call, connect, openDashboard } from "./bridge.js";
export function useControlPanel() {
  const [data, setData] = useState<Snapshot>();
  const [tab, setTab] = useState("Overview");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    connect(setData).catch(() =>
      setNotice(
        "Unable to connect to the Anhedral runtime. Reopen the plugin and check its MCP server.",
      ),
    );
  }, []);
  async function action(name: string, args: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      setData(await call(name, args));
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The action could not be completed.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function request(text: string) {
    try {
      setNotice(await ask(text));
    } catch {
      setNotice(
        "Unable to send the request. Open a conversation with Anhedral to continue.",
      );
    }
  }
  const {
    project,
    environment,
    resources,
    capabilities,
    readiness,
    settings,
    connections,
    delivery,
    failed,
    verified,
    context,
  } = viewState(data);
  const navigateProvider = (url: string) => {
    openDashboard(url).catch(() => setNotice("Unable to open this dashboard."));
  };
  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await action("anhedral_register_project", { folder: form.get("folder") })
    )
      setAdding(false);
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      [...form.entries()].filter(([, value]) => value),
    );
    await action("anhedral_update_settings", {
      ...values,
      projectId: project?.id,
      environment,
    });
  }
  return {
    data,
    tab,
    busy,
    notice,
    query,
    adding,
    setTab,
    setNotice,
    setQuery,
    setAdding,
    action,
    request,
    project,
    environment,
    resources,
    capabilities,
    readiness,
    settings,
    connections,
    delivery,
    failed,
    verified,
    context,
    navigateProvider,
    addProject,
    saveSettings,
  };
}
export type Controller = ReturnType<typeof useControlPanel>;

function viewState(data?: Snapshot) {
  const project = data?.project;
  const environment = data?.environment || "default";
  const resources = data?.resources || [];
  const capabilities = data?.capabilities || [];
  const current = data?.project ? data : undefined;
  const readiness = current?.readiness;
  const settings = current?.settings;
  const connections = current?.connections || [];
  const delivery = current?.delivery;
  const failed = readiness?.checks.filter((check) => !check.ok) || [];
  const verified = resources.filter(
    (resource) => resource.status === "verified",
  ).length;
  const context = `Use Anhedral for ${project?.name || "this project"} (registered project ${project?.id || "not selected"}) in the ${environment} environment.`;
  return {
    project,
    environment,
    resources,
    capabilities,
    readiness,
    settings,
    connections,
    delivery,
    failed,
    verified,
    context,
  };
}
