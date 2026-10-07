import { useEffect, useState, type FormEvent } from "react";
import type { Snapshot } from "../server/status.js";
import { ask, call, connect, openDashboard } from "./bridge.js";
export function useControlPanel() {
  const [data, setData] = useState<Snapshot>();
  const [tab, setTab] = useState("Infrastructure");
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
      return true;
    } catch {
      setNotice(
        "Unable to send the request. Open a conversation with Anhedral to continue.",
      );
      return false;
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
  const assembly = data?.project ? data.assembly : undefined;
  const steps = data?.project ? data.checklist : [];
  const nextStep = steps.find((step) => step.status !== "done");
  async function continueStep(stage = nextStep?.id) {
    if (!stage) return;
    const step = steps.find((item) => item.id === stage);
    await request(
      `${context} Continue the ${step?.title} checklist step. Selected stack: ${assembly?.selected.join(", ") || "inspect and propose only necessary pieces"}. Hosting: ${assembly?.hosting}. ${project?.planned ? `New project target: ${project.root}. Brief: ${project.brief}. Never initialize over an existing folder; register the created folder with draftId ${project.id}.` : "Inspect and preserve existing source, Git state and accepted architecture; never reinitialize."} Open the current plan, save or confirm the selected plan with anhedral_plan_stack when its revision is 0; record inspected existing work for required prerequisites before advancing. For unfinished steps, mark active with anhedral_record_progress, perform the selected requirements, and update evidence or blockers as you work. Use anhedral_record_piece to track each selected stack piece with its actual state and non-secret evidence. For completed steps, inspect their evidence without reopening or invalidating it unless a gap is found. Requirements: ${step?.requirements.join("; ")}. Verify client account and environment before provider actions. Respect existing approvals; obtain only missing spending, terms, broader-access or production authority. Never put credentials in progress reports. Do not mark completion from generated configuration alone.`,
    );
  }
  return {
    assembly,
    steps,
    nextStep,
    continueStep,
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
  const context = `Use Anhedral for ${project?.name || "this project"} (project ID ${project?.id || "not selected"}) in the ${environment} environment.`;
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
