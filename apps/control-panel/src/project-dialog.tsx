import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Controller } from "./use-control-panel.js";
import { StackChoices } from "./stack-editor.js";
import { validatePlan } from "../shared/assembly.js";

export function ProjectDialog({
  setAdding,
  addProject,
  action,
  busy,
  notice,
}: Controller) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState("new");
  const [selected, setSelected] = useState(["next"]);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      validatePlan(selected, "cloudflare");
      setError("");
      const form = new FormData(event.currentTarget);
      if (
        await action("anhedral_create_project", {
          name: form.get("name"),
          folder: form.get("folder"),
          brief: form.get("brief"),
          selected,
          hosting: "cloudflare",
        })
      )
        setAdding(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Review the project plan.",
      );
    }
  }
  return (
    <dialog
      ref={dialog}
      className={`modal ${mode === "new" ? "project-wizard" : ""}`}
      aria-labelledby="add-title"
      onCancel={() => setAdding(false)}
    >
      <button
        className="modal-close"
        aria-label="Close"
        onClick={() => setAdding(false)}
      >
        ×
      </button>
      <h2 id="add-title">Start a project</h2>
      <div className="project-modes">
        <button
          type="button"
          className={`button ${mode === "new" ? "primary" : ""}`}
          aria-pressed={mode === "new"}
          onClick={() => {
            setMode("new");
            setError("");
          }}
        >
          Create new
        </button>
        <button
          type="button"
          className={`button ${mode === "existing" ? "primary" : ""}`}
          aria-pressed={mode === "existing"}
          onClick={() => {
            setMode("existing");
            setError("");
          }}
        >
          Build on existing
        </button>
      </div>
      <p>
        {mode === "new"
          ? "Describe the app and select its starting pieces. Anhedral guides the setup before creating code."
          : "Connect a local folder. Anhedral inspects the project and preserves its existing code."}
      </p>
      {(notice || error) && <p role="alert">{error || notice}</p>}
      <form onSubmit={mode === "new" ? create : addProject}>
        {mode === "new" && (
          <>
            <label>
              Project name
              <input
                name="name"
                required
                maxLength={100}
                autoFocus
                placeholder="My application"
              />
            </label>
            <label>
              What are you building?
              <textarea
                name="brief"
                required
                maxLength={2000}
                rows={3}
                placeholder="Users, workflows and what the app needs to do"
              />
            </label>
          </>
        )}
        <label>
          {mode === "new" ? "New project folder" : "Existing project folder"}
          <input
            name="folder"
            required
            placeholder="/absolute/path/to/project"
          />
        </label>
        {mode === "new" && (
          <details>
            <summary>
              <strong>Starting stack</strong>
              <span>{selected.length} selected · customize</span>
            </summary>
            <StackChoices selected={selected} setSelected={setSelected} />
          </details>
        )}
        <button className="button primary" disabled={busy}>
          {busy
            ? "Saving…"
            : mode === "new"
              ? "Create project plan"
              : "Connect project"}
        </button>
      </form>
    </dialog>
  );
}
