import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Snapshot } from "../server/status.js";
import { ask, call, connect } from "./bridge.js";
import { SnapshotGate } from "./snapshot-gate.js";
export function useControlPanel() {
  const [data, setData] = useState<Snapshot>();
  const gate = useRef(new SnapshotGate());
  const operations = useRef(0);
  function beginOperation() {
    operations.current++;
    setBusy(true);
  }
  function finishOperation() {
    operations.current--;
    setBusy(operations.current > 0);
  }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let active = true;
    connect((snapshot, origin) => {
      if (active && gate.current.accept(snapshot, origin)) setData(snapshot);
    }).catch(() =>
      setNotice(
        "Unable to connect to the Anhedral runtime. Reopen the plugin and check its MCP server.",
      ),
    );
    return () => {
      active = false;
    };
  }, []);
  async function action(name: string, args: Record<string, unknown>) {
    const generation = gate.current.begin();
    beginOperation();
    setNotice("");
    try {
      const snapshot = await call(name, args);
      if (gate.current.accept(snapshot, generation)) setData(snapshot);
      return gate.current.isCurrent(generation);
    } catch (error) {
      if (gate.current.isCurrent(generation))
        setNotice(
          error instanceof Error
            ? error.message
            : "The action could not be completed.",
        );
      return false;
    } finally {
      gate.current.finish(generation);
      finishOperation();
    }
  }
  async function request(text: string) {
    beginOperation();
    setNotice("");
    try {
      setNotice(await ask(text));
      return true;
    } catch {
      setNotice(
        "Unable to send the request. Open a conversation with Anhedral to continue.",
      );
      return false;
    } finally {
      finishOperation();
    }
  }
  const project = data?.project;
  const environment = data?.environment || "default";
  const resources = data?.resources || [];
  const assembly = data?.project ? data.assembly : undefined;
  const context = `Use Anhedral for ${project?.name || "this project"} (project ID ${project?.id || "not selected"}) in the ${environment} environment.`;
  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folder = new FormData(event.currentTarget).get("folder");
    if (await action("anhedral_register_project", { folder })) {
      setAdding(false);
      await request(
        `Use Anhedral to inspect the existing project in ${folder}, preserve its code and Git state, and map its actual components and connections with anhedral_update_architecture. Open its current plan first; choose only necessary capabilities. Read any saved anhedral.progress.json, recheck stale source, discovery and provider evidence, and use anhedral_report_project_progress to record the next action and preview links. Do not reinitialize or ship it.`,
      );
    }
  }
  return {
    data,
    busy,
    notice,
    adding,
    setNotice,
    setAdding,
    action,
    request,
    project,
    environment,
    resources,
    assembly,
    context,
    addProject,
  };
}
export type Controller = ReturnType<typeof useControlPanel>;
