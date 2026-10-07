import { useState } from "react";
import { CATALOG, validatePlan } from "../shared/assembly.js";
import type { Controller } from "./use-control-panel.js";

export function StackChoices({
  selected,
  setSelected,
}: {
  selected: string[];
  setSelected: (value: string[]) => void;
}) {
  return (
    <div className="stack-choices">
      {[...new Set(CATALOG.map((item) => item.group))].map((group) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          {CATALOG.filter((item) => item.group === group).map((item) => (
            <label
              key={item.id}
              className={selected.includes(item.id) ? "selected" : ""}
            >
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              <span>
                <strong>
                  {item.id === "next"
                    ? "Next.js"
                    : item.id === "neon"
                      ? "Neon + Hyperdrive"
                      : item.id}
                </strong>
                <small>{item.purpose}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
export function StackEditor({
  assembly,
  environment,
  project,
  action,
  busy,
}: Controller) {
  const [selected, setSelected] = useState(assembly?.selected || []);
  const [hosting, setHosting] = useState(assembly?.hosting || "cloudflare");
  const [error, setError] = useState("");
  async function save() {
    try {
      validatePlan(selected, hosting);
      setError("");
      await action("anhedral_plan_stack", {
        projectId: project?.id,
        environment,
        revision: assembly?.revision || 0,
        selected,
        hosting,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Review the stack selection.",
      );
    }
  }
  return (
    <details className="stack-editor">
      <summary>
        <strong>Choose stack pieces</strong>
        <span>Only add what the application needs</span>
      </summary>
      <div className="stack-editor-body">
        <StackChoices selected={selected} setSelected={setSelected} />
        <label className="hosting-choice">
          Web hosting
          <select
            value={hosting}
            onChange={(event) =>
              setHosting(event.target.value as typeof hosting)
            }
          >
            <option value="cloudflare">Cloudflare Workers + OpenNext</option>
            <option value="vercel">
              Vercel · architecture approval required
            </option>
          </select>
        </label>
        <p>
          Changing the stack resets checklist evidence for this environment.
          Domain, mail and Containers require agent integration beyond the CLI
          starter.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy} onClick={save}>
          Save stack plan
        </button>
      </div>
    </details>
  );
}
